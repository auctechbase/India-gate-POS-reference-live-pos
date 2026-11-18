// Offers: the discount rules and the /offers API. Run with: npm test (from backend/)
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-offers-test-'));
process.env.POS_DATABASE_DIR = path.join(tmp, 'database');
process.env.POS_TMP_DIR = path.join(tmp, 'files');
process.env.POS_PORT = String(5900 + Math.floor(Math.random() * 500));
process.env.POS_WEBSITE_POLL_MS = '3600000';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { applyOffers, allocate } = require('../utils/offerEngine');

// ---- the rules ----

const offer = (id, type, buyQuantity, extra = {}) => ({
    id, name: `Offer ${id}`, type, buyQuantity, freeQuantity: null, value: null, productIds: new Set(['1', '2', '3']), ...extra,
});
const line = (key, productId, quantity, unitPrice, isReturn = false) => ({ key, productId, quantity, unitPrice, isReturn });
const byKey = (result) => Object.fromEntries(result.lines.map((l) => [l.key, l.discount]));

test('buy 2 get 1 free: the cheapest item of each set is free, mixed products count', () => {
    const r = applyOffers(
        [line('a', 1, 2, 3), line('b', 2, 1, 2), line('c', 3, 1, 1)],
        [offer(1, 'free_items', 2, { freeQuantity: 1 })]
    );
    // units by price: 3, 3, 2 | 1 → one set (3,3,2): the 2 is free; the 1 pays full price.
    assert.deepEqual(byKey(r), { a: 0, b: 2, c: 0 });
    assert.equal(r.totalDiscount, 2);
    assert.deepEqual(r.offers, [{ id: 1, name: 'Offer 1', sets: 1, discount: 2 }]);
});

test('percent, amount and bundle offers repeat per complete set and split the discount over the lines', () => {
    const pct = applyOffers([line('a', 1, 4, 2.5)], [offer(1, 'percent_off', 2, { value: 20 })]);
    assert.equal(pct.totalDiscount, 2); // 2 sets of €5 → €1 each

    const amt = applyOffers([line('a', 1, 3, 1), line('b', 2, 1, 2)], [offer(1, 'amount_off', 3, { value: 10 })]);
    assert.equal(amt.totalDiscount, 4); // capped at what the set costs (2+1+1)

    const bundle = applyOffers([line('a', 1, 3, 2)], [offer(1, 'bundle_price', 3, { value: 5 })]);
    assert.deepEqual(byKey(bundle), { a: 1 });

    const dearBundle = applyOffers([line('a', 1, 3, 1)], [offer(1, 'bundle_price', 3, { value: 5 })]);
    assert.equal(dearBundle.totalDiscount, 0, 'a bundle price above the normal price gives nothing');

    assert.deepEqual(allocate(100, [{ price: 1 }, { price: 1 }, { price: 1 }]), [34, 33, 33]);
});

test('returns, quick items, part quantities and zero prices never take part', () => {
    const r = applyOffers(
        [line('a', 1, 2, 2, true), line('q', null, 5, 2), line('w', 2, 1.5, 4), line('z', 3, 3, 0)],
        [offer(1, 'free_items', 1, { freeQuantity: 1 })]
    );
    assert.equal(r.totalDiscount, 0);
});

test('overlapping offers: the bigger discount goes first and a unit is used once', () => {
    const r = applyOffers(
        [line('a', 1, 2, 5)],
        [offer(1, 'percent_off', 2, { value: 10 }), offer(2, 'free_items', 1, { freeQuantity: 1 })]
    );
    assert.deepEqual(r.offers.map((o) => o.id), [2]);
    assert.equal(r.totalDiscount, 5);
});

// ---- the API ----

