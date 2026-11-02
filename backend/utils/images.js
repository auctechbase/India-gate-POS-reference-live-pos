const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');

// Only letters, digits, dot, dash and underscore: a product name like "../../x" can no longer
// write outside the images folder.
const safeName = (name) => String(name || '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 80) || `img_${Date.now()}`;

/**
 * Resize an uploaded/downloaded image to max 400x400 webp inside tmp/<folder>.
 * Returns the path stored in the DB, e.g. "products/1234_milk.webp".
 */
async function saveWebp(input, folder, baseName, quality = 50) {
    const fileName = `${safeName(baseName)}.webp`;
    const outputPath = path.join(config.tmpDir, folder, fileName);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await sharp(input).resize(400, 400, { fit: 'inside' }).webp({ quality }).toFile(outputPath);
    return `${folder}/${fileName}`;
}

// Delete a file stored under tmp/ by its DB path. Never throws and never leaves tmp/.
function removeStored(relativePath) {
    if (!relativePath || relativePath === 'null') return;
    const fullPath = path.resolve(config.tmpDir, relativePath);
    if (!fullPath.startsWith(path.resolve(config.tmpDir) + path.sep)) return;
    fs.promises.unlink(fullPath).catch(() => {});
}

module.exports = { safeName, saveWebp, removeStored };
