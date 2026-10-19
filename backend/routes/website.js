const router = require("express").Router();

// Website orders. Not connected yet: the website will be built later. Planned flow:
// website → cloud queue (pos.dftech.in) → this POS polls for new orders, saves each one once
// (unique website order id), the cashier accepts/rejects, then the POS confirms to the cloud.
router.get('/orders', async (req, res) => {
    return res.json({ status: true, connected: false, orders: [] });
});

module.exports = router;
