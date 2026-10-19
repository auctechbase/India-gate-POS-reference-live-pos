import axios from 'axios';
import { useEffect, useState } from 'react';

// Website orders. The website doesn't exist yet: this page shows the connection state and the
// order lists, and reads from GET /website/orders so only the backend needs filling in later.
// Flow planned: website → cloud queue → POS polls, cashier accepts or rejects.
const TABS = [
    { key: 'pending', label: 'New' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'rejected', label: 'Rejected' },
];

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

function Website() {
    const online = useOnline();
    const [tab, setTab] = useState('pending');
    const [state, setState] = useState({ loading: true, connected: false, orders: [] });

    useEffect(() => {
        let alive = true;
        const load = () => axios.get('website/orders')
            .then(({ data }) => alive && setState({ loading: false, connected: Boolean(data.connected), orders: data.orders || [] }))
            .catch(() => alive && setState(s => ({ ...s, loading: false })));
        load();
        const timer = setInterval(load, 30000);
        return () => { alive = false; clearInterval(timer); };
    }, []);

    const orders = state.orders.filter(o => (o.status || 'pending') === tab);

    return (
        <div className="content-wrapper" style={{ width: '100%' }}>
            <div className="card mt-4">
                <div className="card-body" style={{ padding: 28 }}>
                    <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: 16 }}>
                        <h2 className="mb-0" style={{ fontWeight: 700 }}>
                            <i className="mdi mdi-web me-2" />Website orders
                        </h2>
                        <div className="d-flex flex-wrap" style={{ gap: 12 }}>
                            <span style={pill(online)}>
                                <i className={`mdi ${online ? 'mdi-wifi' : 'mdi-wifi-off'}`} />
                                {online ? 'Internet connected' : 'Offline: orders will wait online'}
                            </span>
                            <span style={pill(state.connected)}>
                                <i className={`mdi ${state.connected ? 'mdi-link-variant' : 'mdi-link-variant-off'}`} />
                                {state.connected ? 'Website connected' : 'Website not connected yet'}
                            </span>
                        </div>
                    </div>

                    <div className="d-flex mt-4" style={{ gap: 12 }}>
                        {TABS.map(t => (
                            <button key={t.key} type="button" onClick={() => setTab(t.key)}
                                className={`btn ${tab === t.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                                style={{ minHeight: 56, minWidth: 140, fontSize: '1.1rem', borderRadius: 12 }}>
                                {t.label}
                                <span className="ms-2 badge bg-light text-dark">
                                    {state.orders.filter(o => (o.status || 'pending') === t.key).length}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="mt-4">
                        {state.loading ? null : orders.length === 0 ? (
                            <div className="text-center" style={{ padding: '64px 16px', color: '#6c757d' }}>
                                <i className="mdi mdi-cart-outline" style={{ fontSize: '4rem' }} />
                                <h4 className="mt-3">No website orders here</h4>
                                <p style={{ maxWidth: 520, margin: '8px auto 0' }}>
                                    Orders placed on your website will show up here. If this POS is offline,
                                    they wait online and arrive as soon as the internet is back.
                                </p>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover">
                                    <thead><tr><th>#</th><th>Customer</th><th>Items</th><th>Total</th><th>Placed</th></tr></thead>
                                    <tbody>
                                        {orders.map(o => (
                                            <tr key={o.id} style={{ height: 56 }}>
                                                <td>{o.id}</td>
                                                <td>{o.customer}</td>
                                                <td>{o.items}</td>
                                                <td>{o.total}</td>
                                                <td>{o.created_at}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Website;
