const electron = require('electron')
const { app, BrowserWindow, screen, shell } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const bwipjs = require('bwip-js');
const server = require('./backend/server');
const log = require('./backend/utils/log');

// Problems in the desktop app itself go to the log too (the backend adds console.error/warn).
log.captureConsole();
process.on('uncaughtExceptionMonitor', (error) => log.error('app', 'Uncaught error', error));
process.on('unhandledRejection', (reason) => log.error('app', 'Unhandled promise rejection', reason instanceof Error ? reason : String(reason)));
const { ipcMain } = require("electron");
const fs = require('fs');
const config = require('./backend/config');
const websiteSync = require('./backend/utils/websiteSync');
const { receiptHtml } = require('./backend/utils/webReceipt');
const { setupAutoUpdates } = require('./autoUpdate');
// The logo file name contains a build hash that changes with every UI update; look it up
// instead of hard-coding it (the app used to crash on start after an update).
const logoPath = config.findLogoPath();
const b64 = logoPath ? fs.readFileSync(logoPath, 'base64') : '';
// idVendor 8137
// idProduct 8214
let mainWindow;
let windows=[]

app.on('ready', async () => 
{
    await server.start();
    log.info('app', `India Gate POS ${app.getVersion()} started`, { electron: process.versions.electron, printers: readPrinterChoice() });
    const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize
    mainWindow = new BrowserWindow({
        width,
        height,
        autoHideMenuBar: true,
        scrollBounce:true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false, // the page only gets what preload.js exposes
            devTools: false,
        },
    });
    
    mainWindow.loadURL(`http://localhost:${config.port}`);
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        return { action: 'deny' };
    });
    
    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.show();
        mainWindow.maximize();
        mainWindow.setFullScreen(true)
        // Ask the drivers for their paper now, so the first receipt doesn't wait for it.
        mainWindow.webContents.getPrintersAsync().then((printers) => {
            logPrinters(printers).catch(() => {});
            const names = new Set([...Object.values(readPrinterChoice()).filter(Boolean), printers.find(p => p.isDefault)?.name].filter(Boolean));
            names.forEach((name) => { if (printers.some(p => p.name === name)) driverPaper(name); });
        }).catch(() => {});
    });
    mainWindow.webContents.on('render-process-gone', (event, details) => log.error('app', 'The POS screen crashed', details));
    mainWindow.webContents.on('unresponsive', () => log.warn('app', 'The POS screen stopped responding'));
    mainWindow.on('closed', () => {
        mainWindow = null;
        // Close the customer display too, otherwise the app never quits.
        windows.forEach(w => { if (!w.isDestroyed()) w.close() });
        windows = [];
    });


    // Check for a newer version and keep the till up to date on its own (installed app only).
    setupAutoUpdates(() => mainWindow);

    openCustomerDisplay();
    // The customer screen is often switched on after the POS: before, it then stayed empty until
    // the POS was restarted. Now it opens when a screen is connected and closes when it goes
    // (otherwise Windows moves it onto the till screen, full screen and always on top).
    screen.on('display-added', () => setTimeout(openCustomerDisplay, 1500));
    screen.on('display-removed', () => setTimeout(() => {
        if (externalDisplay()) return;
        const open = windows.filter(w => !w.isDestroyed());
        if (open.length) log.info('app', 'Customer screen disconnected: customer display closed');
        open.forEach(w => w.destroy());
        windows = [];
    }, 500));
});

// A screen that is not the till's own (primary) screen, or null.
function externalDisplay() {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().find(d => d.id !== primary.id) || null;
}

// Opens the customer display on the second screen, unless it is open already or there is none.
function openCustomerDisplay() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    windows = windows.filter(w => !w.isDestroyed());
    if (windows.length) return;
    const customerDisplay = externalDisplay();
    if (!customerDisplay) {
        log.info('app', 'No customer screen connected');
        return;
    }
    const customerWindow = new BrowserWindow({
        width: customerDisplay.size.width,
        height: customerDisplay.size.height,
        x: customerDisplay.bounds.x,
        y: customerDisplay.bounds.y,
        frame: false,
        fullscreen: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
    });
    customerWindow.loadURL(`http://localhost:${config.port}/#/pos/customer`);
    customerWindow.setFullScreen(true)
    windows.push(customerWindow)
    log.info('app', `Customer display opened on a ${customerDisplay.size.width}x${customerDisplay.size.height} screen`);
}

