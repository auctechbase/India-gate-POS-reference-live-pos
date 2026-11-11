// Runs the POS against a fake website POS API. Run with: npm test (from backend/)
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-website-test-'));
process.env.POS_DATABASE_DIR = path.join(tmp, 'database');
process.env.POS_TMP_DIR = path.join(tmp, 'files');
process.env.POS_PORT = String(5300 + Math.floor(Math.random() * 500));
process.env.POS_WEBSITE_POLL_MS = '3600000'; // the tests trigger syncs themselves

const jwt = require('jsonwebtoken');
const config = require('../config');

const KEY = 'secret-key-1234';
const NEXT = ['confirmed', 'processing', 'cancelled'];

// ---- a tiny fake of the website API ----
const site = { orders: [], time: 1, seenUpdatedSince: [], statusCalls: [] };
const order = (id, status, extra = {}) => ({
    id, order_number: `2026${String(id).padStart(6, '0')}`, status, status_label: status,
    allowed_next_statuses: NEXT, deleted: false, created_at: `2026-11-11T10:0${id}:00+00:00`,
    updated_at: `2026-11-11T10:0${id}:00+00:00`, customer: { id: 1, name: 'Priya', email: 'p@example.com', phone: '06' },
    amounts: { currency: 'EUR', total: '25.50' }, items: [], ...extra,
});
const stamp = () => `2026-11-11T14:00:0${site.time}+00:00`;

const fake = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: 'unauthorized' });
    const p = url.pathname.replace('/api/pos/v1', '');
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
        if (p === '/ping') return send(200, { ok: true, server_time: stamp() });
        if (p === '/orders') {
            const since = url.searchParams.get('updated_since');
            if (since) site.seenUpdatedSince.push(since);
            const perPage = Number(url.searchParams.get('per_page'));
            const page = Number(url.searchParams.get('page') || 1);
            let list = since ? site.orders : site.orders.filter(o => !['delivered', 'cancelled'].includes(o.status) && !o.deleted);
            if (since) list = list.filter(o => o.touched > since || o.touched === undefined);
            const slice = list.slice((page - 1) * 2, page * 2); // 2 per page: forces paging
            return send(200, { data: slice, meta: { current_page: page, last_page: Math.max(1, Math.ceil(list.length / 2)), per_page: perPage, total: list.length, server_time: stamp() } });
        }
        const one = p.match(/^\/orders\/(\d+)$/);
        if (one) {
            const o = site.orders.find(x => x.id === Number(one[1]));
            return o ? send(200, { data: { ...o, status_history: [{ from: null, to: o.status, source: 'customer', changed_by: null, at: o.created_at }] } }) : send(404, { error: 'not_found' });
        }
        const st = p.match(/^\/orders\/(\d+)\/status$/);
        if (st && req.method === 'POST') {
            const body = JSON.parse(raw);
            site.statusCalls.push(body);
            const o = site.orders.find(x => x.id === Number(st[1]));
            if (!o) return send(404, { error: 'not_found' });
            if (body.expected_status && body.expected_status !== o.status) return send(409, { error: 'status_conflict', current_status: o.status, data: o });
            if (!NEXT.includes(body.status)) return send(422, { error: 'invalid_transition', message: 'Not allowed', allowed_next_statuses: NEXT });
            o.status = body.status;
            return send(200, { changed: true, data: { ...o, status_history: [{ from: 'pending', to: body.status, source: 'pos', changed_by: body.changed_by, at: stamp() }] } });
        }
        send(404, { error: 'not_found' });
    });
});

