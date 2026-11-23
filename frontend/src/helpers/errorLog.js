import axios from 'axios';
import toast from 'react-hot-toast';
import { BACKEND_URL } from '../config';

// Sends problems seen on the screen to the POS log (backend/utils/log.js), so they can be read
// later under Configuration → Logs: page errors, failed requests to the POS server, and every
// error message the cashier was shown. Never throws; the same message at most once a minute.
const lastSent = new Map();
// The real fetch, kept before it is wrapped below (the log itself must not be logged).
const rawFetch = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null;
const short = (url) => String(url || '').replace(BACKEND_URL, '/').replace(/^https?:\/\/[^/]+/, '');
const isLogCall = (url) => String(url || '').includes('logs/client');
const asText = (value) => (typeof value === 'string' ? value : value?.message ? value.message : '');

export function reportToLog(area, message, details, level = 'error') {
    try {
        if (!rawFetch) return;
        const key = `${area}|${message}`;
        const now = Date.now();
        if (now - (lastSent.get(key) || 0) < 60000) return;
        lastSent.set(key, now);
        rawFetch(`${BACKEND_URL}logs/client`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'pos-token': localStorage.getItem('pos-token') || '' },
            body: JSON.stringify({ level, area, message: String(message ?? '').slice(0, 1000), details: String(details ?? '').slice(0, 3000) }),
        }).catch(() => {});
    } catch (e) {
        // never break the screen
    }
}

let installed = false;
export function installErrorLog() {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    // Page errors and unhandled promise errors anywhere in the UI.
    window.addEventListener('error', (event) => {
        reportToLog('page', event.message || 'Script error', `${event.filename || ''}:${event.lineno || ''} ${event.error?.stack || ''}`);
    });
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        reportToLog('page', `Unhandled: ${reason?.message || String(reason)}`, reason?.stack || '');
    });

    // Requests made with axios that fail (refused, server error, or no answer at all).
    axios.interceptors.response.use((response) => response, (error) => {
        const cfg = error.config || {};
        if (!isLogCall(cfg.url)) {
            const status = error.response?.status;
            reportToLog('request', `${String(cfg.method || 'get').toUpperCase()} ${short(cfg.url)} failed: ${status ? `HTTP ${status}` : 'no answer from the POS server'}`,
                error.response?.data?.message || error.response?.data?.error || error.message, status === 401 ? 'warn' : 'error');
        }
        return Promise.reject(error);
    });

    // Requests made with fetch (the product, category and offer lists).
    if (rawFetch) {
        window.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : input?.url;
            const method = String(init?.method || input?.method || 'GET').toUpperCase();
            try {
                const res = await rawFetch(input, init);
                if (!res.ok && !isLogCall(url)) reportToLog('request', `${method} ${short(url)} failed: HTTP ${res.status}`, '', res.status === 401 ? 'warn' : 'error');
                return res;
            } catch (error) {
                if (!isLogCall(url)) reportToLog('request', `${method} ${short(url)} failed: no answer from the POS server`, error.message);
                throw error;
            }
        };
    }

    // Every red error message shown to the cashier.
    const showError = toast.error;
    toast.error = (message, options) => {
        reportToLog('shown', asText(message) || 'error message', '', 'warn');
        return showError(message, options);
    };
}
