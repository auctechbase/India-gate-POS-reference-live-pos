/**
 * Works out what offers take off a cart. Pure: no database, no clock. Money is in cents inside.
 * (Same rules as the Sardar POS promotion engine.)
 *
 * - Mix and match: any units of an offer's products count towards a set.
 * - Sets are formed from the most expensive qualifying units down; the units left over
 *   (the cheapest) pay full price.
 * - Buy N get M free: in each set of N + M, the M cheapest units are free.
 * - An offer repeats for every complete set.
 * - A unit is used by at most one offer; when offers overlap, the one giving the larger
 *   discount goes first (the customer gets the better deal).
 * - Return lines, quick items (no product), zero prices and weighed (part) quantities never
 *   take part.
 */

const TYPES = ['free_items', 'percent_off', 'amount_off', 'bundle_price'];
const MAX_UNITS = 10000;

const toCents = (amount) => Math.round(Number(amount) * 100);
const fromCents = (cents) => Math.round(cents) / 100;

/** Splits `total` cents over the units in proportion to their prices; the parts add up exactly. */
function allocate(total, units) {
    const sum = units.reduce((acc, unit) => acc + unit.price, 0);
    if (total <= 0 || sum <= 0) return units.map(() => 0);
    const exact = units.map((unit) => (total * unit.price) / sum);
    const parts = exact.map(Math.floor);
    let remainder = total - parts.reduce((a, b) => a + b, 0);
    const byFraction = exact
        .map((value, index) => ({ index, fraction: value - parts[index] }))
        .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let i = 0; remainder > 0; i++, remainder--) parts[byFraction[i].index] += 1;
    return parts;
}

/** What one offer gives on the available units, or null when it does not apply. */
function evaluate(offer, available) {
    const freeQuantity = offer.type === 'free_items' ? offer.freeQuantity : 0;
    const size = offer.buyQuantity + freeQuantity;
    if (!Number.isInteger(size) || size < 1) return null;

    const units = [...available].sort((a, b) => b.price - a.price || a.seq - b.seq);
    const discounts = new Map();
    const consumed = [];
    let sets = 0;
    let total = 0;

    for (let start = 0; start + size <= units.length; start += size) {
        const set = units.slice(start, start + size);
        const setTotal = set.reduce((acc, unit) => acc + unit.price, 0);
        let parts;
        switch (offer.type) {
            case 'free_items':
                // The set is sorted most expensive first, so its cheapest units are last.
                parts = set.map((unit, i) => (i >= size - freeQuantity ? unit.price : 0));
                break;
            case 'percent_off':
                parts = allocate(Math.round((setTotal * offer.value) / 100), set);
                break;
            case 'amount_off':
                parts = allocate(Math.min(toCents(offer.value), setTotal), set);
                break;
            case 'bundle_price':
                parts = allocate(Math.max(0, setTotal - toCents(offer.value)), set);
                break;
            default:
                return null;
        }
        const setDiscount = parts.reduce((a, b) => a + b, 0);
        // e.g. a bundle price higher than these units cost: leave them for other offers
        if (setDiscount <= 0) continue;
        sets += 1;
        total += setDiscount;
        set.forEach((unit, i) => {
            consumed.push(unit);
            if (parts[i]) discounts.set(unit, parts[i]);
        });
    }
    return sets ? { sets, discount: total, discounts, consumed } : null;
}

/**
 * @param lines [{ key, productId, quantity, unitPrice, isReturn }]
 * @param offers [{ id, name, type, buyQuantity, freeQuantity, value, productIds: Set<string> }]
 * @returns {{ lines: {key, discount, offer_ids}[], offers: {id, name, sets, discount}[], totalDiscount }}
 */
function applyOffers(lines, offers) {
    const units = [];
    for (const line of lines) {
        const quantity = Number(line.quantity);
        const price = toCents(line.unitPrice);
        if (line.isReturn || line.productId === null || line.productId === undefined) continue;
        if (!Number.isInteger(quantity) || quantity < 1 || !(price > 0)) continue;
        for (let i = 0; i < quantity && units.length < MAX_UNITS; i++) {
            units.push({ key: String(line.key), productId: String(line.productId), price, seq: units.length, used: false });
        }
    }

    const lineDiscounts = new Map();
    const lineOffers = new Map(); // line key -> ids of the offers that discounted it
    const applied = [];
    const remaining = new Set(offers.filter((o) => TYPES.includes(o.type)));

    while (remaining.size) {
        let best = null;
        for (const offer of remaining) {
            const available = units.filter((unit) => !unit.used && offer.productIds.has(unit.productId));
            const result = evaluate(offer, available);
            if (!result) continue;
            const better = !best || result.discount > best.result.discount ||
                (result.discount === best.result.discount && offer.id < best.offer.id);
            if (better) best = { offer, result };
        }
        if (!best) break;

        remaining.delete(best.offer);
        for (const unit of best.result.consumed) unit.used = true;
        for (const [unit, cents] of best.result.discounts) {
            lineDiscounts.set(unit.key, (lineDiscounts.get(unit.key) || 0) + cents);
            if (!lineOffers.has(unit.key)) lineOffers.set(unit.key, new Set());
            lineOffers.get(unit.key).add(best.offer.id);
        }
        applied.push({ id: best.offer.id, name: best.offer.name, sets: best.result.sets, discount: fromCents(best.result.discount) });
    }

    const totalCents = [...lineDiscounts.values()].reduce((a, b) => a + b, 0);
    return {
        lines: lines.map((line) => ({
            key: String(line.key),
            discount: fromCents(lineDiscounts.get(String(line.key)) || 0),
            offer_ids: [...(lineOffers.get(String(line.key)) || [])],
        })),
        offers: applied,
        totalDiscount: fromCents(totalCents),
    };
}

module.exports = { applyOffers, allocate, OFFER_TYPES: TYPES };