// Which printer each kind of print goes to, chosen under Configuration → Printers.
// receipt: receipts, website order slips, reports and the cash drawer; label: barcode labels.
// Empty means the Windows default printer (the only behaviour before).
const PRINTER_KINDS = ['receipt', 'label'];
const printerFile = () => path.join(app.getPath('userData'), 'printers.json');

function readPrinterChoice() {
    try {
        const saved = JSON.parse(fs.readFileSync(printerFile(), 'utf8'));
        return { receipt: String(saved.receipt || ''), label: String(saved.label || '') };
    } catch (error) {
        return { receipt: '', label: '' };
    }
}

// Shown on the till as a warning (and written to the log); before, a failed print only went to
// the console.
function reportPrintError(message) {
    log.error('print', message);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('has-error', message);
}

// The paper the printer's own driver uses (its default form), in microns. Chromium cannot read
// some receipt drivers' forms (POS-80C: a nameless "custom" 72 x 297 mm form): it then calls the
// settings invalid and drops the print without a word, so nothing reaches the Windows queue.
// Passing the driver's own size prints exactly as the old POS did. Asked once per printer.
const paperCache = new Map();
const queueChecks = new Set(); // printers with a queue check already planned
const FALLBACK_PAPER = { receipt: { width: 72000, height: 297000, name: '72 x 297 mm (fallback)' } };
const PAPER_SCRIPT = [
    'Add-Type -AssemblyName System.Drawing;',
    '$s = New-Object System.Drawing.Printing.PrinterSettings; $s.PrinterName = $env:POS_PRINTER_NAME;',
    'if (-not $s.IsValid) { exit 2 }',
    '$p = $s.DefaultPageSettings.PaperSize;',
    '[Console]::Out.Write("$($p.Width)|$($p.Height)|$($p.PaperName)")',
].join(' ');

function driverPaper(printerName) {
    if (paperCache.has(printerName)) return paperCache.get(printerName);
    const lookup = new Promise((resolve) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PAPER_SCRIPT], {
            env: { ...process.env, POS_PRINTER_NAME: printerName }, timeout: 15000, windowsHide: true,
        }, (error, stdout) => {
            const [w, h, name] = String(stdout || '').trim().split('|');
            const width = Math.round(Number(w) * 254); // hundredths of an inch → microns
            const height = Math.round(Number(h) * 254);
            if (error || !(width >= 10000) || !(height >= 10000)) {
                log.warn('print', `Could not read the paper size of "${printerName}"`, error ? error.message : stdout);
                paperCache.delete(printerName); // try again next time
                return resolve(null);
            }
            const paper = { width, height, name: `${name || 'custom'} ${(width / 1000).toFixed(0)} x ${(height / 1000).toFixed(0)} mm` };
            log.info('print', `Paper of "${printerName}": ${paper.name}`);
            resolve(paper);
        });
    });
    paperCache.set(printerName, lookup);
    return lookup;
}

// Windows printer status flags (PRINTER_STATUS_*) that mean it will not print right now.
const PROBLEM_FLAGS = [
    [0x1, 'paused'], [0x2, 'in error'], [0x4, 'being deleted'], [0x8, 'paper jam'], [0x10, 'out of paper'],
    [0x40, 'paper problem'], [0x80, 'offline'], [0x800, 'output bin full'], [0x1000, 'not available'],
    [0x40000, 'out of toner'], [0x100000, 'needs attention'], [0x400000, 'door open'],
];
const printerProblems = (status) => PROBLEM_FLAGS.filter(([flag]) => (Number(status) & flag) !== 0).map(([, text]) => text);

// What waits in a printer's Windows queue: jobs that stay there mean the printer is not taking
// them (unplugged, off, paused). The POS-80C on the office PC still held jobs from months before.
const QUEUE_SCRIPT = [
    '$j = @(Get-PrintJob -PrinterName $env:POS_PRINTER_NAME -ErrorAction Stop);',
    '$o = $j | Sort-Object SubmittedTime | Select-Object -First 1;',
    '[Console]::Out.Write("$($j.Count)|$(if ($o) { $o.SubmittedTime.ToString(\'yyyy-MM-dd HH:mm:ss\') })|$(if ($o) { $o.JobStatus })")',
].join(' ');
function printQueue(printerName) {
    return new Promise((resolve) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', QUEUE_SCRIPT], {
            env: { ...process.env, POS_PRINTER_NAME: printerName }, timeout: 15000, windowsHide: true,
        }, (error, stdout) => {
            if (error) return resolve(null);
            const [count, oldest, status] = String(stdout || '').trim().split('|');
            resolve({ count: Number(count) || 0, oldest: oldest || null, status: status || '' });
        });
    });
}

