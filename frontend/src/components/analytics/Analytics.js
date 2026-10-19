import axios from 'axios';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import './Analytics.css';

// Sales analytics shown on top of the Sales page. Data comes from GET /analytics.
// Charts are plain SVG/HTML (no chart library): one series each, so a single blue,
// and every bar has a tap/hover tooltip with the exact value.

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return ymd(d); };

const PERIODS = [
    { key: 'today', label: 'Today', range: () => [shift(0), shift(0)], previous: 'yesterday' },
    { key: 'yesterday', label: 'Yesterday', range: () => [shift(-1), shift(-1)], previous: 'the day before' },
    { key: '7d', label: '7 days', range: () => [shift(-6), shift(0)], previous: 'previous 7 days' },
    { key: '30d', label: '30 days', range: () => [shift(-29), shift(0)], previous: 'previous 30 days' },
    { key: 'month', label: 'This month', range: () => { const d = new Date(); return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), shift(0)]; }, previous: 'same days before' },
];

const compact = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (a >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return `${Math.round(n)}`;
};

function useWidth() {
    const ref = useRef(null);
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        if (!ref.current) return undefined;
        const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, []);
    return [ref, width];
}

function Delta({ now, before, upIsGood = true, label }) {
    if (!before) return <div className="viz-delta viz-delta--flat">no data for {label}</div>;
    const change = (now - before) / Math.abs(before) * 100;
    if (Math.abs(change) < 0.5) return <div className="viz-delta viz-delta--flat"><i className="mdi mdi-minus" />0%<small>vs {label}</small></div>;
    const good = (change > 0) === upIsGood;
    return (
        <div className={`viz-delta ${good ? 'viz-delta--good' : 'viz-delta--bad'}`}>
            <i className={`mdi ${change > 0 ? 'mdi-arrow-up' : 'mdi-arrow-down'}`} />
            {Math.abs(change).toFixed(0)}%<small>vs {label}</small>
        </div>
    );
}

// Column chart: bars <= 24px, 4px rounded tops, hairline gridlines, tooltip on tap/hover.
function Columns({ data, value, label, tip, height = 200 }) {
    const [ref, width] = useWidth();
    const [active, setActive] = useState(null);
    const left = 40, bottom = 26, top = 8;
    const max = Math.max(0, ...data.map(value));
    const niceMax = max <= 0 ? 1 : (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
    const ticks = [0, niceMax / 2, niceMax];
    const plotW = Math.max(0, width - left), plotH = height - bottom - top;
    const band = data.length ? plotW / data.length : 0;
    const barW = Math.min(24, Math.max(2, band - 4));
    const y = v => top + plotH - (Math.max(0, v) / niceMax) * plotH;
    const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44))));

    return (
        <div className="viz-chart" ref={ref} onPointerLeave={() => setActive(null)}>
            {width > 0 && (
                <svg width={width} height={height} role="img">
                    {ticks.map(t => (
                        <g key={t}>
                            <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
                            <text className="viz-axis" x={left - 8} y={y(t) + 4} textAnchor="end">{compact(t)}</text>
                        </g>
                    ))}
                    {data.map((d, i) => {
                        const v = Math.max(0, value(d));
                        const x = left + i * band + (band - barW) / 2;
                        const h = top + plotH - y(v);
                        const r = Math.min(4, h, barW / 2);
                        const yTop = y(v);
                        const path = h <= 0 ? '' : `M${x},${top + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${top + plotH} Z`;
                        return (
                            <g key={i}>
                                <path d={path} fill="var(--series-1)" opacity={active === null || active === i ? 1 : 0.55} />
                                {i % every === 0 && <text className="viz-axis" x={x + barW / 2} y={height - 6} textAnchor="middle">{label(d)}</text>}
                                <rect x={left + i * band} y={top} width={band} height={plotH} fill="transparent"
                                    onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
                            </g>
                        );
                    })}
                </svg>
            )}
            {active !== null && data[active] && (
                <div className="viz-tip" style={{ left: left + active * band + band / 2, top: y(Math.max(0, value(data[active]))) }}>
                    {tip(data[active])}
                </div>
            )}
        </div>
    );
}

// Horizontal bars with the value at the end; the name and value are text, never colored.
function Bars({ rows, format, detail }) {
    const max = Math.max(0, ...rows.map(r => r.revenue));
    if (!rows.length) return <div className="viz-empty">No sales in this period</div>;
    return (
        <div className="viz-bars">
            {rows.map(r => (
                <div className="viz-bar" key={r.name} title={`${r.name}: ${format(r.revenue)}`}>
                    <span className="viz-bar__name">{r.name}</span>
                    <div className="viz-bar__track">
                        <div className={`viz-bar__fill ${r.revenue > 0 ? "viz-bar__fill--some" : ""}`} style={{ width: `${max > 0 ? Math.max(0, r.revenue) / max * 100 : 0}%` }} />
                    </div>
                    <span className="viz-bar__value">{format(r.revenue)}{detail && <small>{detail(r)}</small>}</span>
                </div>
            ))}
        </div>
    );
}

