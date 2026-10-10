const express = require("express");
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const axios = require('axios');
const ProductCategory = require('../models/ProductCategory');
const Product = require('../models/Product');
const Tax = require('../models/Tax');
const router = express.Router();

const fetchuser = require('../middlewares/loggedIn');
const upload = require('../middlewares/multer');
const { saveWebp, removeStored, safeName } = require('../utils/images');
const { toNumber, parseTaxRate, includedTax } = require('../utils/money');
const { normalizeSpaces } = require('../utils');
const config = require('../config');

const cloud = axios.create({ baseURL: config.cloudUrl, timeout: config.cloudTimeoutMs });

const text = (value) => (value === undefined || value === null ? '' : String(value).trim());
const priceText = (value) => text(value).replace(/\s+/g, '').replace(',', '.') || '0';
const removeUpload = (file) => file && fs.promises.unlink(file.path).catch(() => {});

// Vegetables and fruits are sold by weight/name and may have no barcode.
const barcodeOptional = (categoryName) => /vege|fruit/i.test(text(categoryName));

const PRODUCT_COLUMNS = ['id', 'name', 'price', 'code', 'tax', 'sales_desc', 'image', 'quantity', 'pos', 'category_id'];

router.get('/', async (req, res) => {
    try {
        const products = Product.query().where('deleted', false).select(PRODUCT_COLUMNS)
            .withGraphFetched('category')
            .modifyGraph('category', (builder) => builder.select('product_categories.name as catName'));
        const categoryId = req.query.category_id;
        if (categoryId && categoryId !== 'all') {
            products.where('category_id', categoryId).orderByRaw('CAST(quantity AS REAL) DESC');
        } else {
            products.orderBy('id', 'desc');
        }
        return res.json({ status: true, products: (await products).map(item => {
            if (item.category) item.catName = item.category.catName;
            delete item.category;
            return item;
        }) })
    } catch (e) {
        return res.status(400).json({ status: false, message: e.message });
    }
});

router.post(`/updateStock/:id`, fetchuser, async (req, res) => {
    try {
        const updated = await Product.query().patchAndFetchById(req.params.id, {
            quantity: text(req.body.quantity) || '0'
        });
        if (!updated) return res.json({ status: false, message: "Product doesn't exist!" });
        return res.json({ status: true, message: 'Stock updated!', product: updated });
    } catch (error) {
        return res.json({ status: false, message: "Something went wrong!" });
    }
});

router.post('/create', [upload.single('image'), fetchuser], async (req, res) => {
    try {
        const name = text(req.body.name);
        if (!name) return res.json({ status: false, message: 'Product name is required!' });
        const code = text(req.body.barcode) || null;
        const category = req.body.category_id
            ? await ProductCategory.query().findById(req.body.category_id)
            : null;
        if (!code && !barcodeOptional(category?.name)) {
            return res.json({ status: false, message: "Barcode can't be empty!" });
        }
        if (code) {
            const existing = await Product.query().where('code', code).where('deleted', false).first()
            if (existing) return res.json({ status: false, message: "This barcode already exists!" });
        }
        const payload = {
            name,
            price: priceText(req.body.price),
            code,
            category_id: category ? category.id : null,
        }
        if (req.body.tax !== undefined && text(req.body.tax) !== '') payload.tax = text(req.body.tax);
        if (req.body.sales_desc !== undefined) payload.sales_desc = text(req.body.sales_desc);
        if (req.file) {
            payload.image = await saveWebp(req.file.path, 'products', `${Date.now()}_${code || name}`);
        }

        const product = await Product.query().insertAndFetch(payload);
        return res.json({ status: true, message: "Product added successfully!", product: category ? { ...product, catName: category.name } : product });
    } catch (e) {
        console.log(e.message)
        return res.status(500).json({ status: false, message: e.message })
    } finally {
        removeUpload(req.file);
    }
});