// Logs the queue of `printerName`; warns the cashier when jobs older than a minute are stuck.
async function checkQueue(printerName, why) {
    const queue = await printQueue(printerName);
    if (!queue) return;
    if (queue.count === 0) return log.info('print', `Queue of "${printerName}" is empty (${why})`);
    const ageMs = queue.oldest ? Date.now() - new Date(queue.oldest.replace(' ', 'T')).getTime() : 0;
    const text = `${queue.count} job(s) waiting in the Windows queue of "${printerName}", oldest from ${queue.oldest}${queue.status ? ` (${queue.status})` : ''}`;
    if (ageMs > 60000) {
        reportPrintError(`${text}: the printer is not taking them. Check that it is on and connected, or clear its queue in Windows.`);
    } else {
        log.info('print', `${text} (${why})`);
    }
}

// At start: every printer with its Windows status, and the queues of the ones the POS uses.
async function logPrinters(printers) {
    const choice = readPrinterChoice();
    const def = printers.find(p => p.isDefault)?.name;
    log.info('print', `Printers: ${printers.map(p => `${p.name}${p.isDefault ? ' [default]' : ''}${printerProblems(p.status).length ? ` (${printerProblems(p.status).join(', ')})` : ''}`).join('; ') || 'none'}`);
    log.info('print', `Receipts go to "${choice.receipt || def || 'none'}"${choice.receipt ? '' : ' (Windows default)'}, labels to "${choice.label || def || 'none'}"${choice.label ? '' : ' (Windows default)'}`);
    for (const name of new Set([choice.receipt, choice.label, def].filter(Boolean))) {
        if (printers.some(p => p.name === name)) checkQueue(name, 'at start');
        else log.warn('print', `Printer "${name}" is not installed`);
    }
}

// Which printer `kind` goes to: the chosen one while it is still installed, else the Windows
// default. Warns when Windows reports it offline, paused, out of paper and so on.
async function resolvePrinter(kind) {
    const chosen = readPrinterChoice()[kind];
    const wc = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : BrowserWindow.getAllWindows()[0]?.webContents;
    let printers = [];
    try {
        if (wc) printers = await wc.getPrintersAsync();
    } catch (error) {
        log.warn('print', 'Could not list the printers', error.message);
    }
    let name = null;
    let isChosen = false;
    if (chosen) {
        if (printers.some(printer => printer.name === chosen)) { name = chosen; isChosen = true; }
        else reportPrintError(`Printer "${chosen}" is not installed any more: printing on the default printer. Choose another under Configuration → Printers.`);
    }
    if (!name) name = printers.find(printer => printer.isDefault)?.name || null;
    if (!name) {
        if (printers.length || !wc) log.warn('print', 'No default printer found in Windows');
        else reportPrintError('No printer is set up in Windows (no default printer). Install the printer, or choose one under Configuration → Printers.');
        return null;
    }
    const problems = printerProblems(printers.find(p => p.name === name)?.status);
    if (problems.length) {
        reportPrintError(`Printer "${name}" is ${problems.join(', ')}: the print waits in the Windows queue until the printer is ready.`);
    }
    return { name, isChosen };
}

// One print in a fresh hidden window. Resolves 'ok', 'cancelled', 'no answer' or 'failed: …'.
function printOnce(html, settings, waitMs) {
    return new Promise((resolve) => {
        const win = new BrowserWindow({ show: false });
        let done = false;
        let timer = setTimeout(() => finish('failed: the page to print did not load'), 15000);
        function finish(result) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (!win.isDestroyed()) win.destroy();
            resolve(result);
        }
        win.webContents.once('did-finish-load', () => {
            clearTimeout(timer);
            // Chromium does not always answer (settings it calls invalid): don't wait for ever.
            timer = setTimeout(() => finish('no answer'), waitMs);
            try {
                win.webContents.print(settings, (ok, reason) => finish(ok ? 'ok' : reason === 'cancelled' ? 'cancelled' : `failed: ${reason || 'printer error'}`));
            } catch (error) {
                finish(`failed: ${error.message}`);
            }
        });
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    });
}

