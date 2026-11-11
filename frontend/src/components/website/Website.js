import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from 'reactstrap';
import toast from 'react-hot-toast';

// Website orders. The backend copies them from the website's POS API (backend/utils/websiteSync.js)
// every few seconds; this page lists them, lets the cashier move an order to its next status
// (only the statuses the website allows) and lets an admin set the website address and API key.
const TABS = [
    { key: 'new', label: 'New', statuses: ['pending'] },
    { key: 'active', label: 'In progress', statuses: ['confirmed', 'processing', 'shipped', 'out-for-delivery'] },
    { key: 'done', label: 'Delivered', statuses: ['delivered'] },
    { key: 'closed', label: 'Closed', statuses: ['cancelled', 'returned', 'refunded', 'failed'] },
];

const LABELS = {
    pending: 'Pending', confirmed: 'Confirm', processing: 'Start processing', shipped: 'Mark shipped',
    'out-for-delivery': 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancel order',
    returned: 'Returned', refunded: 'Refunded', failed: 'Failed',
};
// Moves that end an order or can't be taken back ask "are you sure?" first.
const RISKY = ['cancelled', 'failed', 'returned', 'refunded'];

const nice = (s) => LABELS[s] || String(s).replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const euro = (v) => `€ ${v ?? '0.00'}`;
const when = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const errorText = (err, fallback) => (err.response && err.response.data && err.response.data.message) || fallback;

function useOnline() {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const on = () => setOnline(true), off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);
    return online;
}

const pill = (ok) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999,
    fontWeight: 600, background: ok ? '#e6f4ea' : '#fdecea', color: ok ? '#1e7e34' : '#b3261e',
});

const statusColor = (s) => ({
    pending: '#b26a00', confirmed: '#0b5ed7', processing: '#0b5ed7', shipped: '#6f42c1', 'out-for-delivery': '#6f42c1',
    delivered: '#1e7e34', cancelled: '#b3261e', returned: '#b3261e', refunded: '#b3261e', failed: '#b3261e',
}[s] || '#495057');

function StatusBadge({ order }) {
    return (
        <span style={{ color: statusColor(order.status), border: `1px solid ${statusColor(order.status)}`, borderRadius: 999, padding: '2px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {order.status_label || nice(order.status)}
        </span>
    );
}

function ConnectionSettings({ onSaved, onClose }) {
    const [form, setForm] = useState({ url: '', apiKey: '' });
    const [saved, setSaved] = useState({ hasKey: false, keyHint: '' });
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        axios.get('website/settings')
            .then(({ data }) => { setForm(f => ({ ...f, url: data.url || '' })); setSaved({ hasKey: data.hasKey, keyHint: data.keyHint }); })
            .catch(() => { });
    }, []);

    const test = async () => {
        setBusy(true); setResult(null);
        try {
            const { data } = await axios.post('website/test', form);
            setResult({ ok: data.ok, message: data.message });
        } catch (err) {
            setResult({ ok: false, message: errorText(err, 'The test failed.') });
        }
        setBusy(false);
    };

    const save = async () => {
        setBusy(true); setResult(null);
        try {
            const { data } = await axios.post('website/settings', form);
            toast.success(data.connected ? 'Website connected!' : 'Saved. The website did not answer yet.');
            setSaved({ hasKey: data.hasKey, keyHint: data.keyHint });
            setForm(f => ({ ...f, url: data.url, apiKey: '' }));
            if (!data.connected && data.lastError) setResult({ ok: false, message: data.lastError });
            onSaved();
        } catch (err) {
            setResult({ ok: false, message: errorText(err, 'Could not save.') });
        }
        setBusy(false);
    };

    return (
        <div className="card mt-4" style={{ background: '#f8f9fa' }}>
            <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4 className="mb-0">Website connection</h4>
                    <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
                </div>
                <div className="row g-3">
                    <div className="col-md-6">
                        <label className="form-label fw-bold">Website address</label>
                        <input className="form-control form-control-lg" placeholder="https://admin.india-gate.nl" value={form.url}
                            onChange={e => setForm({ ...form, url: e.target.value })} autoCapitalize="none" autoComplete="off" />
                    </div>
                    <div className="col-md-6">
                        <label className="form-label fw-bold">API key</label>
                        <input className="form-control form-control-lg" type="password" autoComplete="new-password"
                            placeholder={saved.hasKey ? `Saved (ends in ${saved.keyHint}). Leave empty to keep it.` : 'Paste the POS API key'}
                            value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} />
                    </div>
                </div>
                {result && (
                    <div className={`alert mt-3 mb-0 ${result.ok ? 'alert-success' : 'alert-danger'}`}>{result.message}</div>
                )}
                <div className="d-flex mt-3" style={{ gap: 12 }}>
                    <button type="button" className="btn btn-outline-primary" style={{ minHeight: 52, minWidth: 160 }} disabled={busy} onClick={test}>Test connection</button>
                    <button type="button" className="btn btn-primary" style={{ minHeight: 52, minWidth: 160 }} disabled={busy} onClick={save}>Save</button>
                </div>
            </div>
        </div>
    );
}

