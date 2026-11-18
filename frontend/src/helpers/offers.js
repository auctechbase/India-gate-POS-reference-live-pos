import axios from 'axios';
import { useEffect, useRef, useState } from 'react';

// Offers on the till, the payment screen, the customer display and the Offers admin page.
// The discounts themselves are worked out by the backend (POST /offers/apply,
// backend/utils/offerEngine.js), so every screen shows the same numbers.

export const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const n = parseFloat(String(value).replace(/[^\d,.-]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};
export const round2 = (n) => Math.round((toNumber(n) + Number.EPSILON) * 100) / 100;
/** The unit price the till charges for a cart line, read exactly like the till reads it (helpers/utils f()). */
export const chargedPrice = (price) => {
    const n = parseFloat(typeof price === 'string' ? price.replace(' ', '') : price);
    return Number.isFinite(n) ? n : 0;
};
const symbolOf = (currency) => String(currency ?? '€').trim() || '€';
/** "€2.50", "€5": amounts in offer texts, worded like the backend. */
export const moneyShort = (v, currency = '€') => `${symbolOf(currency)}${Number(v).toFixed(2).replace(/\.00$/, '')}`;

// ---------------------------------------------------------------------------
// The cart
// ---------------------------------------------------------------------------

/** Quick items have no product; items sold by weight ("kg") get their price at the till. */
export const isQuick = (item) => typeof item?.id === 'string' && item.id.startsWith('quick');
export const isWeighed = (item) => Boolean(item?.unit);

/** A key that changes when lines move, so discounts never land on the wrong line while reloading. */
export const lineKey = (item, index) => `${index}:${item?.id}`;

/** The cart lines in the shape POST /offers/apply expects. */
export const applyRequest = (items = []) => ({
    lines: items.map((item, index) => ({
        key: lineKey(item, index),
        // Quick and weighed items never take part in offers.
        product_id: isQuick(item) || isWeighed(item) ? null : item.id,
        quantity: toNumber(item.stock),
        unit_price: chargedPrice(item.price),
        is_return: Boolean(item.return),
    })),
});

export const NO_DISCOUNTS = { byLine: {}, offersByLine: {}, offers: [], total: 0 };

function discountsFrom(result) {
    const byLine = {};
    const offersByLine = {};
    for (const line of result.lines || []) {
        if (!line.discount) continue;
        byLine[line.key] = line.discount;
        offersByLine[line.key] = line.offer_ids || [];
    }
    return { byLine, offersByLine, offers: result.offers || [], total: toNumber(result.totalDiscount) };
}

/** What the offers take off one cart line (0 for returns). */
export const lineDiscount = (discounts, item, index) => (item?.return ? 0 : discounts.byLine[lineKey(item, index)] || 0);

/** Names of the offers that discounted a line, e.g. "Mango 3 for 2". */
export function lineOfferNames(discounts, item, index) {
    const ids = discounts.offersByLine[lineKey(item, index)] || [];
    const names = new Map(discounts.offers.map((o) => [o.id, o.name]));
    return ids.map((id) => names.get(id)).filter(Boolean);
}

/** Total offer discount of a cart (never on returns). */
export const cartDiscount = (discounts, items = []) => round2(items.reduce((sum, item, i) => sum + lineDiscount(discounts, item, i), 0));

/**
 * Discounts for the cart, asked from the backend whenever the lines change. While a new answer
 * is on its way the previous discounts stay visible and `pending` is true.
 */
export function useOfferDiscounts(items) {
    const request = applyRequest(items || []);
    const signature = JSON.stringify(request.lines.map((l) => [l.key, l.product_id, l.quantity, l.unit_price, l.is_return]));
    const [result, setResult] = useState({ signature: '[]', discounts: NO_DISCOUNTS });
    const latest = useRef(signature);
    latest.current = signature;

    useEffect(() => {
        const hasProducts = request.lines.some((l) => l.product_id !== null && !l.is_return);
        if (!hasProducts) {
            setResult({ signature, discounts: NO_DISCOUNTS });
            return undefined;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const { data } = await axios.post('offers/apply', request);
                if (!cancelled && latest.current === signature) setResult({ signature, discounts: discountsFrom(data) });
            } catch (error) {
                // Without an answer the cart is sold at normal prices.
                if (!cancelled) setResult({ signature, discounts: NO_DISCOUNTS });
            }
        }, 120);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    return { discounts: result.discounts, pending: result.signature !== signature };
}

/** Today's offers (with every product id they cover), reloaded every minute. */
export function useActiveOffers() {
    const [offers, setOffers] = useState([]);
    useEffect(() => {
        let alive = true;
        const load = () =>
            axios.get('offers/active')
                .then(({ data }) => alive && setOffers(data.offers || []))
                .catch(() => {});
        load();
        const timer = setInterval(load, 60 * 1000);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, []);
    return offers;
}

/** product id -> the rule of its (first) offer, e.g. "Buy 2 get 1 free", for the till's badges. */
export function offerBadges(offers) {
    const badges = new Map();
    for (const offer of offers) {
        for (const id of offer.covered_product_ids || []) {
            if (!badges.has(id)) badges.set(id, ruleText(offer));
        }
    }
    return badges;
}

// ---------------------------------------------------------------------------
// The customer display
// ---------------------------------------------------------------------------

const setSize = (o) => (o.type === 'free_items' ? o.buy_quantity + (o.free_quantity ?? 0) : o.buy_quantity);

function hintText(o, currency) {
    switch (o.type) {
        case 'free_items':
            return `Add 1 more and get ${o.free_quantity ?? 1} free`;
        case 'percent_off':
            return `Add 1 more and get ${o.value}% off`;
        case 'amount_off':
            return `Add 1 more and save ${moneyShort(o.value ?? 0, currency)}`;
        case 'bundle_price':
            return `Add 1 more: ${o.buy_quantity} for ${moneyShort(o.value ?? 0, currency)}`;
        default:
            return '';
    }
}

/**
 * An offer the customer is one item away from, e.g. "Add 1 more and get 1 free". Counted the way
 * the backend counts (no returns, quick or weighed items, part quantities or zero prices).
 * The offer of the newest product wins when several are close.
 */
export function offerHint(items, offers, newestId, currency) {
    let first = null;
    for (const o of offers) {
        const size = setSize(o);
        if (size < 2) continue; // "buy 1" offers already apply to every item
        const covered = new Set((o.covered_product_ids || []).map(String));
        let units = 0;
        let hasNewest = false;
        for (const item of items) {
            if (item.return || isQuick(item) || isWeighed(item) || !covered.has(String(item.id))) continue;
            const q = toNumber(item.stock);
            if (!Number.isInteger(q) || q < 1 || !(chargedPrice(item.price) > 0)) continue;
            units += q;
            if (String(item.id) === String(newestId)) hasNewest = true;
        }
        if (units === 0 || units % size !== size - 1) continue;
        const hint = { text: hintText(o, currency), offer: o.name };
        if (hasNewest) return hint;
        if (!first) first = hint;
    }
    return first;
}

/** The message the till sends the customer display on every cart change. */
export function displayContent({ items = [], discounts, offers, currency, selected }) {
    const newestIndex = selected >= 0 && selected < items.length ? selected : items.length - 1;
    const newest = items[newestIndex];
    const lines = items.map((item, i) => {
        const quantity = toNumber(item.stock);
        const unitPrice = chargedPrice(item.price);
        const gross = round2(quantity * unitPrice) * (item.return ? -1 : 1);
        const discount = lineDiscount(discounts, item, i);
        return {
            key: lineKey(item, i),
            name: isQuick(item) ? 'Other item' : item.name,
            quantity,
            unit: item.unit || null,
            unitPrice,
            gross,
            discount,
            offers: discount ? lineOfferNames(discounts, item, i) : [],
            isReturn: Boolean(item.return),
        };
    });
    const gross = round2(lines.reduce((s, l) => s + l.gross, 0));
    const discount = round2(lines.reduce((s, l) => s + l.discount, 0));
    return {
        kind: 'cart',
        currency,
        lines,
        total: round2(gross - discount),
        discount,
        newestKey: newest ? lineKey(newest, newestIndex) : null,
        hint: offerHint(items, offers || [], newest?.id, currency),
    };
}

/** Shown on the customer display for a few seconds once a sale is paid. */
export const paidContent = ({ total, paid, saved, currency }) => ({
    kind: 'paid',
    currency,
    total: round2(total),
    paid: round2(paid),
    change: round2(Math.max(0, paid - total)),
    saved: round2(saved),
});

/** Sends a message to the customer display window (inside the POS app only). */
export const sendToDisplay = (content) => window.electronAPI?.reloadWindow({ display: content });

// ---------------------------------------------------------------------------
// The Offers admin page
// ---------------------------------------------------------------------------

/** The four kinds of offer, in the order the admin screen shows them. */
export const OFFER_TYPES = [
    { type: 'free_items', label: 'Buy N get M free', example: 'Buy 2 get 1 free' },
    { type: 'percent_off', label: 'Buy N get % off', example: 'Buy 2 get 20% off' },
    { type: 'amount_off', label: 'Buy N get € off', example: 'Buy 3 get €2 off' },
    { type: 'bundle_price', label: 'N for a fixed price', example: '3 for €5' },
];

export const emptyOffer = () => ({
    name: '',
    type: 'free_items',
    buyQuantity: '2',
    freeQuantity: '1',
    value: '',
    startsOn: '',
    endsOn: '',
    active: true,
    showOnCustomerScreen: true,
    headline: '',
    productIds: [],
    categoryIds: [],
});

export const formFromOffer = (o) => ({
    name: o.name,
    type: o.type,
    buyQuantity: String(o.buy_quantity),
    freeQuantity: o.free_quantity === null ? '1' : String(o.free_quantity),
    value: o.value === null ? '' : String(o.value),
    startsOn: o.starts_on ?? '',
    endsOn: o.ends_on ?? '',
    active: o.active,
    showOnCustomerScreen: o.show_on_customer_screen,
    headline: o.headline ?? '',
    productIds: [...o.product_ids],
    categoryIds: [...o.category_ids],
});

/** The body for POST /offers and PUT /offers/:id. The backend checks every field. */
export function offerPayload(form) {
    const usesValue = form.type !== 'free_items';
    return {
        name: form.name.trim(),
        type: form.type,
        buy_quantity: Number(form.buyQuantity.trim()),
        free_quantity: usesValue ? null : Number(form.freeQuantity.trim()),
        value: usesValue ? form.value.trim().replace(',', '.') : null,
        starts_on: form.startsOn || null,
        ends_on: form.endsOn || null,
        active: form.active,
        show_on_customer_screen: form.showOnCustomerScreen,
        headline: form.headline.trim() || null,
        product_ids: form.productIds,
        category_ids: form.categoryIds,
    };
}

const wholeNumber = (text) => (/^\s*\d+\s*$/.test(text) ? Number(text) : null);
const positiveAmount = (text) => {
    if (!/^\s*\d+([.,]\d+)?\s*$/.test(text)) return null;
    const n = toNumber(text);
    return n > 0 ? n : null;
};

/** The customer-facing text used when no headline is typed (same wording as the backend). */
export function suggestedHeadline(form) {
    const buy = wholeNumber(form.buyQuantity);
    if (!buy) return null;
    switch (form.type) {
        case 'free_items': {
            const free = wholeNumber(form.freeQuantity);
            return free ? `Buy ${buy} get ${free} free` : null;
        }
        case 'percent_off': {
            const pct = positiveAmount(form.value);
            if (pct === null) return null;
            return buy === 1 ? `${pct}% off` : `Buy ${buy} get ${pct}% off`;
        }
        case 'amount_off': {
            const amount = positiveAmount(form.value);
            if (amount === null) return null;
            return buy === 1 ? `${moneyShort(amount)} off` : `Buy ${buy} get ${moneyShort(amount)} off`;
        }
        case 'bundle_price': {
            const price = positiveAmount(form.value);
            return price === null ? null : `${buy} for ${moneyShort(price)}`;
        }
        default:
            return null;
    }
}

/** The rule in words, e.g. "Buy 2 get 1 free". A typed headline is for the customer screen only. */
export const ruleText = (o) =>
    suggestedHeadline({
        type: o.type,
        buyQuantity: String(o.buy_quantity),
        freeQuantity: String(o.free_quantity ?? ''),
        value: o.value === null || o.value === undefined ? '' : String(o.value),
    }) ?? o.display_headline ?? o.name;

/** What an offer covers, e.g. "All of Fruits · Mango, Papaya +3 more"; '' when nothing is left. */
export function targetsText(o, shown = 2) {
    const parts = [];
    if (o.categories.length) parts.push(`All of ${o.categories.map((c) => c.name).join(', ')}`);
    if (o.products.length) {
        const names = o.products.slice(0, shown).map((x) => x.name).join(', ');
        const more = o.products.length - shown;
        parts.push(more > 0 ? `${names} +${more} more` : names);
    }
    return parts.join(' · ');
}

/** running | scheduled | ended | off, on `today` (YYYY-MM-DD, the shop's date). */
export function offerStatus(o, today) {
    if (!o.active) return 'off';
    if (o.starts_on && o.starts_on > today) return 'scheduled';
    if (o.ends_on && o.ends_on < today) return 'ended';
    return 'running';
}

export const STATUS_TEXT = { running: 'Running', scheduled: 'Starts later', ended: 'Ended', off: 'Off' };

const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "31 Oct 2026" from YYYY-MM-DD. */
export const shortDate = (ymd) => {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
};

/** "Always", "From 2 Oct 2026", "Until 31 Oct 2026" or "2 Oct 2026 – 31 Oct 2026". */
export function datesText(o) {
    if (o.starts_on && o.ends_on) return `${shortDate(o.starts_on)} – ${shortDate(o.ends_on)}`;
    if (o.starts_on) return `From ${shortDate(o.starts_on)}`;
    if (o.ends_on) return `Until ${shortDate(o.ends_on)}`;
    return 'Always';
}

/** One complete set at `unitPrice`, worked out in cents like the backend. Null while incomplete. */
export function offerExample(form, unitPrice) {
    const buy = wholeNumber(form.buyQuantity);
    const cents = Math.round(unitPrice * 100);
    if (!buy || !(cents > 0)) return null;

    let units = buy;
    let discount;
    if (form.type === 'free_items') {
        const free = wholeNumber(form.freeQuantity);
        if (!free) return null;
        units = buy + free;
        discount = free * cents; // the cheapest items of the set are free
    } else {
        const value = positiveAmount(form.value);
        if (value === null) return null;
        const total = units * cents;
        if (form.type === 'percent_off') {
            if (value > 100) return null;
            discount = Math.round((total * value) / 100);
        } else if (form.type === 'amount_off') {
            discount = Math.min(Math.round(value * 100), total);
        } else {
            if (buy < 2) return null;
            discount = Math.max(0, total - Math.round(value * 100));
        }
    }
    const full = units * cents;
    return { units, full: full / 100, pays: (full - discount) / 100, saves: discount / 100 };
}

/** Products matching a search by name or barcode; every word must match. */
export function searchProducts(products, query, limit = 40) {
    const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const hits = [];
    for (const p of products) {
        const text = `${p.name ?? ''} ${p.code ?? ''}`.toLowerCase();
        if (words.every((w) => text.includes(w))) {
            hits.push(p);
            if (hits.length >= limit) break;
        }
    }
    return hits;
}
