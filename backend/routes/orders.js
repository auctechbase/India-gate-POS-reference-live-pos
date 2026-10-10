const router = require("express").Router();
const fs = require('fs');
const pdf = require('html-pdf');
const { raw } = require('objection');
const { format } = require('date-fns');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Currency = require('../models/Currency');
const CashRegister = require('../models/CashRegister');
const CashierSession = require('../models/CashierSession');
const Notification = require('../models/Notification');
const Report = require('../models/Report');
const fetchuser = require('../middlewares/loggedIn');
const storage = require('../utils/storage');
const { removeStored } = require('../utils/images');
const { getStoreSetting, isInventoryOn } = require('../utils/settings');
const { toNumber, round2, parseTaxRate, includedTax, cashPortion, paymentBreakdown } = require('../utils/money');
const { generatePdf, getCurrentDate } = require('../utils');
const config = require('../config');

let b64;
const logoPath = config.findLogoPath();
if (logoPath) b64 = fs.readFileSync(logoPath, 'base64');

const CURRENCY_SYMBOLS = { euro: '€ ', eur: '€ ', inr: '₹ ', rupee: '₹ ' };
async function activeCurrencySymbol() {
    const currency = await Currency.query().where('status', true).first();
    if (!currency) return '€ ';
    return CURRENCY_SYMBOLS[String(currency.name).toLowerCase()] ?? `${currency.unit || currency.name} `;
}

const isQuickItem = (id) => typeof id === 'string' && id.startsWith('quick');
const parseData = (data) => (typeof data === 'string' ? JSON.parse(data) : (data || {}));

router.get('/', fetchuser, async (req, res) => {
    try {
        const orders = Order.query()
            .withGraphFetched('[cashier(selectName), session, register]')
            .modifiers({
                selectName(build) {
                    build.select('id', 'name');
                },
            })
            .orderBy('id', 'desc');
        const me = await User.query().findById(req.user.id);
        if (!me) return res.status(401).json({ status: false, orders: [] });
        if (me.type !== 'admin') orders.where('cashier_id', me.id);
        return res.json({ status: true, orders: await orders });
    } catch (error) {
        return res.json({ status: false, orders: [], message: error.message });
    }
});

/**
 * Low stock alert for one product, at most one unread notification per product.
 */
async function lowStockNotification(trx, productId, minStock, userId) {
    const prod = await Product.query(trx).findById(productId).select('quantity', 'name');
    if (!prod || toNumber(prod.quantity) >= minStock) return null;
    const content = `Stock ${prod.name} is running out!`;
    const existing = await Notification.query(trx).where('content', content).where('read', false).first();
    if (existing) return null;
    return Notification.query(trx).insertAndFetch({
        content,
        created_at: new Date().toISOString(),
        user_id: userId,
    });
}

