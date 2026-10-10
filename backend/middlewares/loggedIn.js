const jwt = require('jsonwebtoken');
const config = require('../config');

function readUser(req) {
    const token = req.header('pos-token');
    if (!token || token === 'null') return null;
    try {
        return jwt.verify(token, config.jwtSecret).user;
    } catch (err) {
        return null;
    }
}

function attach(req, user) {
    req.user = user;
    if (!req.body || typeof req.body !== 'object') req.body = {};
    // Routes still read req.body.myID; always overwrite it so a client can't send its own.
    req.body.myID = user ? user.id : undefined;
}

// Rejects the request with 401 (the UI then logs out) when the token is missing or invalid.
const loggedIn = (req, res, next) => {
    const user = readUser(req);
    if (!user) {
        return res.status(401).send({ status: false, error: 'Please authenticate using correct token' });
    }
    attach(req, user);
    next();
};

// For routes the UI calls without the token header (see docs/REFACTOR_GUIDE.md): uses the
// user when a valid token is sent, but never blocks the request.
loggedIn.optional = (req, res, next) => {
    attach(req, readUser(req));
    next();
};

module.exports = loggedIn;
