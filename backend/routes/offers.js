const router = require('express').Router();
const fetchuser = require('../middlewares/loggedIn');
const User = require('../models/User');
const offers = require('../utils/offers');

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