const mm = (size) => `${(size.width / 1000).toFixed(0)} x ${(size.height / 1000).toFixed(0)} mm`;

// Prints `html` on the printer for `kind` (receipt or label).
// 1. Exactly as the old POS (which prints every day at the shop): silent, on the default printer,
//    or on the chosen one; the paper is the driver's own.
// 2. Only if that gets no answer or fails: once more, naming the printer and passing the driver's
//    paper size. A newer engine (Electron 34.5) silently dropped POS-80C prints because it could
//    not read that driver's nameless custom paper; with the size given it prints.
async function printHtml(kind, html, options, what) {
    try {
        const printer = await resolvePrinter(kind);
        const first = { ...options };
        if (printer?.isChosen) first.deviceName = printer.name;
        let used = first;
        let result = await printOnce(html, first, 10000);
        if (result !== 'ok' && result !== 'cancelled' && printer) {
            log.warn('print', `${what}: first try on "${printer.name}" gave "${result}"; trying again with the driver's paper size`);
            const paper = options.pageSize || (await driverPaper(printer.name)) || FALLBACK_PAPER[kind];
            used = { ...options, deviceName: printer.name, ...(paper ? { pageSize: { width: paper.width, height: paper.height } } : {}) };
            result = await printOnce(html, used, 20000);
        }
        const where = ` on "${used.deviceName || printer?.name || 'the default printer'}"`;
        const paperText = used.pageSize ? ` (paper ${mm(used.pageSize)})` : " (the printer's own paper)";
        if (result === 'ok') {
            log.info('print', `${what} sent${where}${paperText}${used === first ? '' : ' on the second try'}`);
            // "Sent" only means Windows has it: check a little later that it left the queue.
            const queueOf = used.deviceName || printer?.name;
            if (queueOf && !queueChecks.has(queueOf)) {
                queueChecks.add(queueOf);
                setTimeout(() => {
                    queueChecks.delete(queueOf);
                    checkQueue(queueOf, `after: ${what}`).catch(() => {});
                }, 30000);
            }
        } else if (result !== 'cancelled') {
            const why = result === 'no answer' ? 'the printer did not respond' : result.replace(/^failed: /, '');
            reportPrintError(`${what} not printed${where}: ${why}. Check that the printer is on, connected and not paused.`);
        }
    } catch (error) {
        reportPrintError(`${what} not printed: ${error.message}`);
    }
}

// Configuration → Logs → Save logs: one text file on the Desktop to send for support.
ipcMain.handle('export-logs', async () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const file = path.join(app.getPath('desktop'), `India-Gate-POS-log-${stamp}.txt`);
    let printers = [];
    try { printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : []; } catch (error) { /* none */ }
    const choice = readPrinterChoice();
    fs.writeFileSync(file, log.exportText(7, [
        `App: India Gate POS ${app.getVersion()} | Electron ${process.versions.electron}`,
        `Printers: ${printers.map(p => `${p.name}${p.isDefault ? ' (default)' : ''}`).join(', ') || 'none'}`,
        `Chosen printers: receipt = ${choice.receipt || 'Windows default'}, label = ${choice.label || 'Windows default'}`,
    ]));
    shell.showItemInFolder(file);
    log.info('app', `Log saved to ${file}`);
    return file;
});

ipcMain.handle('get-printer-choice', () => readPrinterChoice());

ipcMain.handle('set-printer-choice', (event, choice = {}) => {
    const next = readPrinterChoice();
    for (const kind of PRINTER_KINDS) {
        if (typeof choice[kind] === 'string') next[kind] = choice[kind];
    }
    fs.writeFileSync(printerFile(), JSON.stringify(next, null, 2));
    return next;
});

const openDrawer = async () => {
    // An empty page: printing it makes the receipt printer kick the cash drawer open.
    const html = `<html><body><style>@page{size:auto;margin:1mm 0mm 0mm 1mm;}</style></body></html>`;
    printHtml('receipt', html, { silent: true, pageSize: { height: 2000, width: 40000 } }, 'Cash drawer');
};

ipcMain.on("exit-fullscreen", (e,screen) => {
    if (mainWindow) {
        mainWindow.setFullScreen(!screen);
    }
});
ipcMain.on('draw-cash', async () => openDrawer());

ipcMain.on('relaunch', () => {
    app.relaunch()
    app.exit()
})

