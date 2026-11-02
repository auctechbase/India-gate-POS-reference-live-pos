const router = require("express").Router();
const { raw } = require('objection');
const Order = require('../models/Order');
const Product = require('../models/Product');
const fetchuser = require('../middlewares/loggedIn');
const { toNumber, round2, paymentBreakdown } = require('../utils/money');

// Sales analytics for the Sales page. Uses the same rules as the X/Z reports:
// price[id] in the saved order is the line total (negative for a returned line),
// payments are split with paymentBreakdown, and days/hours are the shop's local time.

const isQuickItem = (id) => typeof id === 'string' && id.startsWith('quick');
const parseData = (data) => (typeof data === 'string' ? JSON.parse(data) : (data || {}));
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const localDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const addDays = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return localDate(new Date(y, m - 1, d + n));
};
const daysBetween = (from, to) => {
    const [a, b] = [from, to].map(s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); });
    return Math.round((b - a) / 86400000);
};

async function loadOrders(from, to) {
    const rows = await Order.query()
        .join('cashier_sessions as cs', 'orders.id', 'cs.order_id')
        .select(
            'orders.id', 'orders.amount', 'orders.payment_mode', 'cs.data',
            raw("strftime('%Y-%m-%d', orders.created_at, 'localtime') as day"),
            raw("CAST(strftime('%H', orders.created_at, 'localtime') AS INTEGER) as hour"),
        )
        .whereBetween(raw("strftime('%Y-%m-%d', orders.created_at, 'localtime')"), [from, to]);
    return rows.map(r => ({ ...r, data: parseData(r.data) }));
}

function summarize(orders) {
    let revenue = 0, returns = 0, itemsSold = 0;
    for (const order of orders) {
        revenue += toNumber(order.data.total ?? order.amount);
        const prices = order.data.price || {};
        const qty = order.data.quantity || {};
        for (const id of Object.keys(prices)) {
            const line = toNumber(prices[id]);
            if (line < 0) returns += line;
            else itemsSold += toNumber(qty[id]);
        }
    }
    const count = orders.length;
    return {
        revenue: round2(revenue),
        orders: count,
        average: count ? round2(revenue / count) : 0,
        itemsSold: Math.round(itemsSold * 100) / 100,
        returns: round2(returns),
    };
}

router.get('/', fetchuser, async (req, res) => {
    try {
        const today = localDate(new Date());
        const to = DAY.test(req.query.to || '') ? req.query.to : today;
        const from = DAY.test(req.query.from || '') ? req.query.from : to;
        if (from > to) return res.status(400).json({ status: false, message: '"from" must be before "to"' });
        const span = daysBetween(from, to) + 1;
        if (span > 366) return res.status(400).json({ status: false, message: 'Pick a period of at most one year' });

        const [orders, previousOrders] = await Promise.all([
            loadOrders(from, to),
            loadOrders(addDays(from, -span), addDays(from, -1)),
        ]);

        // Product names and categories for every product sold in the period, in one query.
        const ids = new Set();
        orders.forEach(o => Object.keys(o.data.price || {}).forEach(id => !isQuickItem(id) && ids.add(id)));
        const products = ids.size
            ? await Product.query().whereIn('id', [...ids]).withGraphFetched('category').select('id', 'name', 'category_id')
            : [];
        const byId = Object.fromEntries(products.map(p => [String(p.id), p]));

        const byDay = {};
        for (let i = 0; i < span; i++) byDay[addDays(from, i)] = { revenue: 0, orders: 0 };
        const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0, orders: 0 }));
        const payments = { cash: 0, card: 0, account: 0 };
        const productTotals = {}, categoryTotals = {};

        for (const order of orders) {
            const total = toNumber(order.data.total ?? order.amount);
            if (byDay[order.day]) { byDay[order.day].revenue += total; byDay[order.day].orders += 1; }
            if (byHour[order.hour]) { byHour[order.hour].revenue += total; byHour[order.hour].orders += 1; }
            const paid = paymentBreakdown(total, order.payment_mode, order.data.modes);
            payments.cash += paid.cash; payments.card += paid.card; payments.account += paid.account;

            const prices = order.data.price || {};
            const qty = order.data.quantity || {};
            for (const id of Object.keys(prices)) {
                const line = toNumber(prices[id]);
                const product = byId[String(id)];
                const name = isQuickItem(id) ? 'Others (quick add)' : (product?.name || `Product #${id}`);
                const category = isQuickItem(id) ? 'Others' : (product?.category?.name || 'Others');
                const signedQty = (line < 0 ? -1 : 1) * toNumber(qty[id]);
                const key = isQuickItem(id) ? 'quick' : String(id);
                productTotals[key] = productTotals[key] || { name, revenue: 0, quantity: 0 };
                productTotals[key].revenue += line;
                productTotals[key].quantity += signedQty;
                categoryTotals[category] = (categoryTotals[category] || 0) + line;
            }
        }

        const top = (entries, n) => entries.sort((a, b) => b.revenue - a.revenue).slice(0, n);
        return res.json({
            status: true,
            from, to,
            summary: summarize(orders),
            previous: { from: addDays(from, -span), to: addDays(from, -1), ...summarize(previousOrders) },
            byDay: Object.entries(byDay).map(([day, v]) => ({ day, revenue: round2(v.revenue), orders: v.orders })),
            byHour: byHour.map(h => ({ ...h, revenue: round2(h.revenue) })),
            payments: Object.fromEntries(Object.entries(payments).map(([k, v]) => [k, round2(v)])),
            topProducts: top(Object.values(productTotals).map(p => ({ ...p, revenue: round2(p.revenue), quantity: Math.round(p.quantity * 100) / 100 })), 10),
            categories: top(Object.entries(categoryTotals).map(([name, revenue]) => ({ name, revenue: round2(revenue) })), 8),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: false, message: error.message });
    }
});

module.exports = router;
