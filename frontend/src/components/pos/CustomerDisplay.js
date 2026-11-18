import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import logo from '../../asset/images/logo.png';
import placeholder from '../../asset/images/default.png';
import { dealHost } from '../../helpers/utils';
import { chargedPrice, shortDate } from '../../helpers/offers';
import './CustomerDisplay.css';

// The screen facing the customer (second monitor, opened by main.js at /#/pos/customer).
// It follows the till: the till sends { display: <content> } on every cart change (see
// displayContent / paidContent in helpers/offers.js), which main.js forwards here.
//   - selling: the items, what the offers take off, the total and "add 1 more" hints
//   - paid:    paid, change and savings, for a few seconds
//   - idle:    today's offers marked "show on the customer screen", taking turns

const SHOP = {
    name: 'India Gate',
    street: 'Hobbemaplein 50',
    city: '2526 JB Den Haag',
    phone: '070-3563062',
    thanks: 'Thank you! Visit again!',
};

const ROTATE_MS = 8000; // next offer
const REFRESH_MS = 60000; // reload the offers
const PAID_MS = 10000; // "paid" stays this long, unless the next customer starts

// Items sold by weight get their price at the till, so their shelf price is not shown.
const WEIGHED_CATEGORIES = ['vegetables', 'sweets'];

function useTillScreen() {
    const [cart, setCart] = useState(null);
    const [paid, setPaid] = useState(null);

    useEffect(() => {
        let timer = 0;
        const onData = (message) => {
            const content = message?.reload ? message.products?.display : null;
            if (!content) return;
            if (content.kind === 'paid') {
                clearTimeout(timer);
                setCart(null); // the sale is over, whatever the till sends next
                setPaid(content);
                timer = setTimeout(() => setPaid(null), PAID_MS);
                return;
            }
            if (!Array.isArray(content.lines)) return;
            setCart(content);
            // The till re-sends its empty cart after a sale; only a new customer ends "paid" early.
            if (content.lines.length) {
                clearTimeout(timer);
                setPaid(null);
            }
        };
        window.electronAPI?.onDataReceived(onData);
        return () => clearTimeout(timer);
    }, []);

    if (cart?.lines.length) return { kind: 'sale', content: cart };
    if (paid) return { kind: 'paid', content: paid };
    return { kind: 'idle' };
}

function useScreenOffers() {
    const [offers, setOffers] = useState([]);
    const [categories, setCategories] = useState(new Map());
    useEffect(() => {
        const load = () => {
            axios.get('offers/customer-screen').then(({ data }) => setOffers(data.offers || [])).catch(() => {});
            axios.get('category')
                .then(({ data }) => setCategories(new Map((data.categories || []).map((c) => [c.id, c.name]))))
                .catch(() => {});
        };
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => clearInterval(timer);
    }, []);
    return { offers, categories };
}

const showPlaceholder = (e) => {
    if (!e.currentTarget.src.endsWith(placeholder)) e.currentTarget.src = placeholder;
};

const quantityText = (q, unit) => {
    if (unit) {
        if (q < 1) return `${Math.round(q * 1000)} g`;
        return `${Number.isInteger(q) ? q : q.toFixed(3).replace(/0+$/, '')} ${unit}`;
    }
    return Number.isInteger(q) ? String(q) : q.toFixed(2);
};

function Brand({ big = false }) {
    return (
        <aside className="cd-side cd-brand">
            <img className={big ? 'cd-brand-logo cd-brand-logo--big' : 'cd-brand-logo'} src={logo} alt={SHOP.name} />
            <div className="cd-welcome">
                <span>Welcome to</span>
                <strong>{SHOP.name}</strong>
            </div>
            <div className="cd-rule" aria-hidden="true" />
            <p className="cd-address">
                {SHOP.street}
                <br />
                {SHOP.city}
            </p>
            <p className="cd-phone">☎ {SHOP.phone}</p>
        </aside>
    );
}