router.post('/import', [upload.single('file'), fetchuser], async (req, res) => {
    try {
        if (!req.file) return res.json({ status: false, message: 'No file uploaded!' });
        const workbook = XLSX.readFile(req.file.path);
        const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        let created = 0, updated = 0, skipped = 0;

        for (const row of sheetData) {
            const name = text(row.Name);
            if (!name) { skipped++; continue; }

            let category = null;
            const catName = row['Product Categories'] ? normalizeSpaces(String(row['Product Categories'])) : '';
            if (catName) {
                category = await ProductCategory.query().findOne({ name: catName })
                    || await ProductCategory.query().insert({ name: catName });
            }

            const fields = {
                name,
                price: priceText(row['Sales Price']),
                sales_desc: row['Sales Description'] ?? null,
                category_id: category ? category.id : null,
                tax: row['Customer Taxes'] ?? null,
            };
            if (row.Images) {
                const image = await downloadAndProcessImage(row.Images);
                if (image) fields.image = image;
            }

            const code = text(row.Barcode) || null;
            const existing = code
                ? await Product.query().where('code', code).where('deleted', false).first()
                : await Product.query().where('name', name).whereNull('code').where('deleted', false).first();
            if (existing) {
                await Product.query().findById(existing.id).patch(fields);
                updated++;
            } else {
                await Product.query().insert({ ...fields, code });
                created++;
            }
        }
        return res.json({ status: true, message: `Products successfully imported! (${created} new, ${updated} updated${skipped ? `, ${skipped} skipped` : ''})` });
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message })
    } finally {
        removeUpload(req.file);
    }
});

router.post('/update', [upload.single('uploaded'), fetchuser], async (req, res) => {
    try {
        const product = await Product.query().findById(req.body.id);
        if (!product) return res.json({ status: false, message: "Product doesn't exist!" });

        const code = text(req.body.code) || null;
        if (!code && req.body.catName && !barcodeOptional(req.body.catName)) {
            return res.json({ status: false, message: "Barcode can't be empty!" });
        }
        if (code) {
            const duplicate = await Product.query().where('code', code).where('deleted', false).where('id', '!=', product.id).first();
            if (duplicate) return res.json({ status: false, message: "This barcode already exists!" });
        }
        const body = {
            name: text(req.body.name) || product.name,
            price: req.body.price !== undefined ? priceText(req.body.price) : product.price,
            tax: req.body.tax !== undefined && req.body.tax !== 'null' ? req.body.tax : product.tax,
            code,
        }
        if (req.body.category_id) body.category_id = req.body.category_id;
        if (req.file) {
            body.image = await saveWebp(req.file.path, 'products', `${Date.now()}_${code || body.name}`);
            removeStored(product.image);
        }

        // Save locally first: the shop must keep working without internet.
        const updated = await Product.query().patchAndFetchById(product.id, body);

        let wasTrue = false;
        try {
            const toSync = { name: body.name, price: body.price, barcode: body.code, tax: body.tax };
            if (req.body.category_id) toSync.category = req.body.catName;
            const { data } = await cloud.post('/products/update-product', toSync, {
                headers: { 'Authorization': req.body.appKey || config.cloudKey, 'Content-Type': 'application/json' }
            });
            wasTrue = Boolean(data?.status);
        } catch (e) {
            console.log('Cloud sync of product update failed:', e.message);
        }
        return res.json({ status: true, updated, wasTrue });
    } catch (e) {
        console.log(e)
        return res.json({ status: false, message: e.message })
    } finally {
        removeUpload(req.file);
    }
});

// :id is "<productId>_<appKey>" (that's what the UI sends).
router.get('/remove/:id', fetchuser, async (req, res) => {
    try {
        const [productId, appKey] = String(req.params.id).split('_');
        const product = await Product.query().findById(productId);
        if (!product) {
            return res.json({ status: false, removed: '', message: 'Failed to remove!', data: { status: false } });
        }
        const removed = await Product.query().patchAndFetchById(product.id, { deleted: true });
        // A missing image file must not block deleting the product.
        removeStored(product.image);

        let disconnected = false, rest;
        try {
            const { data } = await cloud.post('/products/remove-product', { product }, {
                headers: { 'Authorization': appKey || config.cloudKey, 'Content-Type': 'application/json' }
            });
            rest = data;
        } catch (e) {
            console.log(e.message);
            disconnected = true;
        }
        return res.json({ status: true, removed, message: 'Product removed', data: rest, disconnected });
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message })
    }
});

// Returns the stored path ("products/x.webp") or null when the image can't be fetched.
async function downloadAndProcessImage(imageUrl) {
    try {
        const response = await axios({ method: 'get', url: imageUrl, responseType: 'arraybuffer', timeout: config.cloudTimeoutMs });
        const baseName = path.basename(new URL(imageUrl).pathname).split('.')[0];
        return await saveWebp(Buffer.from(response.data), 'products', `${Date.now()}_${safeName(baseName)}`, 35);
    } catch (error) {
        console.error('Error downloading or processing the image:', error.message);
        return null;
    }
}

