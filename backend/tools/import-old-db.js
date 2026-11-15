/*
 * Import data from the ORIGINAL POS into this (new) POS.
 *
 *   node tools/import-old-db.js [--catalog] "<path to old db.sqlite>" ["<path to old tmp images folder>"]
 *
 *   --catalog  Import only the catalog: categories, products, images, taxes,
 *              users, settings, customers. The old sales history (orders,
 *              receipts, cash registers, reports, stock alerts) is left out,
 *              so the new POS starts with order number 1.
 *
 * Safety rules:
 *  - The old database is opened READ-ONLY and is never modified. It can stay
 *    open in the original POS while this runs.
 *  - We take a consistent snapshot with `VACUUM INTO`, then upgrade only that
 *    copy (missing tables/columns are added so the new code can use it).
 *  - The new POS's current database (if any) is kept as db.sqlite.bak-<time>.
 *  - Images are copied, never moved, and existing files are not overwritten.
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const Knex = require('knex');

const BACKEND = path.join(__dirname, '..');
const TARGET_DB = path.join(BACKEND, 'database', 'db.sqlite');
const TARGET_IMAGES = path.join(BACKEND, 'tmp');

const args = process.argv.slice(2);
const CATALOG_ONLY = args.includes('--catalog');
const [oldDbArg, oldImagesArg] = args.filter(a => !a.startsWith('--'));
if (!oldDbArg) {
    console.log('Usage: node tools/import-old-db.js [--catalog] "<old db.sqlite>" ["<old tmp folder>"]');
    process.exit(1);
}
const OLD_DB = path.resolve(oldDbArg);
const TMP_DB = TARGET_DB + '.importing';

// Tables that hold the sales history (left empty with --catalog).
const SALES_TABLES = ['orders', 'cashier_sessions', 'cash_register', 'reports', 'web_notifications'];

const fail = msg => { console.error('\n❌ ' + msg); process.exit(1); };

// ---------- 1. Read-only snapshot of the old database ----------
function snapshotOldDb() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(OLD_DB, sqlite3.OPEN_READONLY, err => {
            if (err) return reject(err);
            // VACUUM INTO writes a clean, consistent copy to a NEW file and only
            // reads from the source, even while another program is using it.
            db.run('VACUUM INTO ?', [TMP_DB], err2 => {
                db.close();
                err2 ? reject(err2) : resolve();
            });
        });
    });
}

// ---------- 2. The schema the new POS expects ----------
// Built by running this repo's migrations on an empty in-memory database.
// (Order matters: create tables first, then the "add/alter" ones, then drops.)
async function buildReferenceSchema() {
    const ref = Knex({ client: 'sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
    const dir = path.join(BACKEND, 'migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    const isAlter = f => /^(add|alter|another)/.test(f);
    const ordered = [
        ...files.filter(f => !f.startsWith('_') && !isAlter(f)),
        ...files.filter(isAlter),
        ...files.filter(f => f.startsWith('_')),
    ];
    for (const f of ordered) {
        try { await require(path.join(dir, f)).up(ref); }
        catch (e) { if (!/already exists|no such column/.test(e.message)) throw e; }
    }
    const schema = await readSchema(ref);
    await ref.destroy();
    return schema;
}

async function readSchema(knex) {
    const tables = await knex.raw(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'knex_%'"
    );
    const schema = {};
    for (const { name, sql } of tables) {
        schema[name] = { sql, columns: await knex.raw(`PRAGMA table_info(\`${name}\`)`) };
    }
    return schema;
}

// ---------- 3. Add whatever the old database is missing ----------
async function upgrade(knex, reference) {
    const current = await readSchema(knex);
    const changes = [];
    const warnings = [];

    for (const [table, ref] of Object.entries(reference)) {
        if (!current[table]) {
            await knex.raw(ref.sql);
            changes.push(`created table ${table}`);
            continue;
        }
        const have = new Set(current[table].columns.map(c => c.name));
        for (const col of ref.columns) {
            if (have.has(col.name)) continue;
            // SQLite can't add a NOT NULL column without a default, so only keep
            // NOT NULL when there is a default value.
            let def = `\`${col.name}\` ${col.type || ''}`;
            if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
            if (col.notnull && col.dflt_value !== null) def += ' NOT NULL';
            await knex.raw(`ALTER TABLE \`${table}\` ADD COLUMN ${def}`);
            changes.push(`added ${table}.${col.name}`);
        }
        // Old columns the new code doesn't know about are kept (no data loss),
        // but a NOT NULL one without default would break inserts, so report it.
        const known = new Set(ref.columns.map(c => c.name));
        for (const col of current[table].columns) {
            if (!known.has(col.name) && col.notnull && col.dflt_value === null) {
                warnings.push(`${table}.${col.name} is NOT NULL without a default; new inserts into ${table} may fail`);
            }
        }
    }
    return { changes, warnings };
}

async function countRows(knex) {
    const tables = await knex.raw(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const counts = {};
    for (const { name } of tables) {
        counts[name] = (await knex.raw(`SELECT COUNT(*) AS n FROM \`${name}\``))[0].n;
    }
    return counts;
}

// ---------- 4. Copy product images ----------
function copyImages(from, to) {
    if (!from) return 0;
    if (!fs.existsSync(from)) { console.log(`⚠️  Images folder not found, skipped: ${from}`); return 0; }
    fs.mkdirSync(to, { recursive: true });
    let copied = 0;
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        if (!entry.isFile() || /\.zip$/i.test(entry.name)) continue; // skip update zips
        const dest = path.join(to, entry.name);
        if (fs.existsSync(dest)) continue;
        fs.copyFileSync(path.join(from, entry.name), dest);
        copied++;
    }
    return copied;
}

(async () => {
    if (!fs.existsSync(OLD_DB)) fail(`Old database not found: ${OLD_DB}`);
    if (path.resolve(OLD_DB).toLowerCase() === path.resolve(TARGET_DB).toLowerCase()) {
        fail('The old database and the new database are the same file. Point to the ORIGINAL POS database.');
    }
    fs.mkdirSync(path.dirname(TARGET_DB), { recursive: true });
    if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);

    console.log(`Reading (read-only): ${OLD_DB}`);
    await snapshotOldDb();

    const knex = Knex({ client: 'sqlite3', connection: { filename: TMP_DB }, useNullAsDefault: true });
    try {
        const before = await countRows(knex);
        const { changes, warnings } = await upgrade(knex, await buildReferenceSchema());
        const after = await countRows(knex);

        const check = (await knex.raw('PRAGMA integrity_check'))[0].integrity_check;
        if (check !== 'ok') fail(`Integrity check failed: ${check}`);

        console.log('\nSchema changes:', changes.length ? '' : 'none needed');
        changes.forEach(c => console.log('  + ' + c));
        warnings.forEach(w => console.log('  ⚠️  ' + w));

        // The upgrade must never lose rows.
        for (const [t, n] of Object.entries(after)) {
            const was = before[t] ?? 0;
            if (was !== n) fail(`Row count changed for ${t} (${was} → ${n})`);
        }

        if (CATALOG_ONLY) {
            for (const t of SALES_TABLES) {
                if (after[t] !== undefined) await knex(t).del();
            }
            // Reset the auto-increment counters so new orders start at 1.
            const hasSeq = await knex.raw("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'");
            if (hasSeq.length) await knex('sqlite_sequence').whereIn('name', SALES_TABLES).del();
            await knex.raw('VACUUM'); // shrink the file after deleting
        }

        const final = await countRows(knex);
        console.log(CATALOG_ONLY ? '\nRows imported (catalog only, sales history left out):' : '\nRows imported:');
        for (const [t, n] of Object.entries(final)) {
            if (t.startsWith('knex_') || t === 'sqlite_sequence') continue;
            const note = CATALOG_ONLY && SALES_TABLES.includes(t) ? `  (skipped ${after[t]} old rows)` : '';
            console.log(`  ${t.padEnd(20)} ${n}${note}`);
        }
    } finally {
        await knex.destroy();
    }

    if (fs.existsSync(TARGET_DB)) {
        const backup = `${TARGET_DB}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        fs.renameSync(TARGET_DB, backup);
        console.log(`\nPrevious new-POS database kept as: ${backup}`);
    }
    fs.renameSync(TMP_DB, TARGET_DB);

    const images = copyImages(oldImagesArg && path.resolve(oldImagesArg), TARGET_IMAGES);
    if (oldImagesArg) console.log(`Images copied: ${images}`);

    console.log(`\n✅ Done. New POS database: ${TARGET_DB}`);
    console.log('   The original POS database was not modified.');
})().catch(e => {
    if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
    fail(e.message);
});