router.post('/create', fetchuser, async (req, res) => {
    try {
        const body = req.body;
        const sessionData = body.sessionData;
        // Validate before writing anything: before, the order row was inserted even without
        // sessionData and the cashier was told it failed → retry → duplicate order.
        if (!sessionData || typeof sessionData !== 'object' || !sessionData.quantity) {
            return res.status(400).json({ status: false, message: 'Order data is missing!' });
        }
        const register = body.cash_register_id && await CashRegister.query().findById(body.cash_register_id);
        if (!register || !register.status) {
            return res.status(400).json({ status: false, message: 'The cash register is closed, open the day first!' });
        }

        // Everything below is saved together or not at all.
        const notifications = await Order.transaction(async (trx) => {
            const order = await Order.query(trx).insert({
                session_id: body.session_id,
                amount: body.amount,
                payment_mode: body.payment_mode,
                transaction_type: body.transaction_type,
                cashier_id: req.user.id,
                created_at: new Date().toISOString(),
                cash_register_id: body.cash_register_id,
            });

            const isSplit = String(body.payment_mode || '').indexOf(',') !== -1;
            await CashierSession.query(trx).insert({
                order_id: order.id,
                cashier_id: req.user.id,
                session_id: body.session_id,
                cash_register_id: body.cash_register_id,
                data: isSplit ? { ...sessionData, modes: body.modes } : sessionData,
            });

            // Only the cash part goes into the drawer. The UI's cashForDrawer is the whole
            // total even when (part of) it was paid by card or on account.
            const drawerCash = round2(cashPortion(body.amount, body.payment_mode, body.modes));
            await CashRegister.query(trx).findById(body.cash_register_id).patch({
                closing_cash: CashRegister.raw('closing_cash + ?', [drawerCash]),
            });

            const inventoryOn = await isInventoryOn(trx);
            const minStockSetting = await getStoreSetting('STOCK_ALERT', trx);
            const minStock = minStockSetting ? toNumber(minStockSetting.value) : null;
            const created = [];

            for (const [productId, qty] of Object.entries(sessionData.quantity)) {
                if (isQuickItem(productId) || !inventoryOn) continue;
                const quantity = toNumber(qty);
                // A negative line price marks a returned item: it goes back into stock.
                const isReturn = toNumber(sessionData.price?.[productId]) < 0;
                await Product.query(trx).findById(productId).patch({
                    quantity: Product.raw(isReturn ? 'quantity + ?' : 'quantity - ?', [quantity]),
                });
                if (minStock !== null && !isReturn) {
                    const notification = await lowStockNotification(trx, productId, minStock, req.user.id);
                    if (notification) created.push(notification);
                }
            }
            return created;
        });

        return res.status(200).json({ status: true, message: 'Transaction completed!', html: body.receiptData, notifications });
    } catch (error) {
        console.error('Transaction error:', error);
        res.status(500).json({ status: false, message: 'An error occurred', error: error.message });
    }
})

async function orderDetails(order) {
    const session = await CashierSession.query()
        .where('order_id', order.id)
        .first()
        .select('data');
    if (!session) throw new Error('Order details not found!');
    const data = parseData(session.data);
    const ids = (data.products || []).filter(id => !isQuickItem(id));
    const products = ids.length ? await Product.query().whereIn('id', ids) : [];
    const pairs = {};
    products.forEach(product => {
        pairs[product.id] = product;
    });
    return { status: true, order, products: pairs, session, cashier: order.cashier };
}

const emptyOrder = (message) => ({ status: false, message, order: {}, products: [], session: [] });

router.get('/view-order/:id', fetchuser.optional, async (req, res) => {
    try {
        const order = await Order.query().findById(req.params.id).withGraphFetched('cashier(selectName)')
            .modifiers({ selectName: b => b.select('id', 'name') });
        if (!order) return res.json(emptyOrder("Order doesn't exist!"));
        return res.json(await orderDetails(order));
    } catch (e) {
        console.log(e.message);
        return res.json(emptyOrder(e.message));
    }
});

router.get(`/last-order`, fetchuser.optional, async (req, res) => {
    try {
        const order = await Order.query().orderBy('id', 'desc').withGraphFetched('cashier(selectName)')
            .modifiers({ selectName: b => b.select('id', 'name') }).first();
        if (!order) return res.json(emptyOrder('No orders yet!'));
        return res.json(await orderDetails(order));
    } catch (e) {
        console.log(e.message);
        return res.json(emptyOrder(e.message));
    }
})

router.post(`/x-report`, fetchuser, async (req, res) => {
    try {
        const { status, message, html } = await generateReport({ ...req.body, type: 'X' })
        return res.json({ status, message, html });
    } catch (error) {
        return res.json({ status: false, message: error.message });
    }
});

router.post(`/z-report`, fetchuser, async (req, res) => {
    try {
        const { status, message, html } = await generateReport({ ...req.body, type: 'Z' })
        res.json({ status, message, html })
    } catch (error) {
        console.log(error)
        res.json({ status: false, message: error.message })
    }
})

function createPdfBuffer(html) {
    return new Promise((resolve, reject) => {
        pdf.create(html, { format: 'A4' }).toBuffer((err, buffer) => (err ? reject(err) : resolve(buffer)));
    });
}

