const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Model } = require('objection');
const Knex = require('knex');
const config = require('./config');
const fetchuser = require('./middlewares/loggedIn');

// The one and only database connection.
const knex = Knex({
    client: 'sqlite3',
    connection: { filename: config.dbPath },
    useNullAsDefault: true,
});
Model.knex(knex);

const app = express();
// Only the app itself (http://localhost:5100) may call the API from a browser.
app.use(cors({ origin: [`http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`] }));
app.use(express.json({ limit: '5mb' }));
app.use('/images', express.static(config.tmpDir));
app.use(express.static(config.buildPath))

app.use("/auth", require("./routes/auth"));
app.use("/products", require("./routes/products"));
app.use("/orders", require("./routes/orders"));
app.use("/category", require("./routes/category"));
app.use("/tax", require("./routes/tax"));
app.use("/pos", require("./routes/pos"));
app.use("/notes", require("./routes/notes"));
app.use("/config", require("./routes/config"));

async function downloadAndExtract(url, zipName, destination) {
    const outputPath = path.join(config.tmpDir, zipName);
    const { data } = await axios({ method: 'GET', url, responseType: 'stream', timeout: 60000 });
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);
        data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
    try {
        const AdmZip = require('adm-zip');
        new AdmZip(outputPath).extractAllTo(destination, true);
    } finally {
        fs.promises.unlink(outputPath).catch(() => {});
    }
}

// NOTE: these updates are downloaded without any signature check. They are only reachable
// from this computer now (see config.host); replacing them with electron-updater and signed
// builds is still to do.
app.get('/install-update', fetchuser.optional, async (req, res) => {
    try {
        await downloadAndExtract(`${config.cloudUrl}/updates/download`, 'update.zip', path.join(config.rootDir, 'client'));
        return res.json({ status: true, message: 'UI update installed!' });
    } catch (error) {
        return res.json({ status: false, message: `Failed downloading update! ${error.message}` });
    }
})

app.get(`/install-backend-update`, fetchuser.optional, async (req, res) => {
    try {
        await downloadAndExtract(`${config.cloudUrl}/backend-updates/download`, 'main.zip', path.join(config.rootDir, '../'));
        return res.json({ status: true, message: "UX Updates installed!" })
    } catch (error) {
        return res.json({ status: false, message: `Updates installation failed! ${error.message}` })
    }
})

// Any error a route didn't handle ends up here instead of crashing or hanging the request.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ status: false, message: err.message || 'Something went wrong!' });
});

async function migrate() {
    // Before, migrations only ran when a request failed with a "column" error.
    await knex.migrate.latest({
        directory: config.migrationsDir,
        tableName: 'knex_migrations',
        disableMigrationsListValidation: true,
    });
}

let server
async function start() {
    try {
        await migrate();
    } catch (err) {
        console.error('Database migration failed:', err);
    }
    return new Promise((resolve) => {
        server = app.listen(config.port, config.host, () => resolve(server));
        server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                console.error(`❌ Port ${config.port} is already in use.`);
                process.exit(1);
            } else {
                console.error("Server error:", err);
            }
        });
    });
}

function stop() {
    if (server) server.close()
    return knex.destroy();
}

if (require.main === module) start();

module.exports = { start, stop, app, knex }
