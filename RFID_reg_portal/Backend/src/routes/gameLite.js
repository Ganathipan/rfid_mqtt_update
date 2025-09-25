const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { getConfig, updateConfig, resetToDefault, getRule, normalizeLabel } = require('../config/gameLiteConfig');
// simple admin guard via API key
function requireAdmin(req, res, next) {
  const key = process.env.GAMELITE_ADMIN_KEY || '';
  if (!key) return res.status(403).json({ error: 'Admin key not configured' });
  const provided = req.headers['x-admin-key'];
  if (provided && provided === key) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
const { getTeamScore, redeemPoints } = require('../services/gameLiteService');

// health/status for the lite manager
router.get('/status', (_req, res) => {
  const cfg = getConfig();
  res.json({ ok: true, enabled: cfg.enabled, rules: cfg.rules });
});

// get current config
router.get('/config', (_req, res) => {
  res.json(getConfig());
});

// update config (shallow merge)
router.post('/config', requireAdmin, (req, res) => {
  const cfg = updateConfig(req.body || {});
  res.json(cfg);
});

// reset config to defaults
router.post('/config/reset', requireAdmin, (_req, res) => {
  res.json(resetToDefault());
});

// get team score by registration id
router.get('/team/:registrationId/score', async (req, res) => {
  try {
    const id = Number(req.params.registrationId);
    const score = await getTeamScore(id);
    res.json({ registrationId: id, score });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// list all team scores (for admin)
router.get('/teams/scores', async (_req, res) => {
  try {
    const r = await pool.query(`SELECT registration_id, score FROM team_scores_lite ORDER BY registration_id DESC`);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// redemption endpoint
router.post('/redeem', requireAdmin, async (req, res) => {
  try {
    const { registrationId, clusterLabel, redeemedBy } = req.body || {};
    const rid = Number(registrationId);
    if (!rid || !clusterLabel) return res.status(400).json({ error: 'registrationId and clusterLabel required' });
    const label = normalizeLabel(clusterLabel);
    const out = await redeemPoints({ registrationId: rid, clusterLabel: label, redeemedBy });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// eligible teams: filter by group size range and min points; include latest team location
router.get('/eligible-teams', async (_req, res) => {
  try {
    const minGroupSize = Number(getRule('minGroupSize', 1));
    const maxGroupSize = Number(getRule('maxGroupSize', 9999));
    const minPointsRequired = Number(getRule('minPointsRequired', 3));

    // Build a CTE to compute latest team location using all members' last log
    const sql = `
      WITH team_members AS (
        SELECT r.id AS registration_id, r.group_size, m.rfid_card_id
        FROM registration r
        JOIN members m ON m.registration_id = r.id
      ),
      latest_member_logs AS (
        SELECT tm.registration_id,
               l.rfid_card_id,
               l.label,
               l.log_time,
               ROW_NUMBER() OVER (PARTITION BY tm.registration_id, l.rfid_card_id ORDER BY l.log_time DESC) AS rn
        FROM team_members tm
        JOIN logs l ON l.rfid_card_id = tm.rfid_card_id
      ),
      latest_per_member AS (
        SELECT registration_id, rfid_card_id, label, log_time
        FROM latest_member_logs
        WHERE rn = 1
      ),
      team_location AS (
        SELECT registration_id,
               -- team latest is by max log_time among members; pick associated label via DISTINCT ON trick
               (SELECT lm.label
                  FROM latest_per_member lm
                 WHERE lm.registration_id = lpm.registration_id
                 ORDER BY lm.log_time DESC
                 LIMIT 1) AS latest_label,
               (SELECT MAX(lm.log_time)
                  FROM latest_per_member lm
                 WHERE lm.registration_id = lpm.registration_id) AS latest_time
        FROM latest_per_member lpm
        GROUP BY registration_id
      )
      SELECT r.id AS registration_id,
             r.group_size,
             COALESCE(ts.score, 0) AS score,
             tl.latest_label,
             tl.latest_time
      FROM registration r
      LEFT JOIN team_scores_lite ts ON ts.registration_id = r.id
      LEFT JOIN team_location tl ON tl.registration_id = r.id
      WHERE r.group_size BETWEEN $1 AND $2
        AND COALESCE(ts.score, 0) >= $3
      ORDER BY ts.score DESC NULLS LAST, r.id DESC;
    `;

    const { rows } = await pool.query(sql, [minGroupSize, maxGroupSize, minPointsRequired]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Leaderboard: top N teams by score
router.get('/leaderboard', async (req, res) => {
  try {
    const lim = Math.max(1, Math.min(1000, Number(req.query.limit) || 10));
    const r = await pool.query(
      `SELECT registration_id, score
         FROM team_scores_lite
        ORDER BY score DESC, registration_id DESC
        LIMIT $1`,
      [lim]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;

// Admin-only convenience: initialize schema (no-op now that schema.sql owns DDL)
router.post('/admin/init', requireAdmin, async (_req, res) => {
  res.json({ ok: true, message: 'Schema managed via Database/schema.sql' });
});