function OrderModal({ orderId, summary, onClose, onChanged }) {
    const [order, setOrder] = useState(summary);
    const [stale, setStale] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        axios.get(`website/orders/${orderId}`)
            .then(({ data }) => { if (alive) { setOrder(data.order); setStale(Boolean(data.stale)); } })
            .catch(err => { if (alive) { toast.error(errorText(err, 'Could not load the order.')); onClose(); } });
        return () => { alive = false; };
    }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

    const move = async (status) => {
        if (RISKY.includes(status) && !window.confirm(`${nice(status)}? This is hard to undo.`)) return;
        setBusy(true);
        try {
            const { data } = await axios.post(`website/orders/${orderId}/status`, { status });
            setOrder(data.order);
            toast.success(`Order is now ${data.order.status_label || nice(data.order.status)}`);
        } catch (err) {
            toast.error(errorText(err, 'Could not change the status.'));
            if (err.response && err.response.data && err.response.data.order) setOrder(err.response.data.order);
        }
        setBusy(false);
        onChanged();
    };

    const o = order || {};
    const c = o.customer || {};
    const d = o.delivery || {};
    const a = o.amounts || {};
    const next = o.allowed_next_statuses || [];

    return (
        <Modal isOpen toggle={onClose} size="lg" scrollable>
            <ModalHeader toggle={onClose}>
                Order #{o.order_number} <span className="ms-2"><StatusBadge order={o} /></span>
            </ModalHeader>
            <ModalBody>
                {stale && <div className="alert alert-warning">The website could not be reached. This is the last saved copy.</div>}
                <div className="row g-3">
                    <div className="col-md-6">
                        <h6>Customer</h6>
                        <div>{c.name}</div>
                        <div>{c.phone}</div>
                        <div>{c.email}</div>
                    </div>
                    <div className="col-md-6">
                        <h6>{d.method === 'pickup' ? 'Pickup' : 'Delivery'}</h6>
                        {d.method === 'pickup' ? <div>Customer collects in the shop</div> : (
                            <>
                                <div>{d.address}</div>
                                <div>{[d.zip, d.city].filter(Boolean).join(' ')}</div>
                                {d.zone && <div className="text-muted">Zone: {d.zone}</div>}
                            </>
                        )}
                        <div className="text-muted mt-1">Payment: {(o.payment || {}).mode} ({(o.payment || {}).status})</div>
                    </div>
                </div>

                <table className="table mt-3">
                    <thead><tr><th>Item</th><th className="text-end">Qty</th><th className="text-end">Price</th><th className="text-end">Total</th></tr></thead>
                    <tbody>
                        {(o.items || []).map((it, i) => (
                            <tr key={i}>
                                <td>{it.title}{it.weight_label ? ` (${it.weight_label})` : ''}</td>
                                <td className="text-end">{it.quantity}</td>
                                <td className="text-end">{euro(it.unit_price)}</td>
                                <td className="text-end">{euro(it.line_total)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr><td colSpan="3" className="text-end">Subtotal</td><td className="text-end">{euro(a.subtotal)}</td></tr>
                        <tr><td colSpan="3" className="text-end">Delivery</td><td className="text-end">{euro(a.delivery_fee)}</td></tr>
                        {Number(a.discount) > 0 && <tr><td colSpan="3" className="text-end">Discount{a.coupon_code ? ` (${a.coupon_code})` : ''}</td><td className="text-end">- {euro(a.discount)}</td></tr>}
                        {Number(a.loyalty_discount) > 0 && <tr><td colSpan="3" className="text-end">Loyalty points</td><td className="text-end">- {euro(a.loyalty_discount)}</td></tr>}
                        <tr style={{ fontWeight: 700 }}><td colSpan="3" className="text-end">Total</td><td className="text-end">{euro(a.total)}</td></tr>
                    </tfoot>
                </table>

                {(o.status_history || []).length > 0 && (
                    <>
                        <h6>History</h6>
                        <ul className="list-unstyled mb-0">
                            {o.status_history.map((h, i) => (
                                <li key={i} className="text-muted">
                                    {when(h.at)}: {h.from ? `${nice(h.from)} → ` : ''}{nice(h.to)} ({h.source}{h.changed_by ? `, ${h.changed_by}` : ''})
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </ModalBody>
            <ModalFooter style={{ gap: 8, flexWrap: 'wrap' }}>
                {next.length === 0 && <span className="text-muted me-auto">No further status changes.</span>}
                {next.map(s => (
                    <button key={s} type="button" disabled={busy || stale}
                        className={`btn ${RISKY.includes(s) ? 'btn-outline-danger' : s === 'delivered' ? 'btn-success' : 'btn-primary'}`}
                        style={{ minHeight: 56, minWidth: 140, fontSize: '1.05rem', borderRadius: 12 }}
                        onClick={() => move(s)}>
                        {nice(s)}
                    </button>
                ))}
                <button type="button" className="btn btn-outline-secondary" style={{ minHeight: 56, borderRadius: 12 }} onClick={onClose}>Close</button>
            </ModalFooter>
        </Modal>
    );
}

function Website() {
    const online = useOnline();
    const [tab, setTab] = useState('new');
    const [state, setState] = useState({ loading: true, configured: false, connected: false, lastSyncAt: null, lastError: null, orders: [] });
    const [isAdmin, setIsAdmin] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [openId, setOpenId] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const seenPending = useRef(null);

    const apply = useCallback((data) => {
        const orders = data.orders || [];
        // Tell the cashier when a new order lands while this page is open (not on first load).
        const pending = orders.filter(o => o.status === 'pending').map(o => o.id);
        if (seenPending.current) {
            const fresh = orders.filter(o => o.status === 'pending' && !seenPending.current.has(o.id));
            if (fresh.length) toast.success(fresh.length === 1 ? `New website order #${fresh[0].order_number}` : `${fresh.length} new website orders`, { duration: 8000 });
        }
        seenPending.current = new Set(pending);
        setState({
            loading: false, configured: Boolean(data.configured), connected: Boolean(data.connected),
            lastSyncAt: data.lastSyncAt || null, lastError: data.lastError || null, orders,
        });
    }, []);

    const load = useCallback(() => axios.get('website/orders').then(({ data }) => apply(data)).catch(() => setState(s => ({ ...s, loading: false }))), [apply]);

    useEffect(() => {
        load();
        const timer = setInterval(load, 5000);
        return () => clearInterval(timer);
    }, [load]);

    // Only an admin may open the settings: the backend answers 403 to everyone else.
    useEffect(() => {
        axios.get('website/settings').then(() => setIsAdmin(true)).catch(() => setIsAdmin(false));
    }, []);

    useEffect(() => {
        if (isAdmin && !state.loading && !state.configured) setShowSettings(true);
    }, [isAdmin, state.loading, state.configured]);

    const refresh = async () => {
        setRefreshing(true);
        try { apply((await axios.post('website/refresh')).data); } catch (err) { toast.error(errorText(err, 'Refresh failed.')); }
        setRefreshing(false);
    };

    const current = TABS.find(t => t.key === tab);
    const count = (t) => state.orders.filter(o => t.statuses.includes(o.status)).length;
    const orders = state.orders.filter(o => current.statuses.includes(o.status));
    const openOrder = state.orders.find(o => o.id === openId);

    return (
        <div className="content-wrapper" style={{ width: '100%' }}>
            <div className="card mt-4">
                <div className="card-body" style={{ padding: 28 }}>
                    <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: 16 }}>
                        <h2 className="mb-0" style={{ fontWeight: 700 }}>
                            <i className="mdi mdi-web me-2" />Website orders
                        </h2>
                        <div className="d-flex flex-wrap align-items-center" style={{ gap: 12 }}>
                            <span style={pill(online)}>
                                <i className={`mdi ${online ? 'mdi-wifi' : 'mdi-wifi-off'}`} />
                                {online ? 'Internet connected' : 'Offline'}
                            </span>
                            <span style={pill(state.connected)}>
                                <i className={`mdi ${state.connected ? 'mdi-link-variant' : 'mdi-link-variant-off'}`} />
                                {state.connected ? 'Website connected' : state.configured ? 'Website not reachable' : 'Website not connected yet'}
                            </span>
                            <button type="button" className="btn btn-outline-primary" style={{ minHeight: 44 }} disabled={refreshing || !state.configured} onClick={refresh}>
                                <i className="mdi mdi-refresh me-1" />Refresh
                            </button>
                            {isAdmin && (
                                <button type="button" className="btn btn-outline-secondary" style={{ minHeight: 44 }} onClick={() => setShowSettings(s => !s)}>
                                    <i className="mdi mdi-cog me-1" />Connection
                                </button>
                            )}
                        </div>
                    </div>

                    {state.lastError && state.configured && (
                        <div className="alert alert-warning mt-3 mb-0">
                            {state.lastError} Orders shown below are the last ones received.
                        </div>
                    )}

                    {showSettings && <ConnectionSettings onSaved={load} onClose={() => setShowSettings(false)} />}

                    <div className="d-flex flex-wrap mt-4" style={{ gap: 12 }}>
                        {TABS.map(t => (
                            <button key={t.key} type="button" onClick={() => setTab(t.key)}
                                className={`btn ${tab === t.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                                style={{ minHeight: 56, minWidth: 140, fontSize: '1.1rem', borderRadius: 12 }}>
                                {t.label}
                                <span className="ms-2 badge bg-light text-dark">{count(t)}</span>
                            </button>
                        ))}
                    </div>

                    <div className="mt-4">
                        {state.loading ? null : orders.length === 0 ? (
                            <div className="text-center" style={{ padding: '64px 16px', color: '#6c757d' }}>
                                <i className="mdi mdi-cart-outline" style={{ fontSize: '4rem' }} />
                                <h4 className="mt-3">{state.configured ? 'No website orders here' : 'Connect the website to receive orders'}</h4>
                                <p style={{ maxWidth: 520, margin: '8px auto 0' }}>
                                    {state.configured
                                        ? 'Orders placed on your website show up here within a few seconds. If this POS is offline, they wait on the website and arrive as soon as the internet is back.'
                                        : isAdmin ? 'Enter the website address and API key above.' : 'Ask an admin to enter the website address and API key.'}
                                </p>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover">
                                    <thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Items</th><th>Total</th><th>Placed</th><th>Status</th></tr></thead>
                                    <tbody>
                                        {orders.map(o => (
                                            <tr key={o.id} style={{ height: 56, cursor: 'pointer' }} onClick={() => setOpenId(o.id)}>
                                                <td>#{o.order_number}</td>
                                                <td>{(o.customer || {}).name}</td>
                                                <td>{(o.delivery || {}).method === 'pickup' ? 'Pickup' : 'Delivery'}</td>
                                                <td>{(o.items || []).reduce((n, it) => n + Number(it.quantity || 0), 0)}</td>
                                                <td>{euro((o.amounts || {}).total)}</td>
                                                <td>{when(o.created_at)}</td>
                                                <td><StatusBadge order={o} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {openId !== null && (
                <OrderModal key={openId} orderId={openId} summary={openOrder} onClose={() => setOpenId(null)} onChanged={load} />
            )}
        </div>
    );
}

export default Website;
