const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

// Uploads land in tmp/temp with a random name (the original name is never used as a path)
// and are processed/moved by the route.
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(config.tmpDir, 'temp'));
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
});

const ALLOWED = /\.(jpe?g|png|webp|gif|bmp|xlsx|xls|csv)$/i;

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (ALLOWED.test(file.originalname)) return cb(null, true);
        cb(new Error('Only images (jpg, png, webp) or spreadsheets (xlsx, xls, csv) can be uploaded!'));
    },
});

module.exports = upload
