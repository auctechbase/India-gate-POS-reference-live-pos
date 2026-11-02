// Prices, quantities and amounts are stored as TEXT ("12,50", "€ 20", "19 %").
// Always go through these helpers instead of comparing or adding the raw strings.

const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const cleaned = String(value).replace(/[^\d,.\-]/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round((toNumber(n) + Number.EPSILON) * 100) / 100;

// "19 %", "19%", "7.5 %", "7,5" → 19 / 7.5. Unparseable → 0.
const parseTaxRate = (tax) => {
    if (tax === null || tax === undefined || tax === 'null') return 0;
    const match = String(tax).match(/-?\d+(?:[.,]\d+)?/);
    return match ? parseFloat(match[0].replace(',', '.')) : 0;
};

// Shelf prices are what the customer pays (the cart total never adds tax on top),
// so the tax is *included*: gross * rate / (100 + rate).
const includedTax = (gross, rate) => {
    const r = toNumber(rate);
    if (!r) return 0;
    return toNumber(gross) * r / (100 + r);
};

const clamp = (n, a, b) => Math.min(Math.max(n, Math.min(a, b)), Math.max(a, b));

/**
 * How much of an order went into (or, for a return, out of) the cash drawer.
 * payment_mode is "Cash" | "Card" | "Account" or a comma list for split payments, in which
 * case `modes` carries the Card / Account parts the cashier entered.
 */
const cashPortion = (amount, paymentMode, modes = {}) => {
    const total = toNumber(amount);
    const parts = String(paymentMode || '').split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    if (parts.length <= 1) return parts[0] === 'cash' ? total : 0;
    if (!parts.includes('cash')) return 0;
    const nonCash = toNumber(modes.Card) * (parts.includes('card') ? 1 : 0)
        + toNumber(modes.Account) * (parts.includes('account') ? 1 : 0);
    return clamp(total - Math.sign(total || 1) * nonCash, 0, total);
};

/** Split an order total into { cash, card, account } using the same rules as cashPortion. */
const paymentBreakdown = (amount, paymentMode, modes = {}) => {
    const total = toNumber(amount);
    const parts = String(paymentMode || '').split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    if (parts.length <= 1) {
        return {
            cash: parts[0] === 'cash' ? total : 0,
            card: parts[0] === 'card' ? total : 0,
            account: parts[0] === 'account' ? total : 0,
        };
    }
    const sign = Math.sign(total || 1);
    let card = parts.includes('card') ? clamp(sign * toNumber(modes.Card), 0, total) : 0;
    let account = parts.includes('account') ? clamp(sign * toNumber(modes.Account), 0, total - card) : 0;
    const cash = parts.includes('cash') ? total - card - account : 0;
    // Without a cash part, whatever is left goes to the last non-cash mode.
    if (!parts.includes('cash')) {
        if (parts.includes('account')) account = total - card; else card = total;
    }
    return { cash, card, account };
};

module.exports = { toNumber, round2, parseTaxRate, includedTax, cashPortion, paymentBreakdown };