function OfferHero({ offer, index, count, money, categories }) {
    const products = offer.products.slice(0, 6);
    const priceOf = (p) => {
        const price = chargedPrice(p.price);
        const category = String(categories.get(p.category_id) ?? '').trim().toLowerCase();
        const weighed = WEIGHED_CATEGORIES.includes(category) || String(p.name).toLowerCase() === 'paneer';
        return price > 0 && !weighed ? money(price) : null;
    };
    return (
        <section className="cd-main cd-offer cd-fade" key={offer.id}>
            <div className="cd-offer-top">
                <span className="cd-tag">Today's offer</span>
                {count > 1 ? (
                    <span className="cd-dots" aria-label={`Offer ${index + 1} of ${count}`}>
                        {Array.from({ length: count }, (_, i) => <i key={i} className={i === index ? 'on' : ''} />)}
                    </span>
                ) : null}
            </div>
            <h1 className="cd-headline">{offer.headline}</h1>
            <p className="cd-offer-name">
                {offer.name}
                {offer.ends_on ? <span> · until {shortDate(offer.ends_on)}</span> : null}
            </p>
            {products.length ? (
                <div className={`cd-products${products.length > 3 ? ' cd-rows-2' : ''}`} data-count={Math.min(products.length, 3)}>
                    {products.map((p) => {
                        const price = priceOf(p);
                        return (
                            <figure key={p.id} className="cd-product">
                                <img src={p.image ? dealHost(p.image) : placeholder} alt="" onError={showPlaceholder} />
                                <figcaption>
                                    <span className="cd-product-name">{p.name}</span>
                                    {price ? <b>{price}</b> : null}
                                </figcaption>
                            </figure>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}

function Welcome() {
    return (
        <section className="cd-main cd-welcome-screen cd-fade">
            <img className="cd-welcome-logo" src={logo} alt={SHOP.name} />
            <p className="cd-welcome-line">Fresh groceries, spices &amp; more</p>
        </section>
    );
}

function SaleLines({ content, money }) {
    const rows = useRef(new Map());

    // The newest item stays in view on long receipts.
    useEffect(() => {
        const row = content.newestKey ? rows.current.get(content.newestKey) : undefined;
        if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [content.newestKey, content.lines.length]);

    return (
        <section className="cd-main cd-sale">
            <h2 className="cd-heading">Your items</h2>
            <ul className="cd-lines">
                {content.lines.map((l) => (
                    <li
                        key={l.key}
                        ref={(el) => {
                            if (el) rows.current.set(l.key, el);
                            else rows.current.delete(l.key);
                        }}
                        className={`cd-line${l.key === content.newestKey ? ' is-newest' : ''}${l.isReturn ? ' is-return' : ''}`}
                    >
                        <div className="cd-line-main">
                            <span className="cd-line-name">
                                {l.unit ? null : `${quantityText(l.quantity)} × `}
                                {l.name}
                                {l.isReturn ? <em className="cd-return">Return</em> : null}
                            </span>
                            <b>{money(l.gross)}</b>
                        </div>
                        {l.unit || l.quantity !== 1 ? (
                            <div className="cd-line-sub">
                                {quantityText(l.quantity, l.unit)} × {money(l.unitPrice)}
                                {l.unit ? ` / ${l.unit}` : ''}
                            </div>
                        ) : null}
                        {l.discount ? (
                            <div className="cd-line-offer">
                                <span>🏷 {l.offers.join(', ') || 'Offer'}</span>
                                <b>{money(-l.discount)}</b>
                            </div>
                        ) : null}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function SaleTotals({ content, money }) {
    const items = content.lines.reduce((n, l) => n + (l.isReturn ? 0 : l.unit ? 1 : l.quantity), 0);
    return (
        <aside className="cd-side cd-totals">
            <div className="cd-total-box">
                <span>Total</span>
                <strong>{money(content.total)}</strong>
                <small>
                    {quantityText(items)} {items === 1 ? 'item' : 'items'}
                </small>
            </div>
            {content.discount > 0 ? <div className="cd-saving">You save {money(content.discount)}</div> : null}
            {content.hint ? (
                <div className="cd-hint" role="status">
                    <span className="cd-hint-icon" aria-hidden="true">🎁</span>
                    <div>
                        <strong>{content.hint.text}</strong>
                        <span className="cd-hint-offer">{content.hint.offer}</span>
                    </div>
                </div>
            ) : null}
            <img className="cd-side-logo" src={logo} alt={SHOP.name} />
        </aside>
    );
}

function Paid({ content, money }) {
    const refund = content.total < 0;
    return (
        <section className="cd-main cd-paid cd-fade">
            <div className="cd-check" aria-hidden="true">✓</div>
            <h1>{refund ? `Refunded ${money(-content.total)}` : `Paid ${money(content.paid || content.total)}`}</h1>
            {content.change > 0 ? (
                <p className="cd-change">
                    Your change <b>{money(content.change)}</b>
                </p>
            ) : null}
            {content.saved > 0 ? <p className="cd-saving">You saved {money(content.saved)} with our offers</p> : null}
            <p className="cd-bye">{SHOP.thanks}</p>
        </section>
    );
}

export default function CustomerDisplay() {
    const screen = useTillScreen();
    const { offers, categories } = useScreenOffers();
    const { currency: shopCurrency } = useSelector((state) => state.auth);
    const [index, setIndex] = useState(0);

    // Offers take turns while nobody is paying.
    useEffect(() => {
        if (screen.kind !== 'idle' || offers.length < 2) return undefined;
        const timer = setInterval(() => setIndex((i) => (i + 1) % offers.length), ROTATE_MS);
        return () => clearInterval(timer);
    }, [screen.kind, offers.length]);

    const currency = String(screen.content?.currency ?? shopCurrency ?? '€').trim() || '€';
    const money = useMemo(
        () => (n) => (n < 0 ? `−${currency}${(-n).toFixed(2)}` : `${currency}${Number(n).toFixed(2)}`),
        [currency]
    );
    const offer = offers.length ? offers[index % offers.length] : null;

    return (
        <div className="cd">
            {screen.kind === 'sale' ? (
                <>
                    <SaleLines content={screen.content} money={money} />
                    <SaleTotals content={screen.content} money={money} />
                </>
            ) : screen.kind === 'paid' ? (
                <>
                    <Paid content={screen.content} money={money} />
                    <Brand />
                </>
            ) : offer ? (
                <>
                    <OfferHero offer={offer} index={index % offers.length} count={offers.length} money={money} categories={categories} />
                    <Brand />
                </>
            ) : (
                <>
                    <Welcome />
                    <Brand big />
                </>
            )}
        </div>
    );
}