async function generateReport(payload) {
    const Rtype = payload.type;
    const currency = payload.currency || await activeCurrencySymbol();

    let register = null;
    if (payload.register_id) {
        register = await CashRegister.query().findById(payload.register_id);
    }
    if (Rtype === 'Z') {
        if (!register) throw new Error('No cash register selected!');
        if (!register.status) throw new Error('Z-report was already generated for this cash register!');
    }

    const orders = Order.query()
        .join('cashier_sessions as cs', 'orders.id', 'cs.order_id')
        .select('orders.id', 'orders.amount', 'orders.payment_mode', 'cs.data');
    if (payload.today || Rtype === 'Z') {
        if (!payload.register_id) throw new Error('No cash register selected!');
        orders.where('cs.cash_register_id', payload.register_id);
    } else {
        // created_at is UTC; compare on the shop's local date so late-evening sales don't
        // move to the next/previous day.
        const today = getCurrentDate('ymd');
        orders.whereBetween(raw("strftime('%Y-%m-%d', orders.created_at, 'localtime')"), [payload.from || today, payload.to || today]);
    }
    const rows = (await orders).map(order => ({ ...order, data: parseData(order.data) }));

    // Load every product used in these orders once, instead of one query per line.
    const productIds = new Set();
    rows.forEach(order => (order.data.products || []).forEach(id => !isQuickItem(id) && productIds.add(id)));
    const productList = productIds.size
        ? await Product.query().whereIn('id', [...productIds]).withGraphFetched('category').select('id', 'category_id', 'price', 'tax')
        : [];
    const productsById = Object.fromEntries(productList.map(p => [String(p.id), p]));

    let totalProducts = 0, total = 0, returns = 0, tax = 0, cash = 0, card = 0, account = 0, discounts = 0;
    const categories = {}, qt = {}, taxes = {};
    const addTo = (bucket, key, value) => { bucket[key] = (bucket[key] || 0) + value; };

    for (const order of rows) {
        const data = order.data;
        const orderTotal = toNumber(data.total ?? order.amount);
        const QT = data.quantity || {};
        const linePrices = data.price || {}; // line totals: unit price × quantity, negative for returns
        total += orderTotal;

        for (const id of Array.from(new Set(data.products || []))) {
            const qty = toNumber(QT[id]);
            if (isQuickItem(id)) {
                const line = toNumber(linePrices[id]);
                addTo(categories, 'Others', line);
                addTo(qt, 'Others', qty);
                if (line < 0) returns += line;
                continue;
            }
            const product = productsById[String(id)];
            const unitPrice = toNumber(product?.price);
            const line = linePrices[id] !== undefined ? toNumber(linePrices[id]) : unitPrice * qty;
            const categoryName = product?.category?.name || 'Others';
            addTo(categories, categoryName, line);
            addTo(qt, categoryName, qty);

            const rate = parseTaxRate(product?.tax);
            if (rate) {
                const lineTax = includedTax(line, rate);
                tax += lineTax;
                addTo(taxes, `${rate}%`, lineTax);
            }
            if (line < 0) {
                returns += line;
            } else if (unitPrice * qty > line) {
                discounts += unitPrice * qty - line;
            }
        }

        totalProducts += Object.values(QT).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);

        const paid = paymentBreakdown(orderTotal, order.payment_mode, data.modes);
        cash += paid.cash;
        card += paid.card;
        account += paid.account;
    }

    const me = payload.myID ? await User.query().findById(payload.myID) : null;
    const data = {
        total_products: totalProducts,
        total_customers: 0,
        return_amount: round2(returns).toFixed(2),
        total_tax: round2(tax),
        total_amount: round2(total),
        cash: round2(cash),
        card: round2(card),
        account: round2(account),
        discounts: round2(discounts),
        number_of_transactions: rows.length,
        categories,
        taxes: Object.fromEntries(Object.entries(taxes).map(([rate, amount]) => [rate, `${currency}${round2(amount).toFixed(2)}`])),
        qt,
        Rtype,
        print: false,
        currency,
        userName: me?.name ?? '',
        b64,
    };
    if (register) {
        data.register = {
            open: register.opening_cash ?? 0,
            close: currency + round2(register.closing_cash).toFixed(2),
        };
    }
    const view = await generatePdf(data);
    let message = 'X-report generated!';

    if (Rtype === 'Z') {
        // Close the register first: the day is over even if saving the PDF copy fails.
        await CashRegister.query().findById(register.id).patch({ status: false });
        message = 'Z-report generated! Sessions are reset';
        try {
            const file = `reports/${format(new Date(), 'dd_MM_yyyy_HH-mm-ss')}_Z_report_${register.id}.pdf`;
            const buffer = await createPdfBuffer(await generatePdf({ ...data, print: true }));
            await storage.put(file, buffer);
            await Report.query().insert({ path: file, date: new Date().toISOString() });
        } catch (err) {
            console.error('Saving Z-report PDF failed:', err);
            message += ' (PDF copy could not be saved)';
        }
    }

    return { status: true, html: view, message };
}