let pos, admin, cashier, ids;
const call = async (method, p, token, body) => {
    const res = await fetch(`http://127.0.0.1:${config.port}${p}`, {
        method, headers: { 'content-type': 'application/json', ...(token ? { 'pos-token': token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { code: res.status, body: await res.json() };
};

test.before(async () => {
    pos = require('../server');
    await pos.start();
    const mk = async (name, type) => {
        const [id] = await pos.knex('users').insert({ name, email: `${name}@x.nl`, password: 'x', type });
        return jwt.sign({ user: { id } }, config.jwtSecret);
    };
    admin = await mk('Ravi', 'admin');
    cashier = await mk('Sam', 'cashier');
    const [fruit] = await pos.knex('product_categories').insert({ name: 'Fruits', status: true });
    const product = async (fields) => (await pos.knex('products').insert({ quantity: '50', pos: true, deleted: false, ...fields }))[0];
    ids = {
        fruit,
        mango: await product({ name: 'Mango', price: '1,50', category_id: fruit, image: 'products/mango.webp' }),
        apple: await product({ name: 'Apple', price: '1', category_id: fruit }),
        rice: await product({ name: 'Rice 5kg', price: '10' }),
        gone: await product({ name: 'Old stock', price: '3', deleted: true }),
    };
});

test.after(async () => {
    await pos.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
});

const threeForTwo = (extra = {}) => ({
    name: 'Mango 3 for 2', type: 'free_items', buy_quantity: 2, free_quantity: 1,
    product_ids: [ids.mango], show_on_customer_screen: true, ...extra,
});

test('only an admin can change offers; the till reads them without logging in', async () => {
    assert.equal((await call('POST', '/offers', cashier, threeForTwo())).code, 403);
    assert.equal((await call('POST', '/offers', null, threeForTwo())).code, 401);
    assert.equal((await call('GET', '/offers/active')).code, 200);
});

test('invalid offers are refused with a clear message', async () => {
    const reject = async (body, message) => {
        const res = await call('POST', '/offers', admin, body);
        assert.equal(res.code, 400, JSON.stringify(res.body));
        assert.match(res.body.message, message);
    };
    await reject(threeForTwo({ product_ids: [] }), /at least one product or category/);
    await reject(threeForTwo({ product_ids: [ids.gone] }), /Unknown products/);
    await reject(threeForTwo({ name: ' ' }), /Name is required/);
    await reject(threeForTwo({ type: 'percent_off', value: 120 }), /percentage/);
    await reject(threeForTwo({ type: 'bundle_price', buy_quantity: 1, value: 2 }), /at least 2 items/);
    await reject(threeForTwo({ starts_on: '2026-11-20', ends_on: '2026-11-01' }), /before the start date/);
});

test('create, apply at the till, switch off, change and delete an offer', async () => {
    const created = await call('POST', '/offers', admin, threeForTwo({ category_ids: [ids.fruit] }));
    assert.equal(created.code, 200, JSON.stringify(created.body));
    const o = created.body.offer;
    assert.equal(o.display_headline, 'Buy 2 get 1 free');
    assert.deepEqual(o.categories, [{ id: ids.fruit, name: 'Fruits' }]);

    const active = await call('GET', '/offers/active');
    assert.deepEqual(active.body.offers[0].covered_product_ids.sort(), [ids.mango, ids.apple].sort());

    const screen = await call('GET', '/offers/customer-screen');
    assert.equal(screen.body.offers[0].headline, 'Buy 2 get 1 free');
    assert.equal(screen.body.offers[0].products[0].name, 'Mango', 'products with a picture first');

    // 2 mangoes (€1.50) + 1 apple (€1) + rice: the apple is the free item.
    const cart = { lines: [
        { key: '0', product_id: ids.mango, quantity: 2, unit_price: '1.50' },
        { key: '1', product_id: ids.apple, quantity: '1', unit_price: '1' },
        { key: '2', product_id: ids.rice, quantity: 1, unit_price: '10' },
        { key: '3', product_id: null, quantity: 1, unit_price: '4' },
    ] };
    const applied = await call('POST', '/offers/apply', null, cart);
    assert.equal(applied.body.totalDiscount, 1);
    assert.deepEqual(applied.body.lines.map((l) => l.discount), [0, 1, 0, 0]);
    assert.deepEqual(applied.body.lines[1].offer_ids, [o.id]);

    const off = await call('PATCH', `/offers/${o.id}`, admin, { active: false });
    assert.equal(off.body.offer.active, false);
    assert.deepEqual(off.body.offer.category_ids, [ids.fruit], 'a switch keeps the products');
    assert.equal((await call('POST', '/offers/apply', null, cart)).body.totalDiscount, 0);

    const later = await call('PUT', `/offers/${o.id}`, admin, { ...threeForTwo(), starts_on: '2999-01-01' });
    assert.equal(later.body.offer.active, true);
    assert.equal((await call('GET', '/offers/active')).body.offers.length, 0, 'an offer that starts later is not running yet');

    const changed = await call('PUT', `/offers/${o.id}`, admin, { name: 'Rice deal', type: 'amount_off', buy_quantity: 1, value: '2,5', product_ids: [ids.rice] });
    assert.equal(changed.body.offer.display_headline, '€2.50 off');
    assert.equal((await call('POST', '/offers/apply', null, cart)).body.totalDiscount, 2.5);

    // A sale made with the offer (what the payment screen saves): the X-report lists the saving as a discount.
    const open = await call('POST', '/pos/opening-day-cash-amount', admin, { cash: '€ 100' });
    const sale = await call('POST', '/orders/create', admin, {
        session_id: 1, cash_register_id: open.body.created.id, amount: 3.5, payment_mode: 'Cash', transaction_type: 'credit',
        modes: { Cash: 3.5 }, returns: 0,
        sessionData: {
            products: [ids.mango, ids.apple], total: '3.50', quantity: { [ids.mango]: 2, [ids.apple]: 1 },
            units: { [ids.mango]: 2, [ids.apple]: 1 }, otherAmount: 0, unit: {}, r: '',
            price: { [ids.mango]: 3, [ids.apple]: 0.5 }, // the apple was €1, the offer took €0.50 off
            discount: 0.5, offers: [{ id: o.id, name: 'Rice deal', sets: 1, discount: 0.5 }],
        },
    });
    assert.equal(sale.body.status, true, JSON.stringify(sale.body));
    const report = await call('POST', '/orders/x-report', admin, { register_id: open.body.created.id, today: true });
    assert.match(report.body.html, /Discounts<\/b>:<\/td><td><\/td><td>€ ?0\.50/);

    assert.equal((await call('DELETE', `/offers/${o.id}`, admin)).code, 200);
    assert.equal((await call('GET', `/offers/${o.id}`, admin)).code, 404);
    assert.equal((await pos.knex('offer_items')).length, 0);
});