export default function Analytics() {
    const { currency } = useSelector(s => s.auth);
    const [period, setPeriod] = useState(PERIODS[0]);
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const money = v => `${currency || '€ '}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    useEffect(() => {
        let alive = true;
        const [from, to] = period.range();
        setError('');
        axios.get('analytics', { params: { from, to }, headers: { 'pos-token': localStorage.getItem('pos-token') } })
            .then(({ data }) => { if (alive) data.status ? setData(data) : setError(data.message || 'Could not load analytics'); })
            .catch(() => alive && setError('Could not load analytics'));
        return () => { alive = false; };
    }, [period]);

    const s = data?.summary, p = data?.previous;
    const singleDay = data && data.from === data.to;
    const hourRows = data ? data.byHour.filter((h, i, all) => {
        const used = all.filter(x => x.orders > 0).map(x => x.hour);
        const lo = Math.min(8, ...used), hi = Math.max(20, ...used);
        return h.hour >= lo && h.hour <= hi;
    }) : [];

    return (
        <div className="viz-root">
            <div className="viz-head">
                <div>
                    <h2 className="viz-title">Sales overview</h2>
                    {data && <div className="viz-sub">{singleDay ? data.from : `${data.from} – ${data.to}`}</div>}
                </div>
                <div className="viz-periods">
                    {PERIODS.map(pr => (
                        <button key={pr.key} type="button" onClick={() => setPeriod(pr)}
                            className={`viz-period ${period.key === pr.key ? 'viz-period--on' : ''}`}>{pr.label}</button>
                    ))}
                </div>
            </div>

            {error && <div className="viz-card viz-empty">{error}</div>}
            {s && (<>
                <div className="viz-tiles">
                    <div className="viz-card viz-tile--hero">
                        <div className="viz-tile__label">Revenue</div>
                        <div className="viz-tile__value">{money(s.revenue)}</div>
                        <Delta now={s.revenue} before={p.revenue} label={period.previous} />
                    </div>
                    <div className="viz-card">
                        <div className="viz-tile__label">Orders</div>
                        <div className="viz-tile__value">{s.orders.toLocaleString()}</div>
                        <Delta now={s.orders} before={p.orders} label={period.previous} />
                    </div>
                    <div className="viz-card">
                        <div className="viz-tile__label">Average basket</div>
                        <div className="viz-tile__value">{money(s.average)}</div>
                        <Delta now={s.average} before={p.average} label={period.previous} />
                    </div>
                    <div className="viz-card">
                        <div className="viz-tile__label">Items sold</div>
                        <div className="viz-tile__value">{compact(s.itemsSold)}</div>
                        <Delta now={s.itemsSold} before={p.itemsSold} label={period.previous} />
                    </div>
                    <div className="viz-card">
                        <div className="viz-tile__label">Returns</div>
                        <div className="viz-tile__value">{money(Math.abs(s.returns))}</div>
                        <Delta now={Math.abs(s.returns)} before={Math.abs(p.returns)} upIsGood={false} label={period.previous} />
                    </div>
                </div>

                <div className="viz-grid2">
                    <div className="viz-card">
                        {singleDay ? (<>
                            <h3 className="viz-chart-title">Revenue by hour</h3>
                            <div className="viz-chart-sub">When customers come in: plan staff for the busy hours</div>
                            <Columns data={hourRows} value={h => h.revenue} label={h => `${h.hour}h`}
                                tip={h => <><b>{money(h.revenue)}</b>{h.hour}:00–{h.hour + 1}:00 · {h.orders} orders</>} />
                        </>) : (<>
                            <h3 className="viz-chart-title">Revenue per day</h3>
                            <div className="viz-chart-sub">Tap a bar for the exact amount</div>
                            <Columns data={data.byDay} value={d => d.revenue} label={d => d.day.slice(8)}
                                tip={d => <><b>{money(d.revenue)}</b>{d.day} · {d.orders} orders</>} />
                        </>)}
                    </div>
                    <div className="viz-card">
                        <h3 className="viz-chart-title">How customers paid</h3>
                        <div className="viz-chart-sub">Cash should match the drawer count</div>
                        <Bars format={money} rows={[
                            { name: 'Cash', revenue: data.payments.cash },
                            { name: 'Card', revenue: data.payments.card },
                            { name: 'Account', revenue: data.payments.account },
                        ]} detail={r => s.revenue ? `${Math.round(r.revenue / s.revenue * 100)}%` : ''} />
                        {!singleDay && (<>
                            <h3 className="viz-chart-title mt-4">Busiest hours</h3>
                            <div className="viz-chart-sub">Revenue per hour of the day, whole period</div>
                            <Columns height={150} data={hourRows} value={h => h.revenue} label={h => `${h.hour}h`}
                                tip={h => <><b>{money(h.revenue)}</b>{h.hour}:00–{h.hour + 1}:00 · {h.orders} orders</>} />
                        </>)}
                    </div>
                    <div className="viz-card">
                        <h3 className="viz-chart-title">Top products</h3>
                        <div className="viz-chart-sub">By revenue, returns deducted</div>
                        <Bars rows={data.topProducts} format={money} detail={r => `${r.quantity} sold`} />
                    </div>
                    <div className="viz-card">
                        <h3 className="viz-chart-title">Categories</h3>
                        <div className="viz-chart-sub">By revenue, returns deducted</div>
                        <Bars rows={data.categories} format={money} detail={r => s.revenue ? `${Math.round(r.revenue / s.revenue * 100)}%` : ''} />
                    </div>
                </div>
            </>)}
        </div>
    );
}
