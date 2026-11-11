// The slip printed for a website order: what to prepare, who it is for, and what to collect.
// The Electron app wraps it with the shop logo (main.js, printReceipt). Customer text is
// escaped because the page is rendered in a window.

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function placed(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function receiptHtml(order) {
    const c = order.customer || {};
    const d = order.delivery || {};
    const a = order.amounts || {};
    const p = order.payment || {};
    const pickup = d.method === 'pickup';
    const line = (label, value) => `<tr><td>${label}</td><td style="text-align:right">${value}</td></tr>`;

    const items = (order.items || []).map(it => `
        <tr>
            <td style="vertical-align:top;white-space:nowrap">${esc(it.quantity)} x</td>
            <td style="width:100%">${esc(it.title)}${it.weight_label ? ` (${esc(it.weight_label)})` : ''}</td>
            <td style="text-align:right;white-space:nowrap">${esc(it.line_total)}</td>
        </tr>`).join('');

    const totals = [
        line('Subtotal', esc(a.subtotal)),
        Number(a.delivery_fee) > 0 ? line('Delivery', esc(a.delivery_fee)) : '',
        Number(a.discount) > 0 ? line(`Discount${a.coupon_code ? ` (${esc(a.coupon_code)})` : ''}`, `- ${esc(a.discount)}`) : '',
        Number(a.loyalty_discount) > 0 ? line('Loyalty points', `- ${esc(a.loyalty_discount)}`) : '',
        `<tr style="font-weight:700!important"><td>TOTAL</td><td style="text-align:right">&euro; ${esc(a.total)}</td></tr>`,
    ].join('');

    const unpaid = String(p.status || '').toLowerCase() !== 'paid';

    return `
        <div style="text-align:center;margin:6px 0">
            <div style="font-weight:700!important;font-size:1.1rem!important">WEBSITE ORDER</div>
            <div style="font-weight:700!important;font-size:1.3rem!important">#${esc(order.order_number)}</div>
            <div>${esc(placed(order.created_at))}</div>
            <div style="font-weight:700!important;margin-top:4px">${pickup ? 'PICKUP' : 'DELIVERY'}</div>
        </div>
        <div style="border-top:1px dashed;padding:6px 0">
            <div>${esc(c.name)}</div>
            ${c.phone ? `<div>${esc(c.phone)}</div>` : ''}
            ${pickup ? '' : `<div>${esc(d.address)}</div><div>${esc([d.zip, d.city].filter(Boolean).join(' '))}</div>`}
        </div>
        <div style="border-top:1px dashed;padding:6px 0">
            <table style="width:100%;border-collapse:collapse">${items}</table>
        </div>
        <div style="border-top:1px dashed;padding:6px 0">
            <table style="width:100%;border-collapse:collapse">${totals}</table>
        </div>
        <div style="border-top:1px dashed;padding:6px 0">
            <div>Payment: ${esc(p.mode)} (${esc(p.status)})</div>
            ${unpaid ? `<div style="font-weight:700!important;font-size:1.1rem!important">TO COLLECT: &euro; ${esc(a.total)}</div>` : ''}
        </div>`;
}

module.exports = { receiptHtml, esc };
