const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld("electronAPI", {
    onDataReceived: callback => ipcRenderer.on("data-received", (evt, data) => callback(data)),
    generateBarcode: data => ipcRenderer.send("generate-barcode", data),
    printContent: content => ipcRenderer.send("print-content", content),
    printReport: html => ipcRenderer.send(`print-report`, html),
    drawCash: () => ipcRenderer.send(`draw-cash`, null),
    updateCustomerDisplay: content => ipcRenderer.send('update-display', content),
    reloadWindow: content => ipcRenderer.send('reload', content),
    getPrinters: () => ipcRenderer.invoke("get-printers"),
    getPrinterChoice: () => ipcRenderer.invoke("get-printer-choice"),
    setPrinterChoice: choice => ipcRenderer.invoke("set-printer-choice", choice),
    testPrint: kind => ipcRenderer.send("test-print", kind),
    exportLogs: () => ipcRenderer.invoke("export-logs"),
    getUpdateStatus: () => ipcRenderer.invoke("get-update-status"),
    checkForUpdates: quiet => ipcRenderer.invoke("check-for-updates", !!quiet),
    installUpdateNow: () => ipcRenderer.invoke("install-update-now"),
    // Returns a function that stops listening (the home screen opens and closes many times).
    onUpdateStatus: callback => {
        const listener = (evt, status) => callback(status);
        ipcRenderer.on("update-status", listener);
        return () => ipcRenderer.removeListener("update-status", listener);
    },
    closeApp: () => ipcRenderer.send("close-window"),
    relaunch: () => ipcRenderer.send("relaunch"),
    dialog: () => ipcRenderer.send("open-dialog"),
    toggleFullscreen: (screen) => ipcRenderer.send("exit-fullscreen", screen),
    hasError: callback => ipcRenderer.on('has-error', (evt, err)=> callback(err))
});