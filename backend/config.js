const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Every path, secret and URL the backend needs lives here, so nothing else hard-codes them.
// Values can be overridden with environment variables.

const rootDir = __dirname;
const databaseDir = process.env.POS_DATABASE_DIR || path.join(rootDir, 'database');
const tmpDir = process.env.POS_TMP_DIR || path.join(rootDir, 'tmp');
const buildPath = path.join(rootDir, 'client/build');

fs.mkdirSync(databaseDir, { recursive: true });
for (const dir of ['', 'products', 'notes', 'temp', 'reports', 'converted']) {
    fs.mkdirSync(path.join(tmpDir, dir), { recursive: true });
}

// The JWT secret used to be the literal 'whateverItWas' (public in git). Now it comes from the
// environment or is generated once per install and stored next to the database.
function loadJwtSecret() {
    if (process.env.POS_JWT_SECRET) return process.env.POS_JWT_SECRET;
    const secretFile = path.join(databaseDir, '.jwt-secret');
    try {
        return fs.readFileSync(secretFile, 'utf8').trim();
    } catch (e) {
        const secret = crypto.randomBytes(48).toString('hex');
        fs.writeFileSync(secretFile, secret, { mode: 0o600 });
        return secret;
    }
}

// The UI build file names contain a content hash, so look the logo up instead of hard-coding it.
function findLogoPath() {
    const mediaDir = path.join(buildPath, 'static/media');
    try {
        const logo = fs.readdirSync(mediaDir).find(f => /^logo\..*\.png$/.test(f));
        if (logo) return path.join(mediaDir, logo);
    } catch (e) {}
    return null;
}

module.exports = {
    port: Number(process.env.POS_PORT) || 5100,
    // Only this computer may call the API. Set POS_HOST=0.0.0.0 to expose it on the network.
    host: process.env.POS_HOST || '127.0.0.1',
    rootDir,
    buildPath,
    databaseDir,
    dbPath: path.join(databaseDir, 'db.sqlite'),
    migrationsDir: path.join(rootDir, 'migrations'),
    tmpDir,
    jwtSecret: loadJwtSecret(),
    // Off by default: on 401 the UI clears localStorage, which would empty a cart mid-sale.
    jwtExpiresIn: process.env.POS_JWT_EXPIRES_IN || null,
    cloudUrl: process.env.POS_CLOUD_URL || 'https://pos.dftech.in',
    // Fallback kept so existing installs keep syncing. Rotate this key on the cloud side and
    // set POS_CLOUD_KEY; it has been public in the repository.
    cloudKey: process.env.POS_CLOUD_KEY || 'Vyo0WttjzBTh',
    cloudTimeoutMs: 15000,
    findLogoPath,
};
