const router = require('express').Router();
const fetchuser = require('../middlewares/loggedIn');
const log = require('../utils/log');

const clip = (value, max) => String(value ?? '').slice(0, max);

// Errors on the screen (page crashes, failed requests the UI catches) are sent here to be logged.
// Optional login: errors on the login page count too.
router.post('/client', fetchuser.optional, (req, res) => {
    const { level, area, message, details } = req.body || {};
    const write = level === 'warn' ? log.warn : level === 'info' ? log.info : log.error;
    write(`screen:${clip(area || 'ui', 40)}`, clip(message, 1000), clip(details, 3000) || undefined);
    res.json({ status: true });
});

// The recent entries, for Configuration → Logs.
router.get('/recent', fetchuser, (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 3, 1), 30);
    res.json({ status: true, folder: log.dir, lines: log.recent(days, 500) });
});

// One text file with the last week, when the app cannot save it itself (plain browser).
router.get('/export', fetchuser, (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="india-gate-pos-log-${new Date().toISOString().slice(0, 10)}.txt"`);
    res.send(log.exportText(7));
});

module.exports = router;
