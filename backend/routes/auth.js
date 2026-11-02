const express = require("express");
const User = require('../models/User');
const Currency = require('../models/Currency');
const router = express.Router();
const { body, validationResult } = require('express-validator')
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fetchuser = require('../middlewares/loggedIn');
const config = require('../config');

const CURRENCY_SYMBOLS = { euro: '€ ', eur: '€ ', inr: '₹ ', rupee: '₹ ' };

// Never send the password hash to the browser.
const publicUser = (user) => {
    if (!user) return user;
    const { password, remember_token, ...rest } = user;
    return rest;
};

// Create a user.
// - When the database has no users yet, anyone may create the first account, which becomes admin.
// - After that only a logged-in admin may create users.
router.post('/signup', [
    fetchuser.optional,
    body('name').trim().isLength({ min: 3 }),
    body('email').trim().isEmail(),
    body('password').isLength({ min: 6 }),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ status: false, errors: errors.array() });

        const { count } = await User.query().count('id as count').first();
        const isFirstUser = Number(count) === 0;
        if (!isFirstUser) {
            const me = req.user && await User.query().findById(req.user.id);
            if (!me || me.type !== 'admin') {
                return res.status(403).json({ status: false, message: 'Only an admin can create users!' });
            }
        }

        const email = req.body.email.trim().toLowerCase();
        const existing = await User.query().whereRaw('lower(email) = ?', [email]).first();
        if (existing) {
            return res.status(400).json({ status: false, key: 'email', message: 'A user with that email already exists!' });
        }

        const password = await bcrypt.hash(req.body.password, 10);
        const type = isFirstUser ? 'admin' : (req.body.type === 'admin' ? 'admin' : 'cashier');
        const user = await User.query().insertAndFetch({
            name: req.body.name.trim(),
            email,
            password,
            type,
            status: true,
        });

        return res.json({ status: true, message: 'Account created successfully!', user: publicUser(user) });
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message });
    }
});

// First-run check for the login screen: true while no user exists yet, so the UI can show
// "Create admin account" instead of a login form nobody can use.
router.get('/setup', async (req, res) => {
    try {
        const { count } = await User.query().count('id as count').first();
        return res.json({ status: true, needsSetup: Number(count) === 0 });
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message });
    }
});

// Authenticate the user
router.post('/login', [
    body('email', 'Invalid credentials!').isLength({ min: 5 }),
    body('password', 'Password cannot be blank!').exists(),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: false, errors: errors.array() })
        }
        const user = await User.query().whereRaw('lower(email) = ?', [String(req.body.email).trim().toLowerCase()]).first();
        // Same message for unknown email and wrong password: don't reveal which emails exist.
        if (!user || !(await bcrypt.compare(String(req.body.password), user.password))) {
            return res.status(400).json({ status: false, message: 'Invalid email or password!' })
        }
        let currency = await Currency.query().where('status', true).first();
        if (currency) {
            currency = CURRENCY_SYMBOLS[String(currency.name).toLowerCase()] ?? `${currency.unit || currency.name} `;
        }

        const payload = { user: { id: user.id, type: user.type } };
        const options = config.jwtExpiresIn ? { expiresIn: config.jwtExpiresIn } : {};
        const authToken = jwt.sign(payload, config.jwtSecret, options);
        return res.json({ status: true, authToken, user: publicUser(user), currency });
    } catch (e) {
        console.log("exception occured: ", e)
        return res.status(400).json({ status: false, message: e.message })
    }
});

// Get logged in user details - login required
router.get('/getuser', fetchuser, async (req, res) => {
    try {
        const user = await User.query().findById(req.user.id);
        return res.json(publicUser(user))
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message })
    }
});

module.exports = router
