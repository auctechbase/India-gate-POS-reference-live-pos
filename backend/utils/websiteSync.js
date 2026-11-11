const axios = require('axios');
const { Model } = require('objection');
const User = require('../models/User');
const Notification = require('../models/Notification');
const config = require('../config');

// Keeps the POS in step with the website's POS API (see docs/WEBSITE_SYNC.md):
//  - polls GET /orders?updated_since=<cursor> and mirrors the orders into `web_orders`
//  - sends status changes back with POST /orders/{id}/status
// The cursor is the server's own `meta.server_time`, never this computer's clock.

const POLL_MS = Number(process.env.POS_WEBSITE_POLL_MS) || 7000;
const MAX_BACKOFF_MS = 60000;
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const API_PATH = '/api/pos/v1';
const TERMINAL = ['delivered', 'cancelled', 'returned', 'refunded', 'failed'];
const KEEP_TERMINAL_DAYS = 30;
const SHOW_TERMINAL_DAYS = 14;

const db = () => Model.knex();
const status = { configured: false, connected: false, lastSyncAt: null, lastError: null };
let timer = null;
let running = false;
let stopped = true;
let failures = 0;

// ---- stored settings: url, key and cursor (own table, never sent to the UI) ----

async function getState(key) {
    const row = await db()('website_state').where({ key }).first();
    return row ? row.value : null;
}

async function setState(key, value) {
    if (value === null || value === undefined) return db()('website_state').where({ key }).delete();
    return db()('website_state').insert({ key, value: String(value) }).onConflict('key').merge();
}

