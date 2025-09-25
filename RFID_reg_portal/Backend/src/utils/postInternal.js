// Fire-and-forget POST to this same server.
// Uses global fetch if available (Node 18+); falls back to http.request.

const http = require('http');

function getBase() {
  // Prefer explicit INTERNAL_BASE (e.g., http://127.0.0.1:4000)
  if (process.env.INTERNAL_BASE) return process.env.INTERNAL_BASE.replace(/\/+$/, '');
  const port = process.env.PORT || 4000;
  return `http://127.0.0.1:${port}`;
}

async function postInternal(path, json = {}) {
  const url = `${getBase()}${path}`;
  if (typeof fetch === 'function') {
    // Node 18+; don't await the response body to keep it non-blocking
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json),
      keepalive: true, // hint; harmless if ignored
    }).catch(() => {});
    return;
  }

  // Fallback for older Node: basic http.request, no response wait
  try {
    const data = Buffer.from(JSON.stringify(json));
    const { hostname, port, pathname } = new URL(url);
    const req = http.request(
      { hostname, port, path: pathname, method: 'POST', headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      }},
      (res) => { res.resume(); /* discard */ }
    );
    req.on('error', () => {});
    req.write(data);
    req.end();
  } catch { /* ignore */ }
}

module.exports = { postInternal };