router.get(`/update-product-pos/:id/:status`, fetchuser, async (req, res) => {
    try {
        const { id, status } = req.params;
        const pos = status === 'true' || status === '1';
        await Product.query().findById(id).patch({ pos });
        const product = await Product.query().findById(id).select(['id', 'name', 'image', 'price', 'quantity', 'category_id', 'sales_desc', 'code']);
        if (!product) return res.json({ status: false, product: {} });
        const category = product.category_id ? await ProductCategory.query().findById(product.category_id).select(['name']) : null;
        return res.json({ status: true, product: { ...product, catName: category?.name ?? null } });
    } catch (error) {
        console.log(error.message);
        return res.json({ status: false, product: {} })
    }
});

router.get(`/barcode/:code`, async (req, res) => {
    try {
        const product = await Product.query().where('code', text(req.params.code)).where('deleted', false).first();
        return res.json({ status: Boolean(product), product: product || {} });
    } catch (error) {
        return res.json({ status: false, product: {} });
    }
})

router.post(`/create-custom`, upload.single('image'), async (req, res) => {
    try {
        const code = text(req.body.barcode) || null;
        const name = text(req.body.name);
        if (!name) return res.json({ status: false, message: 'Product name is required!', product: {} });
        if (code) {
            const existing = await Product.query().where('code', code).where('deleted', false).first();
            if (existing) {
                return res.json({ status: false, message: "A product with this barcode already exists!", product: {} });
            }
        }
        const payload = {
            name,
            price: priceText(req.body.price),
            code,
            quantity: text(req.body.quantity) || '3000',
            tax: text(req.body.tax) && req.body.tax !== 'null' ? text(req.body.tax) : null,
        }
        if (req.file) {
            payload.image = await saveWebp(req.file.path, 'products', `${Date.now()}_${code || name}`);
        }
        const product = await Product.query().insertAndFetch(payload);
        return res.json({
            status: true,
            message: "Product has been added!",
            product: { ...product, taxAmount: includedTax(product.price, parseTaxRate(product.tax)).toFixed(2) }
        })
    } catch (error) {
        console.log(`exception while syncing: ` + error.message)
        return res.json({ status: false, message: error.message, product: {} })
    } finally {
        removeUpload(req.file);
    }
})

router.get('/sync/:key', fetchuser, async (req, res) => {
    try {
        const key = encodeURIComponent(req.params.key);
        const { data } = await cloud.get(`/sync-products/${key}`)
        const products = String(data?.original || '').split('\n').map(line => {
            try { return line ? JSON.parse(line) : {}; } catch (e) { return {}; }
        });

        for (const row of products) {
            if (!row || !row.name || !row.price) continue; // only rows with a name and a price
            const name = text(row.name);
            const price = priceText(row.price);
            const taxText = text(row.tax);

            // Create the tax type if this rate doesn't exist yet ("19 %", "19%", "19").
            if (taxText) {
                const [amount, ...rest] = taxText.split(/\s+/);
                const exists = await Tax.query().where('amount', amount).first();
                if (!exists) await Tax.query().insert({ name: rest.join(' ') || `${parseTaxRate(taxText)}%`, amount });
            }

            let category = null;
            if (row.category) {
                const catName = normalizeSpaces(String(row.category));
                category = await ProductCategory.query().where('name', catName).first()
                    || await ProductCategory.query().insert({ name: catName });
            }

            const code = text(row.barCode) || null;
            const existing = code
                ? await Product.query().where('code', code).where('deleted', false).first()
                : await Product.query().where('name', name).where('deleted', false).first();
            if (existing) {
                // Never touch quantity here: the sync used to reset every stock to 5000.
                if (code) {
                    await Product.query().findById(existing.id).patch({
                        name,
                        price,
                        category_id: category?.id ?? existing.category_id ?? null,
                        tax: taxText || null,
                    });
                }
            } else {
                await Product.query().insert({
                    code,
                    name,
                    price,
                    category_id: category?.id ?? null,
                    tax: taxText || null,
                    quantity: '5000', // starting stock for products that are new in this shop
                });
            }
        }
        await cloud.get(`/synced/${key}`);
        return res.json({ status: true, message: 'Products successfully imported!', products });
    } catch (e) {
        console.log(e)
        return res.status(500).json({ status: false, message: e.message })
    }
});

module.exports = router
