const router = require('express').Router();
const fetchuser = require('../middlewares/loggedIn');
const User = require('../models/User');
const offers = require('../utils/offers');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const Product = require('../models/Product');

// Offers. The till and the customer display read today's offers (no login needed, like the
// product list); only an admin can create, change or delete them.

async function adminOnly(req, res, next) {
    try {
        const me = await User.query().findById(req.user.id);
        if (!me || me.type !== 'admin') {
            return res.status(403).json({ status: false, message: 'Only an admin can change offers.' });
        }
        next();
    } catch (err) {
        next(err);
    }
}

// Validation errors become 400/404 with a message the UI shows as it is.
const handle = (fn) => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof offers.OfferError) return res.status(err.status).json({ status: false, message: err.message });
        next(err);
    }
};

// Offers that cannot be read (e.g. the tables are missing) never stop the till from selling.
const orEmpty = (fn, empty) => async (req, res) => {
    try {
        return res.json({ status: true, ...(await fn(req)) });
    } catch (err) {
        console.error('Offers unavailable:', err.message);
        return res.json({ status: true, ...empty });
    }
};

router.get('/active', orEmpty(async () => ({ offers: await offers.listActive() }), { offers: [] }));

router.get('/customer-screen', orEmpty(async () => ({ offers: await offers.customerScreen() }), { offers: [] }));

// The customer display's showcase while nobody is paying: a random handful of products that have
// a picture (the file must exist, so the screen never shows a broken image) and a fixed shelf
// price. Items priced at the till by weight (vegetables, sweets, paneer) are left out.
const WEIGHED = ['vegetables', 'sweets'];
router.get('/showcase', orEmpty(async () => {
    const rows = await Product.query()
        .leftJoin('product_categories as c', 'products.category_id', 'c.id')
        .where('products.deleted', false)
        .whereNotNull('products.image')
        .where('products.image', '!=', '')
        .whereRaw('CAST(products.price AS REAL) > 0')
        .select('products.id', 'products.name', 'products.price', 'products.image', 'c.name as category')
        .orderByRaw('RANDOM()')
        .limit(60);
    const products = rows
        .filter((p) => !WEIGHED.includes(String(p.category || '').trim().toLowerCase()) && String(p.name).trim().toLowerCase() !== 'paneer')
        .filter((p) => {
            const file = path.resolve(config.tmpDir, String(p.image));
            return file.startsWith(path.resolve(config.tmpDir)) && fs.existsSync(file);
        })
        .slice(0, 18)
        .map(({ id, name, price, image }) => ({ id, name, price, image }));
    return { products };
}, { products: [] }));

router.post('/apply', handle(async (req, res) => {
    let result;
    try {
        result = await offers.apply(req.body?.lines);
    } catch (err) {
        if (err instanceof offers.OfferError) throw err;
        console.error('Offers could not be applied:', err.message);
        result = { lines: [], offers: [], totalDiscount: 0 };
    }
    res.json({ status: true, ...result });
}));

router.get('/', fetchuser, handle(async (req, res) => {
    res.json({ status: true, offers: await offers.list() });
}));

router.get('/:id', fetchuser, handle(async (req, res) => {
    res.json({ status: true, offer: await offers.get(req.params.id) });
}));

router.post('/', fetchuser, adminOnly, handle(async (req, res) => {
    res.json({ status: true, message: 'Offer saved!', offer: await offers.create(req.body) });
}));

router.put('/:id', fetchuser, adminOnly, handle(async (req, res) => {
    res.json({ status: true, message: 'Offer saved!', offer: await offers.update(req.params.id, req.body) });
}));

// Switches on the list page, e.g. { active: false } or { show_on_customer_screen: true }.
router.patch('/:id', fetchuser, adminOnly, handle(async (req, res) => {
    res.json({ status: true, offer: await offers.update(req.params.id, req.body, { partial: true }) });
}));

router.delete('/:id', fetchuser, adminOnly, handle(async (req, res) => {
    await offers.remove(req.params.id);
    res.json({ status: true, message: 'Offer deleted!' });
}));

module.exports = router;
