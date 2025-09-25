const express = require('express');
const router = express.Router();
const { startReader1ClusterBus, subscribe } = require('../realtime/reader1ClusterBus');
const pool = require('../db/pool');
const { getConfig } = require('../config/gameLiteConfig');

let busStarted = false;
async function ensureBus() {
  if (!busStarted) {
    await startReader1ClusterBus();
    busStarted = true;
  }
}

// 1) List clusters from config
router.get('/kiosk/clusters', (_req, res) => {
  const cfg = getConfig();
  const rules = cfg.rules || {};
  let clusters = Object.keys(rules.clusterRules || {});
  // Fallback: some older configs may have clusters defined at rules root; filter out known non-cluster keys
  if (clusters.length === 0) {
    const reserved = new Set([
      'eligibleLabelPrefix', 'pointsPerMemberFirstVisit', 'pointsPerMemberRepeatVisit', 'awardOnlyFirstVisit',
      'minGroupSize', 'maxGroupSize', 'minPointsRequired', 'clusterRules'
    ]);
    clusters = Object.keys(rules).filter((k) => !reserved.has(k));
  }
  clusters.sort();
  res.json({ clusters });
});

// 2) SSE for a specific cluster, already filtered by trigger to portal='reader1'
router.get('/kiosk/cluster/:clusterLabel/stream', async (req, res) => {
  const want = String(req.params.clusterLabel || '').trim().toUpperCase();
  // Optionally hide non-configured clusters by returning 404
  const cfg = getConfig();
  const clusters = new Set(Object.keys(cfg.rules?.clusterRules || {}));
  if (!clusters.has(want)) {
    res.status(404).json({ error: 'Unknown cluster', cluster: want });
    return;
  }

  await ensureBus();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, cluster: want })}\n\n`);

  const unsub = subscribe((data) => {
    if (!data?.label) return;
    const label = String(data.label).trim().toUpperCase();
    if (label === want) {
      res.write(`event: tap\ndata: ${JSON.stringify(data)}\n\n`);
    }
  });

  // Heartbeat to keep connections alive through proxies
  const hb = setInterval(() => {
    try { res.write(`:keepalive\n\n`); } catch (_) {}
  }, 20000);

  req.on('close', () => { try { unsub(); } catch (_) {} clearInterval(hb); res.end(); });
});

// 3) Eligibility by card (reuse thresholds + score)
router.get('/kiosk/eligibility/by-card/:rfid', async (req, res) => {
  const rfid = req.params.rfid;
  const cfg = getConfig().rules || {};
  try {
    const m = await pool.query('SELECT id AS member_id, registration_id FROM members WHERE rfid_card_id = $1', [rfid]);
    if (m.rowCount === 0) return res.json({ unknown: true, rfid_card_id: rfid });

    const { registration_id } = m.rows[0];
    const groupQ = await pool.query('SELECT COUNT(*)::int AS group_size FROM members WHERE registration_id = $1', [registration_id]);
    const group_size = groupQ.rows[0].group_size;

    const scoreQ = await pool.query('SELECT COALESCE(score,0) AS score FROM team_scores_lite WHERE registration_id = $1', [registration_id]);
    const score = scoreQ.rowCount ? scoreQ.rows[0].score : 0;

    const latestQ = await pool.query(
      `SELECT l.label AS latest_label, l.log_time AS last_seen_at
       FROM logs l
       JOIN members m ON m.rfid_card_id = l.rfid_card_id
       WHERE m.registration_id = $1
       ORDER BY l.log_time DESC LIMIT 1`,
      [registration_id]
    );
    const latest_label = latestQ.rowCount ? latestQ.rows[0].latest_label : null;
    const last_seen_at = latestQ.rowCount ? latestQ.rows[0].last_seen_at : null;

    const eligible =
      group_size >= (cfg.minGroupSize ?? 1) &&
      group_size <= (cfg.maxGroupSize ?? 9999) &&
      score >= (cfg.minPointsRequired ?? 0);

    res.json({
      registration_id, group_size, score, eligible,
      minGroupSize: cfg.minGroupSize ?? 1, maxGroupSize: cfg.maxGroupSize ?? 9999, minPointsRequired: cfg.minPointsRequired ?? 0,
      latest_label, last_seen_at,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
