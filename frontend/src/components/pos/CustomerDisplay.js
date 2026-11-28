import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import logo from '../../asset/images/logo.png';
import { dealHost } from '../../helpers/utils';
import { chargedPrice, shortDate } from '../../helpers/offers';
import './CustomerDisplay.css';

// The screen facing the customer (second monitor, opened by main.js at /#/pos/customer).
// It follows the till: the till sends { display: <content> } on every cart change (see
// displayContent / paidContent in helpers/offers.js), which main.js forwards here.
//   - selling: the items with their pictures, what the offers take off, the total, "add 1 more" hints
//   - paid:    paid, change and savings, for a few seconds
//   - idle:    today's offers marked "show on the customer screen", else a showcase of products

const SHOP = {
    name: 'India Gate',
    street: 'Hobbemaplein 50',
    city: '2526 JB Den Haag',
    phone: '070-3563062',
    tagline: 'Fresh groceries, spices & more',
    thanks: 'Thank you! Visit again!',
};

const ROTATE_MS = 8000; // next offer
const SHOWCASE_MS = 6000; // next featured product
const REFRESH_MS = 60000; // reload the offers
const SHOWCASE_REFRESH_MS = 10 * 60000; // a new random set of products
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

/** A random set of products with a picture, for the idle screen (GET offers/showcase). */
function useShowcase() {
    const [products, setProducts] = useState([]);
    useEffect(() => {
        const load = () => axios.get('offers/showcase').then(({ data }) => setProducts(data.products || [])).catch(() => {});
        load();
        const timer = setInterval(load, SHOWCASE_REFRESH_MS);
        return () => clearInterval(timer);
    }, []);
    return products;
}

function useClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 15000);
        return () => clearInterval(timer);
    }, []);
    return now;
}

const quantityText = (q, unit) => {
    if (unit) {
        if (q < 1) return `${Math.round(q * 1000)} g`;
        return `${Number.isInteger(q) ? q : q.toFixed(3).replace(/0+$/, '')} ${unit}`;
    }
    return Number.isInteger(q) ? String(q) : q.toFixed(2);
};

