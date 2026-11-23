import toast from 'react-hot-toast';
import './ChangeCard.css';

const money = (currency, n) => `${String(currency || '€').trim()} ${Math.abs(n).toFixed(2)}`;

/**
 * After a payment: a big card at the top of the till with the change to give back
 * (e.g. paid € 20.00 for € 16.00 → "Give back € 4.00"). Shown for 3.5 seconds over the till
 * (the toaster lives in the layout, so it stays when the POS returns to the till screen);
 * a tap closes it. It does not block the till: the next sale can start right away.
 */
export function showChangeCard({ total, paid, currency, isReturn }) {
    const t = Math.round(Number(total) * 100) / 100;
    const p = Math.round(Number(paid) * 100) / 100;
    // A return (negative total) means money goes back to the customer.
    const giveBack = t < 0 ? Math.abs(t) : Math.max(0, Math.round((p - t) * 100) / 100);
    toast.custom((tst) => (
        <div className={`change-card ${tst.visible ? 'is-in' : 'is-out'} ${giveBack > 0 ? 'has-change' : ''}`}
            onClick={() => toast.dismiss(tst.id)} role="status">
            <div className="change-card-title">
                <i className="mdi mdi-check-circle" /> {isReturn ? 'Return completed' : 'Sale completed'}
            </div>
            {giveBack > 0 ? (<>
                <div className="change-card-label">Give back</div>
                <div className="change-card-amount">{money(currency, giveBack)}</div>
            </>) : (
                <div className="change-card-amount is-none">No change</div>
            )}
            {t > 0 && <div className="change-card-detail">Paid {money(currency, p)} · Total {money(currency, t)}</div>}
            <div className="change-card-hint">Tap to close</div>
        </div>
    ), { id: 'change-card', duration: 3500, position: 'top-center' });
}
