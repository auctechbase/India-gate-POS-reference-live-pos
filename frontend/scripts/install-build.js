// Copies frontend/build into backend/client/build (the folder the POS backend serves).
// The previous backend build is kept as backend/client/build.bak-<time> so you can roll back.
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', 'build');
const to = path.join(__dirname, '..', '..', 'backend', 'client', 'build');

if (!fs.existsSync(path.join(from, 'index.html'))) {
    console.error('No build found. Run "npm run build" first.');
    process.exit(1);
}
if (fs.existsSync(to)) {
    const backup = `${to}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.renameSync(to, backup);
    console.log(`Old backend build kept as: ${backup}`);
}
fs.cpSync(from, to, { recursive: true });
console.log(`New build installed in: ${to}`);
