const express = require("express");
const Tax = require('../models/Tax');
const router = express.Router();

const fetchuser = require('../middlewares/loggedIn');
const toBool = (value) => !(value === false || value === 'false' || value === 0 || value === '0');

router.get('/', async (req, res) => {
    try {
        const taxes = await Tax.query().where('status', true);
        return res.json({ status: true, taxes });
    } catch (e) {
        console.log("exception occured: ", e)
        return res.status(400).json({ status: false, message: e.message })
    }
});

router.get('/list', async (req, res) => {
    try {
        const taxes = await Tax.query();
        return res.json({ status: true, taxes });
    } catch (e) {
        console.log("exception occured: ", e)
        return res.status(400).json({ status: false, message: e.message })
    }
});

router.post('/create', fetchuser, async (req, res) => {
    try {
        const tax = await Tax.query().insert({
            name: req.body.name,
            amount: req.body.amount ?? 0,
            status: toBool(req.body.status ?? true),
        });
        return res.json({ status: true, tax });
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message })
    }
});

router.post('/update', fetchuser, async (req, res) => {
    try {
        const patch = { name: req.body.name, amount: req.body.amount };
        if (req.body.status !== undefined) patch.status = toBool(req.body.status);
        const tax = await Tax.query().patchAndFetchById(req.body.id, patch);
        if (!tax) return res.json({ status: false, message: "Tax doesn't exist!" });
        return res.json({ status: true, tax });
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message })
    }
});

router.get('/remove/:id', fetchuser, async (req, res) => {
    try {
        const taxDeleted = await Tax.query().deleteById(req.params.id);
        return res.json({ status: Boolean(taxDeleted), taxDeleted });
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message })
    }
});

router.get('/toggle/:id/:status', fetchuser, async (req, res) => {
    try {
        const tax = await Tax.query().patchAndFetchById(req.params.id, {
            status: toBool(req.params.status)
        });
        if (!tax) return res.json({ status: false, tax: {}, message: "Tax doesn't exist!" });
        return res.json({ status: true, tax, message: "Status updated!" });
    } catch (error) {
        return res.json({ status: false, tax: {}, message: error.message })
    }
})

module.exports = router
