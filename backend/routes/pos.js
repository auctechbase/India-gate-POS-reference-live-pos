const express = require("express");
const Product = require('../models/Product');
const CashierSession = require('../models/CashierSession');
const CashRegister = require('../models/CashRegister');
const router = express.Router();

const fetchuser = require('../middlewares/loggedIn');
const { getCurrentDate } = require("../utils");
const { toNumber, parseTaxRate, includedTax } = require('../utils/money');

const COLUMNS = ['id', 'name', 'price', 'code', 'category_id', 'sales_desc', 'tax', 'quantity', 'image'];

// :img is only a cache-buster from the UI.
router.get('/products/:img', async (req, res) => {
    try {
        const products = Product.query()
            .whereIn('pos', [1, 'true'])
            .where('deleted', false)
            .orderByRaw('CAST(quantity AS REAL) DESC')
            .select(COLUMNS)
            .withGraphFetched('category')
            .modifyGraph('category', (builder) => builder.select('product_categories.name as catName'));
        const categoryId = req.query.category_id;
        if (categoryId && categoryId !== 'all') products.where('category_id', categoryId);

        return res.json({ status: true, products: (await products).map(({ category, ...rest }) => ({
            ...rest,
            catName: category ? category.catName : null,
            // Prices already include tax (the cart never adds tax on top), so this is the tax
            // contained in one unit: price × rate / (100 + rate). It was price × rate / 100.
            taxAmount: includedTax(rest.price, parseTaxRate(rest.tax)).toFixed(2),
        })) });
    } catch (e) {
        return res.status(400).json({ status: false, message: e.message })
    }
});

// Next session number for a register (not used by the current UI).
router.post('/session', async (req, res) => {
    try {
        const last = await CashierSession.query().where('cash_register_id', req.body.cash_register_id).max('session_id as max').first();
        return res.json({ session: (Number(last?.max) || 0) + 1 })
    } catch (error) {
        return res.json({ session: 1 });
    }
});

router.post('/opening-day-cash-amount', fetchuser.optional, async (req, res) => {
    try {
        const cash = String(req.body.cash ?? '');
        const amount = toNumber(cash);
        if (amount <= 0) {
            return res.json({ status: false, message: "You can't open without a single cash amount in drawer!" });
        }
        // Only one open register at a time: if one is still open (e.g. the UI lost it after a
        // logout), hand that one back instead of creating a second one.
        const open = await CashRegister.query().where('status', true).orderBy('id', 'desc').first();
        if (open) {
            return res.json({ status: true, created: open, message: "The day is already open, continue your transactions!" });
        }
        const created = await CashRegister.query().insertAndFetch({
            opening_cash: cash,
            closing_cash: amount,
            date: getCurrentDate(),
            status: true,
            user_id: req.user?.id ?? null,
        });
        return res.json({ status: true, created, message: "You can now start transactions!" });
    } catch (error) {
        return res.json({ status: false, message: error.message })
    }
});

module.exports = router
