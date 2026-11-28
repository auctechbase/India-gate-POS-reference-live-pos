import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Modal, ModalHeader, ModalBody, ModalFooter } from 'reactstrap';
import './ReceiptLookup.css';

// Receipt barcodes are "R" + the order number (printed at the bottom of every receipt by
// main.js). Product barcodes never look like that (checked against the catalogue).
export const isReceiptCode = (code) => /^R\d{1,9}$/i.test(String(code || '').trim());

const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function daysAgoText(date) {
    const days = Math.round((dayStart(new Date()) - dayStart(date)) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 60) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return `${days} days ago (about ${months} months)`;
}

/**
 * A customer brings something back: scanning the receipt shows when it was bought and what was
 * on it. Information only: the return is rung up in the till exactly as before.
 */
export default function ReceiptLookup({ code, onClose }) {
    const [state, setState] = useState({ loading: true });

    useEffect(() => {
        if (!code) return;
        let alive = true;
        setState({ loading: true });
        axios.get(`orders/receipt/${encodeURIComponent(code)}`)
            .then(({ data }) => alive && setState(data.status ? { receipt: data.receipt, currency: data.currency } : { error: data.message }))
            .catch((e) => alive && setState({ error: e.response?.data?.message || 'The POS did not answer. Try again.' }));
        return () => { alive = false; };
    }, [code]);

    if (!code) return null;
    const { loading, error, receipt, currency } = state;
    const money = (n) => `${String(currency || '€').trim()} ${Math.abs(Number(n) || 0).toFixed(2)}`;
    const date = receipt ? new Date(receipt.date) : null;

    return (
        <Modal isOpen={true} toggle={onClose} centered size="lg" className="receipt-lookup">
            <ModalHeader toggle={onClose}>
                <i className="mdi mdi-receipt" /> Receipt {receipt ? receipt.number : String(code).toUpperCase()}
            </ModalHeader>
            <ModalBody>
                {loading && <p className="rl-muted">Looking up the receipt…</p>}
                {error && <p className="rl-error"><i className="mdi mdi-alert-circle" /> {error}</p>}
                {receipt && (
                    <>
                        <div className="rl-when">
                            <div className="rl-ago">{daysAgoText(date)}</div>
                            <div className="rl-date">
                                {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                {' at '}
                                {date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                        <div className="rl-facts">
                            <span>{receipt.isReturn ? 'Refunded' : 'Total'} <b>{money(receipt.amount)}</b></span>
                            {receipt.payment && <span>Paid by <b>{receipt.payment}</b></span>}
                            {receipt.cashier && <span>Cashier <b>{receipt.cashier}</b></span>}
                        </div>
                        <table className="table rl-lines">
                            <thead>
                                <tr><th>Item</th><th className="text-end">Qty</th><th className="text-end">Amount</th></tr>
                            </thead>
                            <tbody>
                                {receipt.lines.map((line, i) => (
                                    <tr key={i} className={line.isReturn ? 'is-return' : ''}>
                                        <td>
                                            {line.name}
                                            {line.isReturn && <em className="rl-tag">Returned</em>}
                                        </td>
                                        <td className="text-end">{line.quantity}{line.unit ? ` ${line.unit}` : ''}</td>
                                        <td className="text-end">{line.isReturn ? '- ' : ''}{money(line.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {receipt.discount > 0 && <p className="rl-muted">Offer discount on this receipt: {money(receipt.discount)}</p>}
                        <p className="rl-muted">To take items back, ring up the return in the till as usual.</p>
                    </>
                )}
            </ModalBody>
            <ModalFooter>
                <button type="button" className="btn btn-primary btn-lg px-5" onClick={onClose}>Close</button>
            </ModalFooter>
        </Modal>
    );
}