let pos, siteUrl, admin, cashier;
const call = async (method, p, token, body) => {
    const res = await fetch(`http://127.0.0.1:${config.port}${p}`, {
        method, headers: { 'content-type': 'application/json', ...(token ? { 'pos-token': token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { code: res.status, body: await res.json() };
};

test.before(async () => {
    await new Promise(r => fake.listen(0, '127.0.0.1', r));
    siteUrl = `http://127.0.0.1:${fake.address().port}`;
    pos = require('../server');
    await pos.start();
    const mk = async (name, type) => {
        const [id] = await pos.knex('users').insert({ name, email: `${name}@x.nl`, password: 'x', type });
        return jwt.sign({ user: { id } }, config.jwtSecret);
    };
    admin = await mk('Ravi', 'admin');
    cashier = await mk('Sam', 'cashier');
});

test.after(async () => {
    require('../utils/websiteSync').stop();
    fake.close();
    await pos.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('only an admin can see or change the connection', async () => {
    assert.equal((await call('GET', '/website/settings', cashier)).code, 403);
    assert.equal((await call('POST', '/website/settings', cashier, { url: siteUrl, apiKey: KEY })).code, 403);
    assert.equal((await call('GET', '/website/settings')).code, 401);
});

test('a wrong key is reported and nothing is synced', async () => {
    const t = await call('POST', '/website/test', admin, { url: siteUrl, apiKey: 'nope' });
    assert.equal(t.body.ok, false);
    assert.match(t.body.message, /API key/);
    const ok = await call('POST', '/website/test', admin, { url: siteUrl, apiKey: KEY });
    assert.equal(ok.body.ok, true);
});

test('saving the connection syncs all pages and alerts users once per order', async () => {
    site.orders = [order(1, 'pending'), order(2, 'pending'), order(3, 'confirmed')];
    const saved = await call('POST', '/website/settings', admin, { url: siteUrl, apiKey: KEY });
    assert.equal(saved.code, 200);
    assert.equal(saved.body.connected, true);
    assert.equal(saved.body.url, `${siteUrl}/api/pos/v1`);
    assert.equal(JSON.stringify(saved.body).includes(KEY), false, 'the API key must never be sent to the UI');
    assert.equal(saved.body.keyHint, '1234');

    const list = await call('GET', '/website/orders', cashier);
    assert.deepEqual(list.body.orders.map(o => o.id).sort(), [1, 2, 3]);
    assert.equal(JSON.stringify(list.body).includes(KEY), false);

    const notes = await pos.knex('web_notifications').where('user_id', 1);
    assert.equal(notes.length, 1, 'first sync with several pending orders gives one summary alert');
    assert.match(notes[0].content, /2 website orders/);
});

test('later syncs use the server time as the cursor and pick up changes, new orders and deletions', async () => {
    site.time = 2;
    site.orders[0].touched = '2026-11-11T14:00:02+00:00';
    site.orders[0].status = 'cancelled';
    site.orders[1].touched = '2026-11-11T14:00:02+00:00';
    site.orders[1].deleted = true;
    site.orders.push(order(4, 'pending', { touched: '2026-11-11T14:00:02+00:00' }));
    await call('POST', '/website/refresh', cashier);
    assert.deepEqual(site.seenUpdatedSince.at(-1), '2026-11-11T14:00:01+00:00', 'cursor = the website\'s own server_time');

    const ids = (await call('GET', '/website/orders', cashier)).body.orders;
    assert.deepEqual(ids.map(o => o.id).sort(), [1, 3, 4]);
    assert.equal(ids.find(o => o.id === 1).status, 'cancelled');
    const notes = await pos.knex('web_notifications').where('user_id', 1).orderBy('id');
    assert.match(notes.at(-1).content, /New website order #2026000004 \(EUR 25.50\)/);
    assert.equal(notes.length, 2, 'only the genuinely new pending order alerts');
});

test('opening an order brings the status history', async () => {
    const one = await call('GET', '/website/orders/4', cashier);
    assert.equal(one.body.order.status_history[0].source, 'customer');
    assert.equal(one.body.stale, false);
    assert.equal((await call('GET', '/website/orders/999', cashier)).code, 404);
});

test('status change sends expected_status and the cashier name, and saves the answer', async () => {
    const r = await call('POST', '/website/orders/4/status', cashier, { status: 'confirmed' });
    assert.equal(r.code, 200);
    assert.equal(r.body.order.status, 'confirmed');
    assert.deepEqual(site.statusCalls.at(-1), { status: 'confirmed', changed_by: 'Sam', expected_status: 'pending' });
    const list = (await call('GET', '/website/orders', cashier)).body.orders;
    assert.equal(list.find(o => o.id === 4).status, 'confirmed');
});

test('a conflict refreshes the order; a bad move is refused', async () => {
    site.orders.find(o => o.id === 3).status = 'processing'; // changed on the website behind our back
    const conflict = await call('POST', '/website/orders/3/status', cashier, { status: 'cancelled' });
    assert.equal(conflict.code, 409);
    assert.equal(conflict.body.error, 'status_conflict');
    const list = (await call('GET', '/website/orders', cashier)).body.orders;
    assert.equal(list.find(o => o.id === 3).status, 'processing', 'the saved copy was refreshed from the 409');

    const bad = await call('POST', '/website/orders/4/status', cashier, { status: 'delivered' });
    assert.equal(bad.code, 422);
    assert.deepEqual(bad.body.allowed_next_statuses, NEXT);
});

test('when the website is down the saved orders stay and the error is shown', async () => {
    await call('POST', '/website/settings', admin, { url: siteUrl, apiKey: KEY });
    await new Promise(r => fake.close(r));
    const r = await call('POST', '/website/refresh', cashier);
    assert.equal(r.body.connected, false);
    assert.match(r.body.lastError, /Cannot reach the website/);
    assert.ok(r.body.orders.length > 0);
    const change = await call('POST', '/website/orders/4/status', cashier, { status: 'processing' });
    assert.equal(change.code, 502);
});