router.get('/reports', async (req, res) => {
    try {
        const reports = await Report.query().orderBy('id', 'desc');
        return res.json({ status: true, reports })
    } catch (error) {
        return res.json({ status: false, reports: [] })
    }
})

router.get('/day-close/:id', fetchuser, async (req, res) => {
    try {
        const register = await CashRegister.query().findById(req.params.id);
        // Closing a day that is already closed is not an error for the UI.
        if (register && !register.status) return res.json({ status: true });
        await generateReport({
            register_id: req.params.id,
            type: 'Z',
            myID: req.user.id,
        });
        return res.json({ status: true })
    } catch (error) {
        console.log(error)
        return res.json({ status: false, message: error.message })
    }
})

router.get('/remove-report/:id', fetchuser.optional, async (req, res) => {
    try {
        const report = await Report.query().findById(req.params.id);
        if (!report) return res.json({ status: false, message: "Report doesn't exist!" });
        removeStored(report.path);
        await Report.query().deleteById(req.params.id)
        return res.json({ status: true, message: "Report removed!" })
    } catch (error) {
        return res.json({ status: false, message: error.message })
    }
})

// Not used by the UI. Admin only; restores stock and takes back only the cash part.
router.get('/remove-order/:order', fetchuser, async (req, res) => {
    try {
        const me = await User.query().findById(req.user.id);
        if (!me || me.type !== 'admin') {
            return res.status(403).json({ status: false, message: 'Only an admin can remove orders!' });
        }
        const order = await Order.query().findById(req.params.order);
        if (!order) return res.json({ status: false, message: "Order doesn't exist!" })
        const register = await CashRegister.query().findById(order.cash_register_id)
        if (!register || !register.status) {
            return res.json({
                status: false,
                message: "Only removal of current session is allowed!"
            })
        }

        await Order.transaction(async (trx) => {
            const session = await CashierSession.query(trx).where('order_id', order.id).first();
            const data = parseData(session?.data);
            if (await isInventoryOn(trx)) {
                for (const [productId, qty] of Object.entries(data.quantity || {})) {
                    if (isQuickItem(productId)) continue;
                    const wasReturn = toNumber(data.price?.[productId]) < 0;
                    await Product.query(trx).findById(productId).patch({
                        quantity: Product.raw(wasReturn ? 'quantity - ?' : 'quantity + ?', [toNumber(qty)]),
                    });
                }
            }
            const drawerCash = round2(cashPortion(order.amount, order.payment_mode, data.modes));
            await CashRegister.query(trx).findById(order.cash_register_id).patch({
                closing_cash: CashRegister.raw('closing_cash - ?', [drawerCash]),
            });
            await CashierSession.query(trx).where('order_id', order.id).delete();
            await Order.query(trx).deleteById(order.id);
            // Keep a trace of who removed what.
            await Notification.query(trx).insert({
                content: `Order #${order.id} (${order.amount}) removed by ${me.name}`,
                created_at: new Date().toISOString(),
                user_id: me.id,
            });
        });

        return res.json({ status: true, message: "Order has been removed from records!", removed: 1 })
    } catch (error) {
        return res.json({ status: false, message: error.message })
    }
})

module.exports = router
