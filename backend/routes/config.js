const express = require("express");
const Setting = require('../models/Setting');
const Notification = require('../models/Notification');
const router = express.Router();
const fetchuser = require('../middlewares/loggedIn');
const config = require('../config');
const { uploadFile, getCurrentDate } = require("../utils");
const { STORE_KEYS, getStoreSetting, setStoreSetting } = require('../utils/settings');

// The user's own settings, with shop-wide keys (stock alert, inventory) taken from the shop.
async function settingsFor(userId) {
    const own = await Setting.query().where('user_id', userId).whereNotIn('key', STORE_KEYS).select('key', 'value');
    for (const key of STORE_KEYS) {
        const store = await getStoreSetting(key);
        if (store) own.push({ key, value: store.value });
    }
    return own;
}

router.get('/stock-alert', fetchuser, async (req, res) => {
    try {
        const alert = await getStoreSetting('STOCK_ALERT');
        if (!alert) return res.json({ status: false, stock: 0 });
        let stock = alert.value;
        try { stock = JSON.parse(alert.value); } catch (e) {}
        return res.json({ status: true, stock });
    } catch (error) {
        return res.json({ status: false, stock: 0 })
    }
})

router.post('/update-stock-alert', fetchuser, async (req, res) => {
    try {
        const result = await setStoreSetting(req.user.id, 'STOCK_ALERT', String(req.body.stock ?? ''));
        return res.json({ status: true, message: result === 'updated' ? "Stock alert updated!" : "Stock alert created!" });
    } catch (e) {
        console.log("exception occured: ", e)
        return res.status(400).json({ status: false, message: e.message })
    }
});

router.get('/clear-notifications', fetchuser, async (req, res) => {
    try {
        await Notification.query().where('user_id', req.user.id).delete();
        return res.json({ status: true })
    } catch (error) {
        console.log(error.message);
        return res.json({ status: false })
    }
})

router.get('/notifications', fetchuser, async (req, res) => {
    try {
        return res.json({ status: true, notifications: await Notification.query().where('user_id', req.user.id) })
    } catch (err) {
        console.log(err.message)
        return res.json({ status: false, notifications: [] })
    }
})

router.get('/notification/delete/:id', fetchuser.optional, async (req, res) => {
    try {
        await Notification.query().where('id', req.params.id).delete();
        return res.json({ status: true })
    } catch (error) {
        return res.json({ status: false })
    }
})

router.get('/inventory/:state', fetchuser, async (req, res) => {
    try {
        const state = req.params.state === 'true' ? 'true' : 'false';
        await setStoreSetting(req.user.id, 'INVENTORY_IS', state);
        return res.json({ status: true })
    } catch (error) {
        console.log(error.message)
        return res.json({ status: false })
    }
})

router.get('/settings/:key', fetchuser, async (req, res) => {
    try {
        const key = req.params.key;
        const setting = STORE_KEYS.includes(key)
            ? await getStoreSetting(key)
            : await Setting.query().where('user_id', req.user.id).where('key', key).first();
        return res.json({ status: true, [key]: setting ? { value: setting.value } : '' })
    } catch (err) {
        return res.json({ status: false, [req.params.key]: '' })
    }
});

router.get(`/settings`, fetchuser, async (req, res) => {
    try {
        return res.json({ status: true, settings: await settingsFor(req.user.id) })
    } catch (err) {
        res.json({ status: false, settings: [] })
    }
})

router.get(`/upload-db/:client`, fetchuser, async (req, res) => {
    try {
        const uploaded = await uploadFile(config.dbPath, `${config.cloudUrl}/upload-db`, req.params.client)
        if (uploaded) {
            const today = getCurrentDate('ymd')
            const last = await Setting.query().where('key', "LAST_UPDATED").where('user_id', req.user.id).first();
            if (last) {
                await Setting.query().findById(last.id).patch({ value: today });
            } else {
                await Setting.query().insert({ user_id: req.user.id, key: "LAST_UPDATED", value: today });
            }
            return res.json({ status: true, settings: await settingsFor(req.user.id) })
        }
        return res.json({
            status: false,
            message: "Failed to upload backup!",
            settings: await settingsFor(req.user.id)
        })
    } catch (err) {
        console.log(err.message)
        res.json({ status: false, message: err.message })
    }
})

module.exports = router
