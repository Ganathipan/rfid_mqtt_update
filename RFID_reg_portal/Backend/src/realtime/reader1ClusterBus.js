const { Client } = require('pg');

const channel = 'logs_reader1_cluster';
let subs = new Set();

function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

async function startReader1ClusterBus() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/rfidn',
  });
  await client.connect();
  await client.query(`LISTEN ${channel}`);
  client.on('notification', (msg) => {
    try {
      const data = JSON.parse(msg.payload);
      for (const fn of subs) { try { fn(data); } catch (_) {} }
    } catch (_) {}
  });
  client.on('error', (e) => console.error('reader1ClusterBus error:', e.message));
  return client;
}

module.exports = { startReader1ClusterBus, subscribe };
