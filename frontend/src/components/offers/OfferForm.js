import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import TouchKeyboard from '../common/TouchKeyboard';
import {
    emptyOffer, formFromOffer, OFFER_TYPES, offerExample, offerPayload, searchProducts, suggestedHeadline, chargedPrice,
} from '../../helpers/offers';
import { errorText, Switch } from './Offers';
import './Offers.css';

const SEARCH_LIMIT = 40;
const KEYBOARD = {
    name: { layout: 'text', label: 'Offer name' },
    buyQuantity: { layout: 'integer', label: 'Number of items' },
    freeQuantity: { layout: 'integer', label: 'Free items' },
    value: { layout: 'decimal', label: 'Amount' },
    headline: { layout: 'text', label: 'Headline on the customer screen' },
    search: { layout: 'text', label: 'Search products' },
};

/** Create (/offers/new) or change (/offers/:id) an offer. */
export default function OfferForm() {
    const { id } = useParams();
    const editing = id !== undefined && id !== 'new';
    const navigate = useNavigate();
    const { currency, hasKeyboard } = useSelector((state) => state.auth);
    const symbol = String(currency ?? '€').trim() || '€';
    const money = (n) => `${symbol}${Number(n).toFixed(2)}`;

    const [form, setForm] = useState(editing ? null : emptyOffer());
    const [knownNames, setKnownNames] = useState(new Map());
    const [products, setProducts] = useState([]);
    const [productsLoaded, setProductsLoaded] = useState(false);
    const [categories, setCategories] = useState([]);
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState('');
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        axios.get('products')
            .then(({ data }) => setProducts(data.products || []))
            .catch((err) => setError(`Products could not be loaded: ${errorText(err)}`))
            .finally(() => setProductsLoaded(true));
        axios.get('category?list=true').then(({ data }) => setCategories(data.categories || [])).catch(() => {});
    }, []);

    useEffect(() => {
        if (!editing) return;
        axios.get(`offers/${id}`)
            .then(({ data }) => {
                setForm(formFromOffer(data.offer));
                setKnownNames(new Map(data.offer.products.map((p) => [p.id, p.name])));
            })
            .catch((err) => setError(errorText(err)));
    }, [editing, id]);

    const set = (change) => setForm((f) => (f ? { ...f, ...change } : f));

    // A barcode scanned outside a text box adds that product to the offer.
    useEffect(() => {
        let buffer = '';
        const onKey = (event) => {
            const active = document.activeElement;
            if (active && ['INPUT', 'TEXTAREA'].includes(active.tagName)) return;
            if (event.key === 'Enter') {
                const code = buffer.trim();
                buffer = '';
                if (!code) return;
                const product = products.find((p) => String(p.code ?? '') === code);
                if (!product) {
                    toast.error(`No product with barcode ${code}`);
                    return;
                }
                setForm((f) => (f && !f.productIds.includes(product.id) ? { ...f, productIds: [...f.productIds, product.id] } : f));
                toast.success(`${product.name} added`);
            } else if (event.key.length === 1) {
                buffer += event.key;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [products]);

    const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
    const results = useMemo(() => searchProducts(products, query, SEARCH_LIMIT), [products, query]);

    // The example uses a chosen product's price (or one from a chosen category).
    const sample = useMemo(() => {
        if (!form) return null;
        for (const pid of form.productIds) {
            const p = byId.get(pid);
            if (p && chargedPrice(p.price) > 0) return p;
        }
        for (const cid of form.categoryIds) {
            const p = products.find((x) => x.category_id === cid && chargedPrice(x.price) > 0);
            if (p) return p;
        }
        return null;
    }, [form, products, byId]);

    const save = async (e) => {
        e.preventDefault();
        if (!form) return;
        setSaving(true);
        setError(null);
        try {
            const body = offerPayload(form);
            if (editing) await axios.put(`offers/${id}`, body);
            else await axios.post('offers', body);
            toast.success(`"${body.name}" saved`);
            navigate('/offers');
        } catch (err) {
            setError(errorText(err));
            setSaving(false);
        }
    };

    if (!form) {
        return (
            <div className="content-wrapper offers-page">
                {error ? <div className="alert alert-danger">{error}</div> : <p className="text-muted">Loading…</p>}
            </div>
        );
    }

    const headline = suggestedHeadline(form);
    const example = sample ? offerExample(form, chargedPrice(sample.price)) : null;
    const field = (name) => ({
        value: name === 'search' ? query : form[name],
        onFocus: () => setFocused(name),
    });
    const numberBox = (name, label, decimals = false) => (
        <input
            className="form-control offer-number"
            inputMode={decimals ? 'decimal' : 'numeric'}
            aria-label={label}
            {...field(name)}
            onChange={(e) => set({ [name]: e.target.value.replace(decimals ? /[^\d.,]/g : /\D/g, '') })}
        />
    );
    const rule = {
        free_items: <>Buy {numberBox('buyQuantity', 'Number of items')} get {numberBox('freeQuantity', 'Free items')} free</>,
        percent_off: <>Buy {numberBox('buyQuantity', 'Number of items')} get {numberBox('value', 'Discount percentage', true)} % off</>,
        amount_off: <>Buy {numberBox('buyQuantity', 'Number of items')} get {symbol} {numberBox('value', 'Discount amount', true)} off</>,
        bundle_price: <>{numberBox('buyQuantity', 'Number of items')} items for {symbol} {numberBox('value', 'Bundle price', true)}</>,
    }[form.type];

    const toggleCategory = (cid) => set({ categoryIds: form.categoryIds.includes(cid) ? form.categoryIds.filter((c) => c !== cid) : [...form.categoryIds, cid] });
    const addProduct = (pid) => !form.productIds.includes(pid) && set({ productIds: [...form.productIds, pid] });
    const removeProduct = (pid) => set({ productIds: form.productIds.filter((p) => p !== pid) });
    const keyboard = KEYBOARD[focused];

    return (
        <div className="content-wrapper offers-page">
            <div className="offers-head">
                <h2>{editing ? 'Change offer' : 'New offer'}</h2>
                <button type="button" className="btn btn-light btn-rounded" onClick={() => navigate('/offers')}>
                    <i className="mdi mdi-arrow-left" /> Back to the offers
                </button>
            </div>
            <form className="row g-4" onSubmit={save} noValidate>
                <div className="col-lg-6">
                    <div className="card"><div className="card-body">
                        <div className="mb-4">
                            <label className="form-label fw-bold" htmlFor="offer-name">Name</label>
                            <input id="offer-name" className="form-control" maxLength={120} placeholder="e.g. Mango 3 for 2"
                                {...field('name')} onChange={(e) => set({ name: e.target.value })} />
                            <small className="text-muted">Printed on the receipt next to the discount.</small>
                        </div>

                        <div className="mb-4">
                            <div className="form-label fw-bold">Kind of offer</div>
                            <div className="offer-types" role="radiogroup" aria-label="Kind of offer">
                                {OFFER_TYPES.map((t) => (
                                    <button type="button" key={t.type} role="radio" aria-checked={form.type === t.type}
                                        className={`offer-type ${form.type === t.type ? 'is-on' : ''}`} onClick={() => set({ type: t.type })}>
                                        <b>{t.label}</b>
                                        <small>{t.example}</small>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mb-4">
                            <div className="form-label fw-bold">Rule</div>
                            <div className="offer-rule-sentence">{rule}</div>
                            <small className="text-muted">
                                Items can be mixed. Sets are made from the most expensive items down
                                {form.type === 'free_items' ? ', and the cheapest items of each set are free.' : '.'} The offer repeats for
                                every complete set. Items sold by weight are not included.
                            </small>
                        </div>

                        <div className="offer-example mb-4" aria-live="polite">
                            {example && sample ? (
                                <>
                                    <b>Example:</b> {example.units} × {sample.name} at {money(chargedPrice(sample.price))} = {money(example.full)}.
                                    The customer pays <b>{money(example.pays)}</b> and saves <b>{money(example.saves)}</b>.
                                    {example.saves === 0 ? <div className="text-danger mt-1">At this price the offer gives no discount.</div> : null}
                                </>
                            ) : (
                                <span>Choose products and fill in the rule to see an example.</span>
                            )}
                        </div>

                        <div className="row mb-4">
                            <div className="col-sm-6">
                                <label className="form-label fw-bold" htmlFor="offer-from">From</label>
                                <input id="offer-from" type="date" className="form-control" value={form.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
                            </div>
                            <div className="col-sm-6">
                                <label className="form-label fw-bold" htmlFor="offer-until">Until (last day)</label>
                                <input id="offer-until" type="date" className="form-control" value={form.endsOn} onChange={(e) => set({ endsOn: e.target.value })} />
                            </div>
                            <small className="text-muted mt-1">Leave empty to run without a date limit.</small>
                        </div>

                        <div className="d-flex align-items-center gap-3 mb-3">
                            <Switch id="offer-active" checked={form.active} label="Offer is on" onChange={(on) => set({ active: on })} />
                            <label htmlFor="offer-active" className="fw-bold mb-0">Offer is on</label>
                        </div>
                        <div className="d-flex align-items-center gap-3 mb-2">
                            <Switch id="offer-screen" checked={form.showOnCustomerScreen} label="Show on the customer screen" onChange={(on) => set({ showOnCustomerScreen: on })} />
                            <label htmlFor="offer-screen" className="fw-bold mb-0">Show on the customer screen</label>
                        </div>
                        {form.showOnCustomerScreen ? (
                            <div className="mt-3">
                                <label className="form-label fw-bold" htmlFor="offer-headline">Headline on the customer screen</label>
                                <input id="offer-headline" className="form-control" maxLength={120} placeholder={headline ?? ''}
                                    {...field('headline')} onChange={(e) => set({ headline: e.target.value })} />
                                {headline ? <small className="text-muted">Leave empty to show “{headline}”.</small> : null}
                            </div>
                        ) : null}
                    </div></div>
                </div>

                <div className="col-lg-6">
                    <div className="card"><div className="card-body">
                        <div className="mb-4">
                            <div className="form-label fw-bold">Whole categories</div>
                            <div className="offer-categories">
                                {categories.map((c) => (
                                    <label key={c.id} className={`offer-check ${form.categoryIds.includes(c.id) ? 'is-on' : ''}`}>
                                        <input type="checkbox" checked={form.categoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)} /> {c.name}
                                    </label>
                                ))}
                                {!categories.length ? <span className="text-muted">No categories</span> : null}
                            </div>
                        </div>

                        <label className="form-label fw-bold" htmlFor="offer-search">Single products</label>
                        <input id="offer-search" className="form-control mb-2" type="text" autoComplete="off"
                            placeholder={productsLoaded ? 'Search by name or barcode, or scan a product' : 'Loading products…'}
                            {...field('search')} onChange={(e) => setQuery(e.target.value)} />
                        {query.trim() ? (
                            <div className="offer-results mb-3">
                                {results.map((p) => {
                                    const chosen = form.productIds.includes(p.id);
                                    return (
                                        <button type="button" key={p.id} className="offer-result" disabled={chosen} onClick={() => addProduct(p.id)}>
                                            <span>
                                                {p.name}
                                                <small className="text-muted ms-2">{p.catName ?? ''}</small>
                                            </span>
                                            <span className="text-nowrap">
                                                {money(chargedPrice(p.price))}
                                                <b className="ms-3">{chosen ? 'Added' : '+ Add'}</b>
                                            </span>
                                        </button>
                                    );
                                })}
                                {!results.length ? <div className="p-2 text-muted">{productsLoaded ? 'No product found' : 'Loading products…'}</div> : null}
                                {results.length === SEARCH_LIMIT ? <div className="p-2 text-muted small">Showing the first {SEARCH_LIMIT}. Type more of the name.</div> : null}
                            </div>
                        ) : null}

                        <div className="fw-bold mb-1">Chosen products ({form.productIds.length})</div>
                        {form.productIds.length ? (
                            <ul className="offer-chosen">
                                {form.productIds.map((pid) => {
                                    const p = byId.get(pid);
                                    return (
                                        <li key={pid}>
                                            <span>
                                                {p?.name ?? knownNames.get(pid) ?? `Product ${pid}`}
                                                {p ? <small className="text-muted ms-2">{money(chargedPrice(p.price))}</small> : null}
                                            </span>
                                            <button type="button" className="btn btn-sm btn-light" aria-label="Remove from the offer" onClick={() => removeProduct(pid)}>×</button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="text-muted small mb-0">None. Search above, or scan products with the barcode scanner.</p>
                        )}
                    </div></div>
                </div>

                <div className="col-12">
                    {error ? <div className="alert alert-danger" role="alert">{error}</div> : null}
                    <div className="d-flex justify-content-end gap-3 mb-5">
                        <button type="button" className="btn btn-light btn-lg btn-rounded" onClick={() => navigate('/offers')}>Cancel</button>
                        <button type="submit" className="btn btn-success btn-lg btn-rounded" disabled={saving}>{saving ? 'Saving…' : 'Save offer'}</button>
                    </div>
                </div>
            </form>
            {keyboard && !hasKeyboard ? (
                <TouchKeyboard
                    open
                    value={focused === 'search' ? query : form[focused]}
                    onChange={(v) => {
                        if (focused === 'search') setQuery(v);
                        else if (keyboard.layout === 'integer') set({ [focused]: String(v).replace(/\D/g, '') });
                        else set({ [focused]: v });
                    }}
                    layout={keyboard.layout}
                    label={keyboard.label}
                    onClose={() => setFocused('')}
                />
            ) : null}
        </div>
    );
}
