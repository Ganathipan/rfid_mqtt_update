const fs = require('fs');
const path = require('path');

const STORE_FILE = process.env.GAMELITE_CONFIG_FILE || path.join(__dirname, '..', '..', 'server', 'gameLite.config.json');

function loadSync() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const txt = fs.readFileSync(STORE_FILE, 'utf8');
      return JSON.parse(txt);
    }
  } catch (_) {}
  return null;
}

function saveSync(obj) {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (_) {}
}

module.exports = { loadSync, saveSync, STORE_FILE };
