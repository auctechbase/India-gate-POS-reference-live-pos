// The POS log: one text file per day in the logs folder (%APPDATA%\India Gate POS\logs in the
// app), kept 30 days. What goes in: prints (printer, paper, result), refused payments, website
// sync problems, server and screen errors, and everything written with console.error/warn.
// Configuration → Logs shows it and saves a copy to send for support.
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const config = require('../config');

const KEEP_DAYS = 30;
const MAX_LINE = 4000;
const dir = config.logsDir;
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fileFor = (d) => path.join(dir, `pos-${dayOf(d)}.log`);

function text(details) {
    if (details === undefined || details === null || details === '') return '';
    if (details instanceof Error) return details.stack || details.message;
    if (typeof details === 'string') return details;
    try { return JSON.stringify(details); } catch (e) { return util.inspect(details); }
}

function write(level, area, message, details) {
    try {
        const now = new Date();
        let line = `${dayOf(now)} ${timeOf(now)} ${level.padEnd(5)} [${area}] ${String(message ?? '')}`;
        const extra = text(details);
        if (extra) line += ` | ${extra}`;
        if (line.length > MAX_LINE) line = `${line.slice(0, MAX_LINE)} …`;
        // Continuation lines (stack traces) are indented so each entry starts at the line start.
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(fileFor(now), `${line.replace(/\r?\n/g, '\n    ')}\n`);
    } catch (e) {
        // Logging must never break the POS.
    }
}

const log = {
    info: (area, message, details) => write('INFO', area, message, details),
    warn: (area, message, details) => write('WARN', area, message, details),
    error: (area, message, details) => write('ERROR', area, message, details),
};

let consoleCaptured = false;
// console.error / console.warn anywhere in the app also land in the log.
function captureConsole() {
    if (consoleCaptured) return;
    consoleCaptured = true;
    for (const [method, level] of [['error', 'ERROR'], ['warn', 'WARN']]) {
        const original = console[method].bind(console);
        console[method] = (...args) => {
            original(...args);
            write(level, 'console', util.format(...args));
        };
    }
}

function logFiles() {
    try {
        return fs.readdirSync(dir).filter((f) => /^pos-\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort();
    } catch (e) {
        return [];
    }
}

function removeOld() {
    const cutoff = dayOf(new Date(Date.now() - KEEP_DAYS * 86400000));
    for (const file of logFiles()) {
        if (file.slice(4, 14) < cutoff) {
            try { fs.unlinkSync(path.join(dir, file)); } catch (e) { /* in use: next time */ }
        }
    }
}

/** The last `maxLines` lines of the last `days` days, oldest first. */
function recent(days = 3, maxLines = 400) {
    const lines = [];
    for (const file of logFiles().slice(-days)) {
        try { lines.push(...fs.readFileSync(path.join(dir, file), 'utf8').split('\n').filter(Boolean)); } catch (e) { /* skip */ }
    }
    return lines.slice(-maxLines);
}

/** One text with a header and the last `days` days, for sending to support. */
function exportText(days = 7, extraHeader = []) {
    const header = [
        'India Gate POS log',
        `Saved: ${new Date().toString()}`,
        `Computer: ${os.hostname()} | ${os.type()} ${os.release()} | ${os.arch()}`,
        ...extraHeader,
        '',
    ];
    const body = [];
    for (const file of logFiles().slice(-days)) {
        try { body.push(`===== ${file}`, fs.readFileSync(path.join(dir, file), 'utf8')); } catch (e) { /* skip */ }
    }
    return [...header, ...(body.length ? body : ['(no log entries yet)'])].join('\n');
}

module.exports = { ...log, log, captureConsole, removeOld, recent, exportText, dir };
