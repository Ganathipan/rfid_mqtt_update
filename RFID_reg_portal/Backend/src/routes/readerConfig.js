const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/reader-config/:rIndex  => { readerID, portal }
router.get('/reader-config/:rIndex', async (req, res) => {
  const rIndex = Number(req.params.rIndex);
  if (!Number.isInteger(rIndex) || rIndex < 0) {
    return res.status(400).json({ error: 'invalid rIndex' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT reader_id, portal FROM reader_config WHERE r_index = $1',
      [rIndex]
    );
    if (!rows.length) {
      // return explicit defaults when not found
      return res.json({ readerID: 'REGISTER', portal: 'portal1' });
    }
    const { reader_id, portal } = rows[0];
    return res.json({ readerID: reader_id, portal });
  } catch (e) {
    console.error('[reader-config] error:', e);
    return res.status(500).json({ error: 'server error' });
  }
});

// GET /api/reader-config  => list all configs
router.get('/reader-config', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT r_index, reader_id, portal, updated_at FROM reader_config ORDER BY r_index');
    return res.json(rows.map(r => ({ r_index: r.r_index, reader_id: r.reader_id, portal: r.portal, updated_at: r.updated_at })));
  } catch (e) {
    console.error('[reader-config:list] error:', e);
    return res.status(500).json({ error: 'server error' });
  }
});

// POST /api/reader-config  => upsert { r_index, reader_id, portal }
router.post('/reader-config', async (req, res) => {
  const { r_index, reader_id, portal } = req.body || {};
  const idx = Number(r_index);
  if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: 'invalid r_index' });
  const rid = String(reader_id || '').trim();
  const p = String(portal || '').trim();
  if (!rid || !p) return res.status(400).json({ error: 'reader_id and portal are required' });
  try {
    await pool.query(
      `INSERT INTO reader_config (r_index, reader_id, portal)
       VALUES ($1, $2, $3)
       ON CONFLICT (r_index) DO UPDATE
       SET reader_id = EXCLUDED.reader_id,
           portal = EXCLUDED.portal,
           updated_at = NOW()`,
      [idx, rid.toUpperCase(), p]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error('[reader-config:upsert] error:', e);
    return res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/reader-config/:rIndex  => update { reader_id?, portal? }
router.put('/reader-config/:rIndex', async (req, res) => {
  const idx = Number(req.params.rIndex);
  if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: 'invalid rIndex' });
  const rid = req.body?.reader_id != null ? String(req.body.reader_id).trim() : undefined;
  const p = req.body?.portal != null ? String(req.body.portal).trim() : undefined;
  if (!rid && !p) return res.status(400).json({ error: 'nothing to update' });
  try {
    const sets = [];
    const vals = [];
    let i = 1;
    if (rid) { sets.push(`reader_id = $${++i}`); vals.push(rid.toUpperCase()); }
    if (p) { sets.push(`portal = $${++i}`); vals.push(p); }
    sets.push(`updated_at = NOW()`);
    const sql = `UPDATE reader_config SET ${sets.join(', ')} WHERE r_index = $1`;
    await pool.query(sql, [idx, ...vals]);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[reader-config:update] error:', e);
    return res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/reader-config/:rIndex
router.delete('/reader-config/:rIndex', async (req, res) => {
  const idx = Number(req.params.rIndex);
  if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: 'invalid rIndex' });
  try {
    await pool.query('DELETE FROM reader_config WHERE r_index = $1', [idx]);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[reader-config:delete] error:', e);
    return res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
