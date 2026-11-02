const express = require("express");
const Category = require('../models/ProductCategory');
const Product = require('../models/Product');
const router = express.Router();

const fetchuser = require('../middlewares/loggedIn');
const toBool = (value) => !(value === false || value === 'false' || value === 0 || value === '0');

router.get('/', async (req, res) => {
    try {
        let categories = Category.query()
        if (req.query.list === undefined) {
            categories = categories.where('status', true)
        }
        categories = categories
        .orderByRaw(`
            CASE 
                WHEN name LIKE 'veg%' THEN 1
                WHEN name LIKE 'fruits' THEN 2
                WHEN name LIKE 'extra%' THEN 3
                WHEN name LIKE 'Rice%' THEN 4
                WHEN name LIKE 'Floo%' THEN 5
                WHEN name LIKE 'Atta%' THEN 6
                WHEN name LIKE 'Groce%' THEN 7
                WHEN name LIKE 'Spice%' THEN 8
                WHEN name LIKE 'Oil%' THEN 9
                WHEN name LIKE 'Ghee%' THEN 10
            ELSE 11
            END
        `);
        return res.json({ status: true, categories: await categories });
    } catch (e) {
        console.log("exception occured: ", e)
        return res.status(400).json({ status: false, message: e.message })
    }
});

router.post('/create', fetchuser, async (req, res) => {
    try {
        const category = await Category.query().insert({
            name: req.body.name,
            color: req.body.color ?? '#fff',
            status: toBool(req.body.status ?? true),
        });
        return res.json({ status: true, category });
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message })
    }
});

router.post('/update', fetchuser, async (req, res) => {
    try {
        const patch = { name: req.body.name, color: req.body.color };
        if (req.body.status !== undefined) patch.status = toBool(req.body.status);
        const updated = await Category.query().findById(req.body.id).patch(patch);
        if (!updated) return res.json({ status: false, message: "Category doesn't exist!" });
        return res.json({ status: true, message: 'Category updated successfully' });
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message })
    }
});

router.get('/remove/:id', fetchuser, async (req, res) => {
    try {
        // The UI warns "Products associated with this category will also be deleted!" and drops
        // them from its lists, so do the same here (soft delete) instead of leaving orphans.
        const categoryDeleted = await Category.transaction(async (trx) => {
            await Product.query(trx).where('category_id', req.params.id).patch({ deleted: true });
            return Category.query(trx).deleteById(req.params.id);
        });
        return res.json({ status: Boolean(categoryDeleted), categoryDeleted });
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message })
    }
});

router.get('/toggle/:id/:status', fetchuser, async (req, res) => {
    try {
        const category = await Category.query().patchAndFetchById(req.params.id, {
            status: toBool(req.params.status)
        });
        if (!category) return res.json({ status: false, category: {}, message: "Category doesn't exist!" });
        return res.json({ status: true, category, message: "Status updated!" });
    } catch (error) {
        return res.json({ status: false, category: {}, message: error.message })
    }
})

module.exports = router
