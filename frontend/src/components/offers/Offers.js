import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, ModalBody, ModalFooter, ModalHeader } from 'reactstrap';
import toast from 'react-hot-toast';
import { datesText, localDate, offerStatus, ruleText, STATUS_TEXT, targetsText } from '../../helpers/offers';
import './Offers.css';

export const errorText = (err, fallback = 'Something went wrong.') =>
    (err?.response?.data?.message) || err?.message || fallback;

/** An on/off switch that is easy to hit on a touchscreen. */
export function Switch({ checked, disabled, label, onChange, id }) {
    return (
        <button
            type="button"
            id={id}
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            className={`offer-switch ${checked ? 'is-on' : ''}`}
            onClick={() => onChange(!checked)}
        >
            <span />
        </button>
    );
}

/** The offers list: switches to turn an offer or its customer-screen slot on/off, Edit and Delete. */
export default function Offers() {
    const navigate = useNavigate();
    const [offers, setOffers] = useState(null);
    const [problem, setProblem] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [busy, setBusy] = useState(false);
    // Rows with a change on its way are locked, so Edit cannot open the old values.
    const [saving, setSaving] = useState(new Set());
    const today = localDate();

    const lock = (id, on) => setSaving((ids) => {
        const next = new Set(ids);
        if (on) next.add(id);
        else next.delete(id);
        return next;
    });

    const load = useCallback(async () => {
        try {
            const { data } = await axios.get('offers');
            setOffers(data.offers || []);
            setProblem(null);
        } catch (err) {
            setOffers([]);
            setProblem(errorText(err, 'The offers could not be loaded.'));
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const replace = (id, offer) => setOffers((list) => list?.map((o) => (o.id === id ? offer : o)) ?? null);

    // Switches flip at once and go back if the backend refuses.
    const toggle = async (offer, change) => {
        lock(offer.id, true);
        replace(offer.id, { ...offer, ...change });
        try {
            const { data } = await axios.patch(`offers/${offer.id}`, change);
            replace(offer.id, data.offer);
        } catch (err) {
            replace(offer.id, offer);
            toast.error(errorText(err));
        } finally {
            lock(offer.id, false);
        }
    };

    const remove = async () => {
        if (!deleting) return;
        const offer = deleting;
        setBusy(true);
        lock(offer.id, true);
        try {
            await axios.delete(`offers/${offer.id}`);
            setOffers((list) => list?.filter((o) => o.id !== offer.id) ?? null);
            toast.success(`"${offer.name}" deleted`);
            setDeleting(null);
        } catch (err) {
            toast.error(errorText(err));
        } finally {
            setBusy(false);
            lock(offer.id, false);
        }
    };

    const newOffer = () => navigate('/offers/new');

    return (
        <div className="content-wrapper offers-page">
            <div className="offers-head">
                <div>
                    <h2>Offers</h2>
                    <p className="text-muted mb-0">
                        Discounts the till gives by itself, e.g. “Buy 2 get 1 free”. Offers marked for the customer screen are shown there between sales.
                    </p>
                </div>
                <button type="button" className="btn btn-success btn-lg btn-rounded" onClick={newOffer}>
                    <i className="mdi mdi-plus" /> New offer
                </button>
            </div>
            {problem ? <div className="alert alert-warning">{problem}</div> : null}
            <div className="card">
                <div className="card-body table-responsive">
                    <table className="table offers-table w-100">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Offer</th>
                                <th>Products</th>
                                <th>Dates</th>
                                <th>Customer screen</th>
                                <th>Status</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {offers === null ? (
                                <tr><td colSpan={7} className="text-center text-muted py-4">Loading…</td></tr>
                            ) : null}
                            {offers?.length === 0 && !problem ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-5">
                                        <div className="fs-5 mb-3">No offers yet.</div>
                                        <button type="button" className="btn btn-success btn-rounded" onClick={newOffer}>Create the first offer</button>
                                    </td>
                                </tr>
                            ) : null}
                            {offers?.map((offer) => {
                                const status = offerStatus(offer, today);
                                const targets = targetsText(offer);
                                const locked = saving.has(offer.id);
                                return (
                                    <tr key={offer.id}>
                                        <td className="fw-bold">{offer.name}</td>
                                        <td><span className="offer-rule">{ruleText(offer)}</span></td>
                                        <td className="offer-targets">{targets || <span className="text-danger">No products left</span>}</td>
                                        <td className="text-nowrap">{datesText(offer)}</td>
                                        <td>
                                            <Switch
                                                checked={offer.show_on_customer_screen}
                                                disabled={locked}
                                                label={`Show ${offer.name} on the customer screen`}
                                                onChange={(on) => toggle(offer, { show_on_customer_screen: on })}
                                            />
                                            {offer.show_on_customer_screen ? <div className="small text-muted mt-1">“{offer.display_headline}”</div> : null}
                                        </td>
                                        <td>
                                            <div className="d-flex align-items-center gap-2">
                                                <Switch checked={offer.active} disabled={locked} label={`${offer.name} is on`} onChange={(on) => toggle(offer, { active: on })} />
                                                <span className={`offer-chip offer-chip--${status}`}>{locked ? 'Saving…' : STATUS_TEXT[status]}</span>
                                            </div>
                                        </td>
                                        <td className="text-nowrap text-end">
                                            <button type="button" className="btn btn-sm btn-primary" disabled={locked} onClick={() => navigate(`/offers/${offer.id}`)}>Edit</button>
                                            <button type="button" className="btn btn-sm btn-danger ms-2" disabled={locked} onClick={() => setDeleting(offer)}>Delete</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <Modal isOpen={Boolean(deleting)} toggle={() => setDeleting(null)} fade={false}>
                <ModalHeader toggle={() => setDeleting(null)}>Delete this offer?</ModalHeader>
                <ModalBody>
                    “{deleting?.name}” stops on the till straight away. Sales already made keep their discount.
                </ModalBody>
                <ModalFooter>
                    <button type="button" className="btn btn-light" onClick={() => setDeleting(null)}>Cancel</button>
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>Delete</button>
                </ModalFooter>
            </Modal>
        </div>
    );
}