// "https://admin.india-gate.nl" and ".../api/pos/v1/" both end up as ".../api/pos/v1".
function normalizeBaseUrl(raw) {
    let value = String(raw || '').trim().replace(/\/+$/, '');
    if (!value) throw new Error('Enter the website address.');
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    let parsed;
    try { parsed = new URL(value); } catch (e) { throw new Error('That website address is not valid.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('The website address must start with https://');
    if (!/\/api\/pos\/v1$/i.test(parsed.pathname)) value += API_PATH;
    return value;
}

async function getConfig() {
    const baseUrl = await getState('WEBSITE_API_URL');
    const key = await getState('WEBSITE_API_KEY');
    return baseUrl && key ? { baseUrl, key } : null;
}

async function getPublicConfig() {
    const baseUrl = await getState('WEBSITE_API_URL');
    const key = await getState('WEBSITE_API_KEY');
    return { url: baseUrl || '', hasKey: Boolean(key), keyHint: key ? key.slice(-4) : '' };
}

async function saveConfig({ url, apiKey }) {
    const baseUrl = normalizeBaseUrl(url);
    const newKey = String(apiKey || '').trim();
    const oldUrl = await getState('WEBSITE_API_URL');
    if (!newKey && !(await getState('WEBSITE_API_KEY'))) throw new Error('Enter the API key.');
    await setState('WEBSITE_API_URL', baseUrl);
    if (newKey) await setState('WEBSITE_API_KEY', newKey);
    // A different website means different orders: start again from a clean copy.
    if (oldUrl && oldUrl !== baseUrl) {
        await setState('WEBSITE_CURSOR', null);
        await db()('web_orders').delete();
    }
    failures = 0;
    status.lastError = null;
    return getPublicConfig();
}

// ---- talking to the website ----

function request(cfg, method, path, { params, data } = {}) {
    return axios({
        method,
        url: cfg.baseUrl + path,
        params,
        data,
        headers: { Authorization: `Bearer ${cfg.key}`, Accept: 'application/json' },
        timeout: config.cloudTimeoutMs,
        validateStatus: () => true, // 409 and 422 carry answers we need to read
    });
}

function describeHttp(res) {
    const apiMessage = res.data && typeof res.data.message === 'string' ? res.data.message : '';
    switch (res.status) {
        case 401: return 'The website rejected the API key.';
        case 429: return 'The website says too many requests; slowing down.';
        case 503: return 'The website has no API key set up yet (POS_API_KEYS).';
        default: return apiMessage || `The website answered with an error (${res.status}).`;
    }
}

function describeNetwork(err) {
    if (err.code === 'ECONNABORTED') return 'The website took too long to answer.';
    return `Cannot reach the website${err.code ? ` (${err.code})` : ''}.`;
}

const httpError = (res) => Object.assign(new Error(describeHttp(res)), { httpStatus: res.status });

// ---- local copy of the orders ----

const parse = (text) => { try { return JSON.parse(text); } catch (e) { return null; } };

// Adds or updates one order by its website id. Returns 'created', 'updated' or 'deleted'.
async function upsertOrder(trx, order) {
    const existing = await trx('web_orders').where({ id: order.id }).first();
    if (order.deleted) {
        if (existing) await trx('web_orders').where({ id: order.id }).delete();
        return 'deleted';
    }
    let data = order;
    // Only the single-order endpoints send status_history. Keep the copy we have while the
    // status is unchanged; once it changes it is stale and the detail view fetches a new one.
    if (existing && !order.status_history && existing.status === order.status) {
        const old = parse(existing.data);
        if (old && old.status_history) data = { ...order, status_history: old.status_history };
    }
    const now = new Date().toISOString();
    const row = { order_number: String(order.order_number ?? ''), status: order.status, data: JSON.stringify(data), updated_at: now };
    if (existing) {
        await trx('web_orders').where({ id: order.id }).update(row);
        return 'updated';
    }
    await trx('web_orders').insert({ id: order.id, ...row, created_at: now });
    return 'created';
}

async function notifyNewOrders(orders, firstSync) {
    if (!orders.length) return;
    const users = await User.query().select('id');
    const messages = firstSync && orders.length > 1
        ? [`${orders.length} website orders are waiting`]
        : orders.map(o => `New website order #${o.order_number}${o.amounts && o.amounts.total ? ` (EUR ${o.amounts.total})` : ''}`);
    for (const content of messages) {
        for (const user of users) {
            await Notification.query().insert({ content, read: false, user_id: user.id });
        }
    }
}

async function applyOrders(orders, firstSync) {
    const newPending = [];
    await db().transaction(async (trx) => {
        for (const order of orders) {
            if (!order || order.id === null || order.id === undefined) continue;
            const result = await upsertOrder(trx, order);
            if (result === 'created' && order.status === 'pending') newPending.push(order);
        }
        const cutoff = new Date(Date.now() - KEEP_TERMINAL_DAYS * 86400000).toISOString();
        await trx('web_orders').whereIn('status', TERMINAL).where('updated_at', '<', cutoff).delete();
    });
    await notifyNewOrders(newPending, firstSync);
}

// ---- the sync loop ----

async function syncOnce() {
    const cfg = await getConfig();
    status.configured = Boolean(cfg);
    if (!cfg) {
        status.connected = false;
        status.lastError = null;
        return;
    }
    const cursor = await getState('WEBSITE_CURSOR');
    // First run: every active order. After that: everything changed since the cursor, in any
    // status, so an order that was delivered or cancelled meanwhile is updated too.
    const params = { per_page: PAGE_SIZE };
    if (cursor) Object.assign(params, { updated_since: cursor, status: 'all' });

    const orders = [];
    let serverTime = null;
    let complete = false;
    for (let page = 1; page <= MAX_PAGES && !complete; page++) {
        const res = await request(cfg, 'get', '/orders', { params: { ...params, page } });
        if (res.status !== 200) throw httpError(res);
        const body = res.data;
        if (!body || !Array.isArray(body.data) || !body.meta) throw new Error('The website sent an answer the POS does not understand.');
        // The cursor comes from the first page: orders changed while paging are read again next time.
        if (serverTime === null) serverTime = body.meta.server_time || null;
        orders.push(...body.data);
        complete = page >= body.meta.last_page;
    }
    if (!complete) throw new Error('The website has too many changed orders to read at once.');

    await applyOrders(orders, !cursor);
    if (serverTime) await setState('WEBSITE_CURSOR', serverTime);
    status.connected = true;
    status.lastSyncAt = new Date().toISOString();
    status.lastError = null;
}

// One sync at a time. Never throws: the result says how the cycle went.
async function runCycle() {
    if (running) return { skipped: true };
    running = true;
    try {
        await syncOnce();
        failures = 0;
        return { ok: true };
    } catch (err) {
        failures += 1;
        status.connected = false;
        status.lastError = err.isAxiosError ? describeNetwork(err) : err.message;
        return { ok: false, httpStatus: err.httpStatus };
    } finally {
        running = false;
    }
}

function schedule(delay) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(tick, delay);
    if (timer.unref) timer.unref();
}

async function tick() {
    const result = await runCycle();
    if (result.ok || result.skipped) return schedule(POLL_MS);
    const backoff = result.httpStatus === 429 ? MAX_BACKOFF_MS : Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
    schedule(backoff);
}

function start() {
    stopped = false;
    schedule(1000);
}

function stop() {
    stopped = true;
    clearTimeout(timer);
}

// For the "refresh" button and right after the settings change.
async function syncNow() {
    const result = await runCycle();
    if (!stopped) schedule(POLL_MS);
    return result;
}

// ---- what the routes use ----

async function listOrders() {
    const rows = await db()('web_orders');
    const cutoff = new Date(Date.now() - SHOW_TERMINAL_DAYS * 86400000).toISOString();
    return rows
        .filter(row => !TERMINAL.includes(row.status) || row.updated_at >= cutoff)
        .map(row => parse(row.data))
        .filter(Boolean)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

const NOT_CONNECTED = { http: 400, body: { status: false, error: 'not_configured', message: 'Connect the website first.' } };

// One order with its status history. Falls back to the saved copy when the website can't be reached.
async function getOrder(id) {
    const cfg = await getConfig();
    const local = await db()('web_orders').where({ id }).first();
    if (!cfg) return local ? { http: 200, body: { status: true, order: parse(local.data), stale: true } } : NOT_CONNECTED;
    let res;
    try {
        res = await request(cfg, 'get', `/orders/${encodeURIComponent(id)}`);
    } catch (err) {
        if (local) return { http: 200, body: { status: true, order: parse(local.data), stale: true } };
        return { http: 502, body: { status: false, error: 'unreachable', message: describeNetwork(err) } };
    }
    if (res.status === 404) {
        await db()('web_orders').where({ id }).delete();
        return { http: 404, body: { status: false, error: 'not_found', message: 'This order no longer exists on the website.' } };
    }
    if (res.status !== 200 || !res.data || !res.data.data) {
        if (local) return { http: 200, body: { status: true, order: parse(local.data), stale: true } };
        return { http: 502, body: { status: false, error: 'website_error', message: describeHttp(res) } };
    }
    await db().transaction(trx => upsertOrder(trx, res.data.data));
    return { http: 200, body: { status: true, order: res.data.data, stale: false } };
}

async function changeStatus(id, newStatus, changedBy) {
    const cfg = await getConfig();
    if (!cfg) return NOT_CONNECTED;
    const local = await db()('web_orders').where({ id }).first();
    const payload = { status: newStatus, changed_by: String(changedBy || '').slice(0, 100) };
    // What this screen shows now: the website refuses with 409 if someone changed it since.
    if (local) payload.expected_status = local.status;

    let res;
    try {
        res = await request(cfg, 'post', `/orders/${encodeURIComponent(id)}/status`, { data: payload });
    } catch (err) {
        return { http: 502, body: { status: false, error: 'unreachable', message: describeNetwork(err) } };
    }
    const body = res.data || {};
    const keep = async (order) => { if (order && order.id !== undefined) await db().transaction(trx => upsertOrder(trx, order)); };

    if (res.status === 200 && body.data) {
        await keep(body.data);
        return { http: 200, body: { status: true, changed: body.changed !== false, order: body.data } };
    }
    if (res.status === 409) {
        await keep(body.data);
        return { http: 409, body: { status: false, error: 'status_conflict', message: 'Someone else changed this order first. It has been refreshed.', order: body.data || null } };
    }
    if (res.status === 422) {
        return { http: 422, body: { status: false, error: 'invalid_transition', message: body.message || 'That status change is not allowed.', allowed_next_statuses: body.allowed_next_statuses || [] } };
    }
    if (res.status === 404) {
        await db()('web_orders').where({ id }).delete();
        return { http: 404, body: { status: false, error: 'not_found', message: 'This order no longer exists on the website.' } };
    }
    return { http: 502, body: { status: false, error: 'website_error', message: describeHttp(res) } };
}

// Tries the address and key from the form (or the saved ones) without saving anything.
async function testConnection({ url, apiKey } = {}) {
    let cfg;
    try {
        const baseUrl = url ? normalizeBaseUrl(url) : await getState('WEBSITE_API_URL');
        const key = String(apiKey || '').trim() || await getState('WEBSITE_API_KEY');
        if (!baseUrl || !key) return { ok: false, message: 'Enter the website address and API key first.' };
        cfg = { baseUrl, key };
    } catch (err) {
        return { ok: false, message: err.message };
    }
    try {
        const res = await request(cfg, 'get', '/ping');
        if (res.status === 200 && res.data && res.data.ok) return { ok: true, message: 'Connected to the website.', serverTime: res.data.server_time };
        return { ok: false, message: describeHttp(res) };
    } catch (err) {
        return { ok: false, message: describeNetwork(err) };
    }
}

module.exports = {
    TERMINAL,
    status,
    start,
    stop,
    syncNow,
    getPublicConfig,
    saveConfig,
    testConnection,
    listOrders,
    getOrder,
    changeStatus,
};
