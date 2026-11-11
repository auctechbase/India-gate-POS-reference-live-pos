const router = require("express").Router();
const fetchuser = require('../middlewares/loggedIn');
const User = require('../models/User');
const sync = require('../utils/websiteSync');

// Website orders. The POS copies them from the website's POS API (utils/websiteSync.js); the
// cashier moves them through the statuses and every change is sent back to the website.

async function adminOnly(req, res, next) {
    try {
        const me = await User.query().findById(req.user.id);
        if (!me || me.type !== 'admin') {
            return res.status(403).json({ status: false, message: 'Only an admin can change the website connection.' });
        }
        req.me = me;
        next();
    } catch (err) {
        next(err);
    }
}

router.get('/orders', fetchuser, async (req, res, next) => {
    try {
        const { configured, connected, lastSyncAt, lastError } = sync.status;
        return res.json({ status: true, configured, connected, lastSyncAt, lastError, orders: await sync.listOrders() });
    } catch (err) {
        next(err);
    }
});

// Fetch from the website right now instead of waiting for the next poll.
router.post('/refresh', fetchuser, async (req, res, next) => {
    try {
        await sync.syncNow();
        const { configured, connected, lastSyncAt, lastError } = sync.status;
        return res.json({ status: true, configured, connected, lastSyncAt, lastError, orders: await sync.listOrders() });
    } catch (err) {
        next(err);
    }
});

router.get('/orders/:id', fetchuser, async (req, res, next) => {
    try {
        const result = await sync.getOrder(Number(req.params.id));
        return res.status(result.http).json(result.body);
    } catch (err) {
        next(err);
    }
});

router.post('/orders/:id/status', fetchuser, async (req, res, next) => {
    try {
        const newStatus = String(req.body.status || '').trim();
        if (!newStatus) return res.status(422).json({ status: false, message: 'Choose a status.' });
        const me = await User.query().findById(req.user.id);
        const result = await sync.changeStatus(Number(req.params.id), newStatus, me ? me.name : '');
        return res.status(result.http).json(result.body);
    } catch (err) {
        next(err);
    }
});

// The API key never leaves the backend: the UI only learns whether one is saved and its last 4 characters.
router.get('/settings', fetchuser, adminOnly, async (req, res, next) => {
    try {
        return res.json({ status: true, ...(await sync.getPublicConfig()) });
    } catch (err) {
        next(err);
    }
});

router.post('/settings', fetchuser, adminOnly, async (req, res, next) => {
    try {
        let saved;
        try {
            saved = await sync.saveConfig({ url: req.body.url, apiKey: req.body.apiKey });
        } catch (err) {
            return res.status(422).json({ status: false, message: err.message });
        }
        await sync.syncNow();
        const { configured, connected, lastError } = sync.status;
        return res.json({ status: true, message: 'Website connection saved.', ...saved, configured, connected, lastError });
    } catch (err) {
        next(err);
    }
});

router.post('/test', fetchuser, adminOnly, async (req, res, next) => {
    try {
        return res.json({ status: true, ...(await sync.testConnection({ url: req.body.url, apiKey: req.body.apiKey })) });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