const greeting = (date) => {
    const h = date.getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** A product's picture, or its first letter on a coloured tile when it has none (or it fails). */
function ProductImage({ image, name, className }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [image]);
    if (!image || failed) {
        const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
        const hue = [...String(name || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 40);
        return (
            <span
                className={`${className} cd-initial`}
                style={{ background: `linear-gradient(135deg, hsl(${hue}, 55%, 52%), hsl(${(hue + 30) % 360}, 60%, 38%))` }}
                aria-hidden="true"
            >
                {letter}
            </span>
        );
    }
    return <img className={className} src={dealHost(image)} alt="" onError={() => setFailed(true)} />;
}

/** Logo, greeting and the time: the top of the idle and paid screens. */
function Header() {
    const now = useClock();
    return (
        <header className="cd-header">
            <img className="cd-header-logo" src={logo} alt={SHOP.name} />
            <div className="cd-header-welcome">
                <span>{greeting(now)}, welcome to</span>
                <strong>{SHOP.name}</strong>
            </div>
            <div className="cd-clock">
                <strong>{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</strong>
                <span>{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </div>
        </header>
    );
}

/** Address and phone on a navy band: the bottom of the idle and paid screens. */
function Ribbon() {
    return (
        <footer className="cd-ribbon">
            <span className="cd-ribbon-tag">{SHOP.tagline}</span>
            <span className="cd-ribbon-dot" aria-hidden="true">✦</span>
            <span>
                {SHOP.street}, {SHOP.city}
            </span>
            <span className="cd-ribbon-dot" aria-hidden="true">✦</span>
            <span>☎ {SHOP.phone}</span>
        </footer>
    );
}

/** Idle without offers: one big featured product and the next ones beside it, taking turns. */
function Showcase({ products, money }) {
    const [index, setIndex] = useState(0);
    useEffect(() => {
        if (products.length < 2) return undefined;
        const timer = setInterval(() => setIndex((i) => (i + 1) % products.length), SHOWCASE_MS);
        return () => clearInterval(timer);
    }, [products.length]);

    if (!products.length) {
        return (
            <section className="cd-body cd-welcome-screen cd-fade">
                <img className="cd-welcome-logo" src={logo} alt={SHOP.name} />
                <p className="cd-welcome-line">{SHOP.tagline}</p>
            </section>
        );
    }
    const at = (offset) => products[(index + offset) % products.length];
    const featured = at(0);
    const next = Array.from({ length: Math.min(6, products.length - 1) }, (_, i) => at(i + 1));

    return (
        <section className="cd-body cd-showcase">
            <div className="cd-feature" key={featured.id}>
                <span className="cd-tag">In our shop</span>
                <div className="cd-feature-photo">
                    <ProductImage className="cd-feature-img" image={featured.image} name={featured.name} />
                </div>
                <div className="cd-feature-text">
                    <h1>{featured.name}</h1>
                    <span className="cd-price-tag">{money(chargedPrice(featured.price))}</span>
                </div>
            </div>
            {next.length ? (
                <div className="cd-shelf">
                    {next.map((p, i) => (
                        <figure key={`${p.id}-${index}`} className="cd-shelf-item" style={{ animationDelay: `${i * 70}ms` }}>
                            <ProductImage className="cd-shelf-img" image={p.image} name={p.name} />
                            <figcaption>
                                <span>{p.name}</span>
                                <b>{money(chargedPrice(p.price))}</b>
                            </figcaption>
                        </figure>
                    ))}
                </div>
            ) : null}
        </section>
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
        <section className="cd-body cd-offer cd-fade" key={offer.id}>
            <div className="cd-offer-top">
                <span className="cd-tag cd-tag--hot">Today's offer</span>
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
                                <ProductImage className="cd-product-img" image={p.image} name={p.name} />
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

function SaleLines({ content, money, itemCount }) {
    const rows = useRef(new Map());

    // The newest item stays in view on long receipts.
    useEffect(() => {
        const row = content.newestKey ? rows.current.get(content.newestKey) : undefined;
        if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [content.newestKey, content.lines.length]);

    return (
        <section className="cd-sale">
            <div className="cd-sale-head">
                <h2>Your items</h2>
                <span className="cd-count">
                    {quantityText(itemCount)} {itemCount === 1 ? 'item' : 'items'}
                </span>
            </div>
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
                        <ProductImage className="cd-thumb" image={l.image} name={l.name} />
                        <div className="cd-line-text">
                            <span className="cd-line-name">
                                {l.name}
                                {l.isReturn ? <em className="cd-return">Return</em> : null}
                            </span>
                            <span className="cd-line-sub">
                                {quantityText(l.quantity, l.unit)} × {money(l.unitPrice)}
                                {l.unit ? ` / ${l.unit}` : ''}
                            </span>
                            {l.discount ? (
                                <span className="cd-line-offer">
                                    🏷 {l.offers.join(', ') || 'Offer'} <b>{money(-l.discount)}</b>
                                </span>
                            ) : null}
                        </div>
                        <b className="cd-line-price">{money(l.gross)}</b>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function SaleTotals({ content, money }) {
    return (
        <aside className="cd-rail">
            <div className="cd-rail-logo">
                <img src={logo} alt={SHOP.name} />
            </div>
            <div className="cd-total">
                <span>Total to pay</span>
                <strong key={content.total}>{money(content.total)}</strong>
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
            <p className="cd-rail-thanks">Thank you for shopping at {SHOP.name}</p>
        </aside>
    );
}

function Paid({ content, money }) {
    const refund = content.total < 0;
    return (
        <section className="cd-body cd-paid cd-fade">
            <svg className="cd-check" viewBox="0 0 52 52" aria-hidden="true">
                <circle className="cd-check-ring" cx="26" cy="26" r="24" />
                <path className="cd-check-mark" d="M15 27 l7 7 l15 -16" />
            </svg>
            <h1>{refund ? `Refunded ${money(-content.total)}` : `Paid ${money(content.paid || content.total)}`}</h1>
            {content.change > 0 ? (
                <div className="cd-change">
                    <span>Your change</span>
                    <strong>{money(content.change)}</strong>
                </div>
            ) : null}
            {content.saved > 0 ? <p className="cd-saving">You saved {money(content.saved)} with our offers</p> : null}
            <p className="cd-bye">{SHOP.thanks}</p>
        </section>
    );
}

export default function CustomerDisplay() {
    const screen = useTillScreen();
    const { offers, categories } = useScreenOffers();
    const showcase = useShowcase();
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

    if (screen.kind === 'sale') {
        const items = screen.content.lines.reduce((n, l) => n + (l.isReturn ? 0 : l.unit ? 1 : l.quantity), 0);
        return (
            <div className="cd cd--sale">
                <SaleLines content={screen.content} money={money} itemCount={items} />
                <SaleTotals content={screen.content} money={money} />
            </div>
        );
    }
    return (
        <div className={`cd cd--${screen.kind}`}>
            <Header />
            {screen.kind === 'paid' ? (
                <Paid content={screen.content} money={money} />
            ) : offer ? (
                <OfferHero offer={offer} index={index % offers.length} count={offers.length} money={money} categories={categories} />
            ) : (
                <Showcase products={showcase} money={money} />
            )}
            <Ribbon />
        </div>
    );
}
