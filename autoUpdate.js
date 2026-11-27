const { app, ipcMain, Notification } = require('electron');
const log = require('./backend/utils/log');

// Keeps each till up to date, so no one has to visit a shop to run a new setup.
// It checks the PUBLIC download repo (auctechbase/india-gate-pos-download, set in
// package.json > build.publish) for a newer installer and downloads it in the background.
// The home screen then shows an "Update now" button (installs silently and reopens the POS);
// if no one presses it, the update installs silently when the app is closed.
//
// One-time step: a device must get ONE manual install of a version that already contains this
// file; from then on it updates itself.

// What the home screen shows. state: idle | checking | downloading | ready | latest | error | off
let status = { state: 'off', current: app.getVersion() };
let lastCheck = 0;

function setupAutoUpdates(getMainWindow) {
    const send = (patch) => {
        status = { ...status, ...patch, current: app.getVersion() };
        try { getMainWindow()?.webContents?.send('update-status', status); } catch (e) { /* no window */ }
    };

    ipcMain.handle('get-update-status', () => status);

    if (!app.isPackaged) { // only the installed app updates; `npm start` never does
        ipcMain.handle('check-for-updates', () => status);
        ipcMain.handle('install-update-now', () => ({ ready: false }));
        return;
    }

    let autoUpdater;
    try {
        ({ autoUpdater } = require('electron-updater'));
    } catch (error) {
        log.warn('update', 'electron-updater is not available; auto-update is off', { error: error.message });
        ipcMain.handle('check-for-updates', () => status);
        ipcMain.handle('install-update-now', () => ({ ready: false }));
        return;
    }

    autoUpdater.autoDownload = true; // fetch a new version as soon as one is found
    autoUpdater.autoInstallOnAppQuit = true; // install it silently when the till is closed
    // Download the whole installer. The "changed blocks only" download hung at 85% on
    // 2026-11-27 (1.0.14 → 1.0.15) and never finished or failed; a full download is ~140 MB.
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.disableWebInstaller = true;
    autoUpdater.logger = {
        info: (m) => log.info('update', String(m)),
        warn: (m) => log.warn('update', String(m)),
        error: (m) => log.error('update', String(m)),
        debug: () => {},
    };

    status = { state: 'idle', current: app.getVersion() };

    autoUpdater.on('checking-for-update', () => {
        log.info('update', 'Checking for a new version');
        if (status.state !== 'ready' && status.state !== 'downloading') send({ state: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
        log.info('update', `New version ${info.version} found; downloading`);
        lastProgress = Date.now();
        lastLoggedPercent = -1;
        send({ state: 'downloading', version: info.version, percent: 0 });
    });
    autoUpdater.on('update-not-available', () => {
        log.info('update', 'Already on the newest version');
        if (status.state !== 'ready') send({ state: 'latest' });
    });
    autoUpdater.on('error', (err) => {
        const message = String((err && err.message) || err);
        log.error('update', 'Update check failed', { error: message });
        if (status.state !== 'ready') send({ state: 'error', error: message.split('\n')[0].slice(0, 200) });
    });
    // A download that stops moving: show it (instead of "Downloading…" forever) and let the
    // next check try again.
    let lastProgress = 0;
    let lastLoggedPercent = -1;
    autoUpdater.on('download-progress', (p) => {
        lastProgress = Date.now();
        const percent = Math.round(p.percent);
        if (percent >= lastLoggedPercent + 10 || percent === 100) {
            lastLoggedPercent = percent;
            log.info('update', `Downloading update: ${percent}%`);
        }
        send({ state: 'downloading', percent });
    });
    setInterval(() => {
        if (status.state === 'downloading' && lastProgress && Date.now() - lastProgress > 3 * 60 * 1000) {
            log.warn('update', `Download of ${status.version} stalled at ${status.percent || 0}%; will try again`);
            lastProgress = 0;
            lastLoggedPercent = -1;
            send({ state: 'error', error: 'The download stopped; trying again later' });
        }
    }, 30 * 1000);
    autoUpdater.on('update-downloaded', (info) => {
        log.info('update', `Version ${info.version} is ready; waiting for "Update now" or app close`);
        send({ state: 'ready', version: info.version });
        notifyReady(info.version, install);
    });

    const check = () => {
        if (status.state === 'ready' || status.state === 'downloading') return Promise.resolve();
        lastCheck = Date.now();
        return autoUpdater.checkForUpdates().catch((err) => {
            const message = String((err && err.message) || err);
            log.error('update', 'Could not check for updates', { error: message });
            send({ state: 'error', error: message.split('\n')[0].slice(0, 200) });
        });
    };

    // Silent install, then the POS opens again by itself (no installer screens).
    function install() {
        if (status.state !== 'ready') return false;
        log.info('update', `Installing version ${status.version} now (Update now pressed)`);
        setImmediate(() => autoUpdater.quitAndInstall(true, true));
        return true;
    }

    // Check a little after start (let the POS finish loading), then every hour.
    setTimeout(check, 20 * 1000);
    setInterval(check, 60 * 60 * 1000);

    // "Check for updates" on the home screen. `quiet` = the home screen opening: at most once
    // every 10 minutes, so walking through the screens doesn't keep asking GitHub.
    ipcMain.handle('check-for-updates', async (evt, quiet) => {
        if (!(quiet && Date.now() - lastCheck < 10 * 60 * 1000)) await check();
        return status;
    });
    ipcMain.handle('install-update-now', () => {
        const ready = install();
        return { ready, version: status.version };
    });
}

// A quiet Windows notification; clicking it updates right away.
function notifyReady(version, install) {
    try {
        if (!Notification.isSupported()) return;
        const note = new Notification({
            title: 'India Gate POS update ready',
            body: `Version ${version} is ready. Click here, or "Update now" on the home screen.`,
            silent: true,
        });
        note.on('click', install);
        note.show();
    } catch (error) {
        log.warn('update', 'Could not show the update notification', { error: error.message });
    }
}

module.exports = { setupAutoUpdates };
