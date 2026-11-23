const { app, ipcMain, Notification } = require('electron');
const log = require('./backend/utils/log');

// Keeps each till up to date on its own, so no one has to visit a shop to run a new setup.
// It checks the PUBLIC download repo (auctechbase/india-gate-pos-download, set in
// package.json > build.publish) for a newer installer, downloads it in the background, and
// installs it silently the next time the app is closed. The repo is public, so no token is
// needed, and the installer is per-user (nsis.oneClick=false), so there is no admin prompt.
//
// One-time step: a device must get ONE manual install of a version that already contains this
// file; from then on it updates itself.
function setupAutoUpdates(getMainWindow) {
    if (!app.isPackaged) return; // only the installed app updates; `npm start` never does

    let autoUpdater;
    try {
        ({ autoUpdater } = require('electron-updater'));
    } catch (error) {
        log.warn('update', 'electron-updater is not available; auto-update is off', { error: error.message });
        return;
    }

    autoUpdater.autoDownload = true; // fetch a new version as soon as one is found
    autoUpdater.autoInstallOnAppQuit = true; // install it silently when the till is closed
    autoUpdater.logger = {
        info: (m) => log.info('update', String(m)),
        warn: (m) => log.warn('update', String(m)),
        error: (m) => log.error('update', String(m)),
        debug: () => {},
    };

    let downloadedVersion = null;

    autoUpdater.on('checking-for-update', () => log.info('update', 'Checking for a new version'));
    autoUpdater.on('update-available', (info) => log.info('update', `New version ${info.version} found; downloading`));
    autoUpdater.on('update-not-available', () => log.info('update', 'Already on the newest version'));
    autoUpdater.on('error', (err) => log.error('update', 'Update check failed', { error: String((err && err.message) || err) }));
    autoUpdater.on('download-progress', (p) => log.info('update', `Downloading update: ${Math.round(p.percent)}%`));
    autoUpdater.on('update-downloaded', (info) => {
        downloadedVersion = info.version;
        log.info('update', `Version ${info.version} is ready; it will install when the app is closed`);
        notifyReady(info.version, autoUpdater);
        try { getMainWindow()?.webContents?.send('update-ready', { version: info.version }); } catch (e) { /* no window */ }
    });

    const check = () =>
        autoUpdater.checkForUpdates().catch((err) => log.error('update', 'Could not check for updates', { error: String((err && err.message) || err) }));

    // Check a little after start (let the POS finish loading), then every 3 hours.
    setTimeout(check, 20 * 1000);
    setInterval(check, 3 * 60 * 60 * 1000);

    // Optional buttons in the UI can call these; without them, the install still happens on quit.
    ipcMain.handle('check-for-updates', () => check());
    ipcMain.handle('install-update-now', () => {
        if (!downloadedVersion) return { ready: false };
        setImmediate(() => autoUpdater.quitAndInstall());
        return { ready: true, version: downloadedVersion };
    });
}

// A quiet Windows notification; clicking it updates right away instead of waiting for closing time.
function notifyReady(version, autoUpdater) {
    try {
        if (!Notification.isSupported()) return;
        const note = new Notification({
            title: 'India Gate POS update ready',
            body: `Version ${version} will install when you close the app. Click here to update now.`,
            silent: true,
        });
        note.on('click', () => autoUpdater.quitAndInstall());
        note.show();
    } catch (error) {
        log.warn('update', 'Could not show the update notification', { error: error.message });
    }
}

module.exports = { setupAutoUpdates };
