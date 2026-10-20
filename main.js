const electron = require('electron')
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const bwipjs = require('bwip-js');
const server = require('./backend/server');
const { ipcMain } = require("electron");
const fs = require('fs');
const config = require('./backend/config');
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
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
        // Close the customer display too, otherwise the app never quits.
        windows.forEach(w => { if (!w.isDestroyed()) w.close() });
        windows = [];
    });


    const displays = screen.getAllDisplays();
    const customerDisplay = displays.length > 1 ? displays[1] : null;
    if (customerDisplay) {
        const customerWindow = new BrowserWindow({
            width: customerDisplay.size.width,
            height: customerDisplay.size.height,
            x: customerDisplay.bounds.x,
            y: customerDisplay.bounds.y,
            frame: false, // Optional: Hide the window frame for a cleaner look
            fullscreen: true, // Optional: Make it fullscreen on the display
            alwaysOnTop: true, // Optional: Keep it on top
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            },
        });
        customerWindow.loadURL(`http://localhost:${config.port}/#/pos/customer`);
        customerWindow.setFullScreen(true)
        windows.push(customerWindow)
    } else {
        console.log("No secondary display detected.");
    }
});

const openDrawer = async () => {
    const printWindow = new BrowserWindow({ show: false });
    const html = `<html><body><style>@page{size:auto;margin:1mm 0mm 0mm 1mm;}</style></body></html>`;
  
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    printWindow.webContents.on("did-finish-load", () => {
        printWindow.webContents.print({ 
	silent:true,
	pageSize: {
	    height: 2000,
	    width: 40000
	}
    }, (success, error) => {
            if (!success || error) { 
                if (error) console.error('Error writing to file:', error)
            };
            printWindow.close();
        });
    });

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

ipcMain.on("print-content", (event, content) => {
    const printWindow = new BrowserWindow({ show: false });
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
  
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    printWindow.webContents.on("did-finish-load", () => {
        printWindow.webContents.print({ silent:true }, (success, error) => {
            if (!success || error) { 
                if (error) console.error('Error writing to file:', error)
            };
            printWindow.close();
        });
    });

});

ipcMain.on(`print-report`, async(event, html) => {
    try {
        const printWin = new BrowserWindow({ show:false });
        printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        printWin.webContents.on("did-finish-load", () => {
            printWin.webContents.print(
                { silent: true, printBackground: true },
                (success, errorType) => {
                    if (!success) console.error("Failed to print:", errorType);
                    printWin.close(); // Close the hidden window after printing
                }
            );
        });
    } catch (error) {
        console.log(error.message)
    }
})

ipcMain.on("generate-barcode", async (event, content)=> {
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

        const printWindow = new BrowserWindow({ show: false }); 
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

        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(barcodeHTML)}`);

        printWindow.webContents.on("did-finish-load", () => {
            printWindow.webContents.print(
                { silent: true },
                (success, errorType) => {
                    if (!success) console.error("Failed to print:", errorType);
                    printWindow.close(); // Close the hidden window after printing
                }
            );
        });
    } catch (error) {
        console.log(error.message)
    }
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
