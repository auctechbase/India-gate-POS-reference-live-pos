const Setting = require('../models/Setting');

// STOCK_ALERT and INVENTORY_IS describe the shop, not one cashier, but are stored with a
// user_id. Reads ignore the user and writes update every row, so all users see one value.
const STORE_KEYS = ['STOCK_ALERT', 'INVENTORY_IS'];

async function getStoreSetting(key, trx) {
    return Setting.query(trx).where('key', key).orderBy('id', 'desc').first();
}

async function setStoreSetting(userId, key, value, trx) {
    const updated = await Setting.query(trx).where('key', key).patch({ value });
    const own = await Setting.query(trx).where('key', key).where('user_id', userId).first();
    if (!own) await Setting.query(trx).insert({ user_id: userId, key, value });
    return updated > 0 ? 'updated' : 'created';
}

async function isInventoryOn(trx) {
    const setting = await getStoreSetting('INVENTORY_IS', trx);
    return !setting || String(setting.value) === 'true';
}

module.exports = { STORE_KEYS, getStoreSetting, setStoreSetting, isInventoryOn };
