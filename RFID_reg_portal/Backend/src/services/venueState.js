const pool = require('../db/pool');

async function ensureRow(client = pool) {
  await client.query(`INSERT INTO venue_state (id, current_crowd) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`);
}

async function getCurrentCrowd(client = pool) {
  await ensureRow(client);
  const { rows } = await client.query('SELECT current_crowd FROM venue_state WHERE id = 1');
  return rows.length ? Number(rows[0].current_crowd || 0) : 0;
}

async function adjustCrowd(delta = 0) {
  const d = Number(delta || 0);
  // atomic upsert: insert initial or adjust existing
  const { rows } = await pool.query(
    `INSERT INTO venue_state (id, current_crowd)
       VALUES (1, GREATEST($1, 0))
     ON CONFLICT (id) DO UPDATE
       SET current_crowd = GREATEST(venue_state.current_crowd + $1, 0), updated_at = NOW()
     RETURNING current_crowd`,
    [d]
  );
  return rows.length ? Number(rows[0].current_crowd || 0) : 0;
}

async function incCrowd(delta = 1) { return adjustCrowd(Math.max(0, Number(delta || 0))); }
async function decCrowd(delta = 1) { return adjustCrowd(-Math.max(0, Number(delta || 0))); }

module.exports = { getCurrentCrowd, incCrowd, decCrowd, adjustCrowd };