ipcMain.on('reload', (event, content = {}) => {
    const {id} = content;
    delete content.id;
    windows.forEach( win => {
        if(win && !win.isDestroyed()) {
            if(content.manual) {
                win.webContents.send('data-received', { manual:true })
            } else {
                win.webContents.send('data-received', { reload:true, id: id, products:content})
            }
        }
    })
})

ipcMain.on('close-window', () => {
    windows.forEach(w => { if (!w.isDestroyed()) w.close() })
    if (mainWindow) mainWindow.close()
})

// preload.js exposes getPrinters(); there was no handler, so the call always failed.
ipcMain.handle('get-printers', async (event) => {
    try {
        return await event.sender.getPrintersAsync();
    } catch (error) {
        return [];
    }
})

// Prints a receipt body on the receipt printer with the shop logo on top. Used by the UI
// (print-content) and for new website orders.
function printReceipt(content, what = 'Receipt') {
    const html = `<html><style> @page{ size:auto; margin:-5mm 3mm 3mm 2mm }
        *{font-weight:400!important;text-transform:uppercase;font-size:0.85rem!important;font-family:system-ui!important}
        .toShow{display:inline!important;}
        .row> * {
            flex-shrink: 0;
            max-width:100%;
            padding-left:0;
            align-items:center;
            margin-top:0;
        }
        .tax-table-receipt td, .tax-table-receipt th{padding: 0.3rem 1rem!important}
        .table th, .table td {vertical-align: middle;line-height: 1;white-space: nowrap;}
        .row{padding:0px!important;min-height:10px!important;border:0px!important}
        .receipt {border-top:1px dashed!important;border-bottom:1px dashed!important}
        .toHide {display:none!important}
     </style>
    <body style="width:32%!important;margin:0px!important;padding:0px!important;">
        <div style="background-color: white; padding-bottom:4px;">
            <div style="display:flex;">
                <div style="justify-content:center;text-align:center;width:100%;display:grid">
                    <img src="data:image/png;base64,${b64}" alt="" height="100"/>
                </div>
            </div>
            ${content.html}
            <p>Generated: ${new Date().toLocaleString()}</p>
        </div>
    </body></html>`;
    printHtml('receipt', html, { silent: true }, what);
}

ipcMain.on("print-content", (event, content) => printReceipt(content));

// A new website order arrives: print its slip right away, whichever screen is open.
websiteSync.events.on('new-order', (order) => {
    try {
        printReceipt({ html: receiptHtml(order) }, 'Website order slip');
    } catch (error) {
        console.error('Could not print the website order:', error.message);
    }
});

ipcMain.on(`print-report`, async(event, html) => {
    try {
        printHtml('receipt', String(html ?? ''), { silent: true, printBackground: true }, 'Report');
    } catch (error) {
        console.log(error.message)
    }
})

// Configuration → Printers → Test print: a short slip or a sample label on the chosen printer.
ipcMain.on('test-print', (event, kind) => {
    if (kind === 'label') {
        printBarcode({ name: 'Test label', price: '1.00', code: '1234567890128' });
    } else {
        printReceipt({ html: '<h3 style="text-align:center">Test print</h3><p style="text-align:center">The receipt printer works.</p>' }, 'Test print');
    }
});

async function printBarcode(content) {
    try {
        let {name,price,code} = content
        const currency = content.currency || '€';
        name = String(name ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

        const svg = await bwipjs.toSVG({
            bcid: "code128",
            text: code,
            scale:2,
            height:8,
            includetext:true,
            textxalign:'center',
            textyalign:'below'
        });

        const barcodeHTML = `<html>
            <style>
                @page{size:auto;margin:1mm 0mm 0mm 1mm }
                *{font-family:system-ui!important}
            </style>
            <body>
                <div style="width:20%;margin-left:60px;">
                    <div style="font-size:0.8rem!important;margin-bottom:8px;padding-bottom:2px;border-bottom:2px solid;font-weight:600">${name}</div>
                    ${svg}
                    <div style="text-align:center;display:grid;place-content:center;margin-top:-25px">
                        <h2 style="font-size:2rem;font-weight:600">${currency}${price}</h2>
                    </div>
                </div>
            </body>
        </html>`;

        printHtml('label', barcodeHTML, { silent: true }, 'Barcode label');
    } catch (error) {
        reportPrintError(`Barcode label not printed: ${error.message}`);
    }
}

ipcMain.on("generate-barcode", (event, content) => printBarcode(content));

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
