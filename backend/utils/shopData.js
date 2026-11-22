// A new install fills itself with India Gate's shop data (products and pictures) when
// the installer ships it in resources/seed (added by .github/workflows/release.yml, never in git).
// Only a database with no products and no orders is replaced. Its users, website settings and
// website orders are carried over, and the old file stays next to it as a backup.
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const config = require('../config');

const open = (file, mode) => new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, mode, (err) => (err ? reject(err) : resolve(db)));
});
const all = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});
const run = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});
const close = (db) => new Promise((resolve) => db.close(() => resolve()));

async function columns(db, schema, table) {
    return (await all(db, `pragma ${schema}.table_info("${table}")`)).map((c) => c.name);
}

async function count(db, table) {
    if (!(await columns(db, 'main', table)).length) return 0;
    return (await all(db, `select count(*) as n from "${table}"`))[0].n;
}

async function hasShopData(file) {
    if (!fs.existsSync(file)) return false;
    const db = await open(file, sqlite3.OPEN_READONLY);
    try {
        return (await count(db, 'products')) > 0 || (await count(db, 'orders')) > 0;
    } finally {
        await close(db);
    }
}

// What the empty install may already hold that the shop data doesn't: the admin account made on
// first start, the website connection and website orders. The install's own values win.
const CARRY_OVER = [
    ['users', 'INSERT OR IGNORE'],
    ['website_state', 'INSERT OR REPLACE'],
    ['web_orders', 'INSERT OR IGNORE'],
];

async function carryOver(dbFile, backup) {
    const db = await open(dbFile, sqlite3.OPEN_READWRITE);
    try {
        await run(db, 'ATTACH DATABASE ? AS old', [backup]);
        for (const [table, verb] of CARRY_OVER) {
            const oldCols = new Set(await columns(db, 'old', table));
            const cols = (await columns(db, 'main', table)).filter((c) => oldCols.has(c));
            if (!cols.length) continue;
            const list = cols.map((c) => `"${c}"`).join(', ');
            await run(db, `${verb} INTO main."${table}" (${list}) SELECT ${list} FROM old."${table}"`);
        }
        await run(db, 'DETACH DATABASE old');
    } finally {
        await close(db);
    }
}

// Must run before anything else opens the database.
async function loadShopData() {
    if (!config.seedDir) return false;
    const seedDb = path.join(config.seedDir, 'database', 'db.sqlite');
    if (!fs.existsSync(seedDb)) return false;
    const dbFile = config.dbPath;
    if (await hasShopData(dbFile)) return false;

    let backup = null;
    if (fs.existsSync(dbFile)) {
        backup = `${dbFile}.before-shop-data-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        fs.renameSync(dbFile, backup);
        for (const suffix of ['-journal', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
    }
    fs.copyFileSync(seedDb, dbFile);
    const files = path.join(config.seedDir, 'files');
    if (fs.existsSync(files)) fs.cpSync(files, config.tmpDir, { recursive: true, force: false });
    if (backup) await carryOver(dbFile, backup);
    console.log('Loaded the India Gate shop data into this install.');
    return true;
}

module.exports = { loadShopData };
