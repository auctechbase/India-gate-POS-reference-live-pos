const { Model } = require('objection');
const { getCurrentDate } = require('../utils');
const { toNumber } = require('./money');
const { applyOffers, OFFER_TYPES } = require('./offerEngine');

// Offers: stored in `offers` + `offer_items` (see migrations/zz_offers_tables.js), applied to the
// till's cart by utils/offerEngine.js. The till asks POST /offers/apply on every cart change.

const db = () => Model.knex();
const CACHE_MS = 30 * 1000;
const SYMBOL = '€';

class OfferError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
const invalid = (message) => new OfferError(message);

// ---- checking what the admin screen sends ----

function wholeNumber(value, label, min, max) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${label} must be a whole number from ${min} to ${max}`);
    return n;
}

function amount(value, label, max) {
    const n = Number(String(value ?? '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n > max) throw invalid(`${label} must be more than 0 and at most ${max}`);
    return Math.round(n * 100) / 100;
}

function flag(value, label, fallback) {
    if (value === undefined || value === null) return fallback;
    if ([true, 'true', 1, '1'].includes(value)) return true;
    if ([false, 'false', 0, '0'].includes(value)) return false;
    throw invalid(`${label} must be true or false`);
}

function date(value, label) {
    if (value === undefined || value === null || value === '') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    const parsed = match && new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
    if (!parsed || parsed.getUTCMonth() !== +match[2] - 1 || parsed.getUTCDate() !== +match[3]) {
        throw invalid(`${label} must be a date like 2026-10-31`);
    }
    return String(value);
}

function idList(value, label) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw invalid(`${label} must be a list`);
    const ids = [...new Set(value.map(Number))];
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw invalid(`${label} contains an invalid id`);
    return ids;
}

/** Checks a whole offer and returns the row to store plus its products/categories. */
function validate(input) {
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 120) throw invalid('Name is required (at most 120 characters)');
    const type = input.type;
    if (!OFFER_TYPES.includes(type)) throw invalid(`Type must be one of: ${OFFER_TYPES.join(', ')}`);

    const buyQuantity = wholeNumber(input.buy_quantity, 'Buy quantity', 1, 999);
    let freeQuantity = null;
    let value = null;
    if (type === 'free_items') freeQuantity = wholeNumber(input.free_quantity, 'Free quantity', 1, 999);
    if (type === 'percent_off') value = amount(input.value, 'Discount percentage', 100);
    if (type === 'amount_off') value = amount(input.value, 'Discount amount', 99999);
    if (type === 'bundle_price') {
        if (buyQuantity < 2) throw invalid('A bundle needs at least 2 items');
        value = amount(input.value, 'Bundle price', 99999);
    }

    const startsOn = date(input.starts_on, 'Start date');
    const endsOn = date(input.ends_on, 'End date');
    if (startsOn && endsOn && endsOn < startsOn) throw invalid('End date is before the start date');

    const headline = input.headline === undefined || input.headline === null ? null : String(input.headline).trim() || null;
    if (headline && headline.length > 120) throw invalid('Headline is at most 120 characters');

    const productIds = idList(input.product_ids, 'Products');
    const categoryIds = idList(input.category_ids, 'Categories');
    if (!productIds.length && !categoryIds.length) throw invalid('Choose at least one product or category');

    return {
        record: {
            name,
            type,
            buy_quantity: buyQuantity,
            free_quantity: freeQuantity,
            value,
            starts_on: startsOn,
            ends_on: endsOn,
            active: flag(input.active, 'Active', true),
            show_on_customer_screen: flag(input.show_on_customer_screen, 'Show on customer screen', false),
            headline,
        },
        links: { productIds, categoryIds },
    };
}

const money = (v) => `${SYMBOL}${Number(v).toFixed(2).replace(/\.00$/, '')}`;

/** Customer-facing text when the admin did not type one, e.g. "Buy 2 get 1 free". */
function defaultHeadline(o) {
    switch (o.type) {
        case 'free_items':
            return `Buy ${o.buy_quantity} get ${o.free_quantity} free`;
        case 'percent_off':
            return o.buy_quantity === 1 ? `${o.value}% off` : `Buy ${o.buy_quantity} get ${o.value}% off`;
        case 'amount_off':
            return o.buy_quantity === 1 ? `${money(o.value)} off` : `Buy ${o.buy_quantity} get ${money(o.value)} off`;
        case 'bundle_price':
            return `${o.buy_quantity} for ${money(o.value)}`;
        default:
            return o.name;
    }
}

// ---- database ----

const toBool = (value) => value === true || Number(value) === 1;
const num = (value) => (value === null || value === undefined ? null : Number(value));

/** Offer rows with their products and categories (names included). */
async function hydrate(rows) {
    if (!rows.length) return [];
    const links = await db()('offer_items').whereIn('offer_id', rows.map((r) => r.id));
    const productIds = [...new Set(links.filter((l) => l.product_id != null).map((l) => Number(l.product_id)))];
    const categoryIds = [...new Set(links.filter((l) => l.category_id != null).map((l) => Number(l.category_id)))];
    const [products, categories] = await Promise.all([
        productIds.length ? db()('products').whereIn('id', productIds).where('deleted', false).select('id', 'name', 'image', 'price') : [],
        categoryIds.length ? db()('product_categories').whereIn('id', categoryIds).select('id', 'name') : [],
    ]);
    const productById = new Map(products.map((p) => [Number(p.id), { id: Number(p.id), name: p.name, image: p.image, price: p.price }]));
    const categoryById = new Map(categories.map((c) => [Number(c.id), { id: Number(c.id), name: c.name }]));

    return rows.map((row) => {
        const own = links.filter((l) => Number(l.offer_id) === Number(row.id));
        const productList = own.map((l) => productById.get(Number(l.product_id))).filter(Boolean);
        const categoryList = own.map((l) => categoryById.get(Number(l.category_id))).filter(Boolean);
        const offer = {
            id: Number(row.id),
            name: row.name,
            type: row.type,
            buy_quantity: Number(row.buy_quantity),
            free_quantity: num(row.free_quantity),
            value: num(row.value),
            starts_on: row.starts_on || null,
            ends_on: row.ends_on || null,
            active: toBool(row.active),
            show_on_customer_screen: toBool(row.show_on_customer_screen),
            headline: row.headline ?? null,
            product_ids: productList.map((p) => p.id),
            category_ids: categoryList.map((c) => c.id),
            products: productList,
            categories: categoryList,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
        return { ...offer, display_headline: offer.headline || defaultHeadline(offer) };
    });
}

async function insertLinks(trx, offerId, { productIds, categoryIds }) {
    const rows = [
        ...productIds.map((id) => ({ offer_id: offerId, product_id: id, category_id: null })),
        ...categoryIds.map((id) => ({ offer_id: offerId, product_id: null, category_id: id })),
    ];
    if (rows.length) await trx('offer_items').insert(rows);
}

async function checkLinks({ productIds, categoryIds }) {
    const [products, categories] = await Promise.all([
        productIds.length ? db()('products').whereIn('id', productIds).where('deleted', false).pluck('id') : [],
        categoryIds.length ? db()('product_categories').whereIn('id', categoryIds).pluck('id') : [],
    ]);
    const missingProducts = productIds.filter((id) => !products.map(Number).includes(id));
    const missingCategories = categoryIds.filter((id) => !categories.map(Number).includes(id));
    if (missingProducts.length) throw invalid(`Unknown products: ${missingProducts.join(', ')}`);
    if (missingCategories.length) throw invalid(`Unknown categories: ${missingCategories.join(', ')}`);
}

// Today's offers with every product they cover, kept for a short while so pricing a cart
// needs no database round trip. Any change to an offer clears it.
let cache = null;
const invalidate = () => { cache = null; };

async function active() {
    const today = getCurrentDate('ymd');
    if (cache && cache.today === today && Date.now() - cache.at < CACHE_MS) return cache.value;

    const rows = await db()('offers')
        .where('active', true)
        .where((q) => q.whereNull('starts_on').orWhere('starts_on', '').orWhere('starts_on', '<=', today))
        .where((q) => q.whereNull('ends_on').orWhere('ends_on', '').orWhere('ends_on', '>=', today))
        .orderBy('id');
    const offers = await hydrate(rows);
    const productIds = [...new Set(offers.flatMap((o) => o.product_ids))];
    const categoryIds = [...new Set(offers.flatMap((o) => o.category_ids))];
    const products = productIds.length || categoryIds.length
        ? await db()('products')
            .where('deleted', false)
            .where((q) => {
                if (productIds.length) q.whereIn('id', productIds);
                if (categoryIds.length) q.orWhereIn('category_id', categoryIds);
            })
            .select('id', 'category_id', 'name', 'image', 'price')
        : [];

    const value = offers.map((o) => {
        const covered = products.filter((p) => o.product_ids.includes(Number(p.id)) || o.category_ids.includes(Number(p.category_id)));
        return {
            ...o,
            covered: covered.map((c) => ({
                id: Number(c.id),
                name: c.name,
                image: c.image,
                price: c.price,
                category_id: c.category_id === null || c.category_id === undefined ? null : Number(c.category_id),
            })),
            productIds: new Set(covered.map((c) => String(c.id))),
        };
    });
    cache = { at: Date.now(), today, value };
    return value;
}

async function get(id) {
    const row = await db()('offers').where('id', Number(id)).first();
    if (!row) throw new OfferError('Offer not found', 404);
    return (await hydrate([row]))[0];
}

module.exports = {
    OfferError,
    defaultHeadline,
    validate,

    list: async () => hydrate(await db()('offers').orderBy('id', 'desc')),

    get,

    async create(input) {
        const { record, links } = validate(input || {});
        await checkLinks(links);
        const id = await db().transaction(async (trx) => {
            const [created] = await trx('offers').insert(record);
            const offerId = typeof created === 'object' ? created.id : created;
            await insertLinks(trx, offerId, links);
            return offerId;
        });
        invalidate();
        return get(id);
    },

    /** `partial` (PATCH) keeps every field that is not sent, e.g. { active: false }. */
    async update(id, input, { partial = false } = {}) {
        const sent = input && typeof input === 'object' ? input : {};
        const existing = await get(id);
        const { record, links } = validate(partial ? { ...existing, ...sent } : sent);
        const linksChanged = !partial || 'product_ids' in sent || 'category_ids' in sent;
        if (linksChanged) await checkLinks(links);
        await db().transaction(async (trx) => {
            await trx('offers').where('id', existing.id).update({ ...record, updated_at: trx.fn.now() });
            if (!linksChanged) return;
            await trx('offer_items').where('offer_id', existing.id).delete();
            await insertLinks(trx, existing.id, links);
        });
        invalidate();
        return get(id);
    },

    async remove(id) {
        const existing = await get(id);
        await db().transaction(async (trx) => {
            await trx('offer_items').where('offer_id', existing.id).delete();
            await trx('offers').where('id', existing.id).delete();
        });
        invalidate();
    },

    /** For the till: today's offers and every product id each one covers. */
    async listActive() {
        return (await active()).map(({ productIds, covered, ...o }) => ({
            ...o,
            covered_product_ids: [...productIds].map(Number),
        }));
    },

    /** For the customer display: offers marked to be shown, with up to 6 products each (pictures first). */
    async customerScreen() {
        return (await active())
            .filter((o) => o.show_on_customer_screen)
            .map((o) => ({
                id: o.id,
                name: o.name,
                headline: o.display_headline,
                type: o.type,
                ends_on: o.ends_on,
                products: [...o.covered].sort((a, b) => Boolean(b.image) - Boolean(a.image)).slice(0, 6),
            }));
    },

    /**
     * Applies today's offers to a cart. `lines` are [{ key, product_id, quantity, unit_price, is_return }]
     * with the prices being charged.
     */
    async apply(lines) {
        if (!Array.isArray(lines)) throw invalid('lines must be a list');
        const cart = lines.map((line, index) => ({
            key: String(line.key ?? index),
            productId: line.product_id ?? null,
            quantity: line.quantity,
            unitPrice: toNumber(line.unit_price),
            isReturn: Boolean(line.is_return),
        }));
        const offers = (await active()).map((o) => ({
            id: o.id,
            name: o.name,
            type: o.type,
            buyQuantity: o.buy_quantity,
            freeQuantity: o.free_quantity,
            value: o.value,
            productIds: o.productIds,
        }));
        return applyOffers(cart, offers);
    },

    invalidate,
};
