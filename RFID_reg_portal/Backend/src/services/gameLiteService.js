const pool = require('../db/pool');
const { getConfig, getRule, getClusterRule, normalizeLabel } = require('../config/gameLiteConfig');
const exitoutStackService = require('./exitoutStackService');

async function ensureTeamScoreRow(client, registrationId) {
  await client.query(
    `INSERT INTO team_scores_lite (registration_id, score)
     VALUES ($1, 0)
     ON CONFLICT (registration_id) DO NOTHING`,
    [registrationId]
  );
}

async function addPointsToTeam(client, registrationId, points) {
  await ensureTeamScoreRow(client, registrationId);
  await client.query(
    `UPDATE team_scores_lite SET score = score + $2 WHERE registration_id = $1`,
    [registrationId, points]
  );
}

async function getTeamIdForRfid(rfid) {
  const r = await pool.query(
    `SELECT registration_id FROM members WHERE rfid_card_id = $1 LIMIT 1`,
    [rfid]
  );
  return r.rowCount ? r.rows[0].registration_id : null;
}

async function getMemberIdsForTeam(registrationId) {
  const r = await pool.query(
    `SELECT rfid_card_id FROM members WHERE registration_id = $1`,
    [registrationId]
  );
  return r.rows.map(row => row.rfid_card_id);
}

async function recordMemberClusterVisitIfFirst(client, memberId, clusterLabel) {
  const res = await client.query(
    `INSERT INTO member_cluster_visits_lite (member_id, cluster_label)
     VALUES ($1, $2)
     ON CONFLICT (member_id, cluster_label) DO NOTHING
     RETURNING member_id`,
    [memberId, clusterLabel]
  );
  return res.rowCount > 0; // true if first time
}

async function handlePostLogInserted(log) {
  const cfg = getConfig();
  if (!cfg.enabled) return { skipped: true, reason: 'disabled' };

  const { rfid_card_id: rfid } = log;
  const label = normalizeLabel(log.label);
  const eligiblePrefix = String(getRule('eligibleLabelPrefix', 'CLUSTER') || '').toUpperCase();
  if (!label || !label.startsWith(eligiblePrefix)) {
    // If EXITOUT, add to stack instead of immediate cleanup
    if (label === 'EXITOUT') {
      try {
        const teamId = await getTeamIdForRfid(rfid);
        if (teamId) {
          exitoutStackService.addToStack(teamId, rfid);
          console.log(`[GameLite] Added ${rfid} to exitout stack for team ${teamId}`);
        } else {
          console.warn(`[GameLite] EXITOUT tap for ${rfid} but no team found - using legacy cleanup`);
          await maybeCleanupTeamOnExitout(rfid);
        }
      } catch (stackErr) {
        console.error(`[GameLite] Error adding to exitout stack:`, stackErr);
        // Fallback to legacy cleanup on error
        try { await maybeCleanupTeamOnExitout(rfid); } catch (_) {}
      }
    }
    return { skipped: true, reason: 'label-not-eligible' };
  }

  const teamId = await getTeamIdForRfid(rfid);
  if (!teamId) return { skipped: true, reason: 'rfid-not-in-team' };

  // find the member_id for this rfid in this team
  const memberRes = await pool.query(
    `SELECT id FROM members WHERE registration_id = $1 AND rfid_card_id = $2 LIMIT 1`,
    [teamId, rfid]
  );
  if (memberRes.rowCount === 0) return { skipped: true, reason: 'member-not-found' };
  const memberId = memberRes.rows[0].id;

  const client = await pool.connect();
  let redemption = null;
  try {
    await client.query('BEGIN');
    const firstTime = await recordMemberClusterVisitIfFirst(client, memberId, label);
    const awardOnlyFirst = !!getRule('awardOnlyFirstVisit', true);
    const rule = getClusterRule(label) || {};
    const awardFirst = Number(rule.awardPoints ?? getRule('pointsPerMemberFirstVisit', 1));
    const awardRepeat = Number(getRule('pointsPerMemberRepeatVisit', 0));
    const points = firstTime ? awardFirst : awardRepeat;
    if (points > 0 && (firstTime || !awardOnlyFirst)) {
      await addPointsToTeam(client, teamId, points);
    }
    await client.query('COMMIT');
    // Automated redemption: if cluster is redeemable, redeem points for this team
    if (rule.redeemable === true) {
      try {
        redemption = await redeemPoints({ registrationId: teamId, clusterLabel: label, redeemedBy: 'auto' });
      } catch (e) {
        redemption = { error: e.message || String(e) };
      }
    }
    return { awarded: points > 0, points, firstTime, teamId, redemption };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function maybeCleanupTeamOnExitout(rfid) {
  const teamId = await getTeamIdForRfid(rfid);
  if (!teamId) return;
  // For all members in this team, check their latest label is EXITOUT
  const members = await pool.query(
    `SELECT id, rfid_card_id FROM members WHERE registration_id = $1`,
    [teamId]
  );
  if (members.rowCount === 0) return;
  const ids = members.rows.map(r => r.rfid_card_id);
  const latest = await pool.query(
    `SELECT rfid_card_id, label, log_time,
            ROW_NUMBER() OVER (PARTITION BY rfid_card_id ORDER BY log_time DESC) AS rn
       FROM logs
      WHERE rfid_card_id = ANY($1)`,
    [ids]
  );
  const latestMap = new Map();
  for (const row of latest.rows) {
    if (row.rn === 1) latestMap.set(row.rfid_card_id, row.label);
  }
  // If any member latest label is not EXITOUT, skip cleanup
  for (const id of ids) {
    const lab = latestMap.get(id);
    if (lab !== 'EXITOUT') return;
  }
  // All latest are EXITOUT: cleanup lite tables for this team
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM member_cluster_visits_lite WHERE member_id IN (SELECT id FROM members WHERE registration_id = $1)`, [teamId]);
    await client.query(`DELETE FROM redemptions_lite WHERE registration_id = $1`, [teamId]);
    await client.query(`DELETE FROM team_scores_lite WHERE registration_id = $1`, [teamId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getTeamScore(registrationId) {
  const r = await pool.query(
    `SELECT score FROM team_scores_lite WHERE registration_id = $1`,
    [registrationId]
  );
  return r.rowCount ? r.rows[0].score : 0;
}

async function redeemPoints({ registrationId, clusterLabel, points, redeemedBy = null }) {
  const label = normalizeLabel(clusterLabel);
  const rule = getClusterRule(label);
  if (!registrationId || !label) throw new Error('Invalid redemption');
  if (!rule || rule.redeemable !== true) throw new Error('Cluster not redeemable');
  const pts = Number(rule.redeemPoints || 0);
  if (!(pts >= 0)) throw new Error('Invalid redeem points');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureTeamScoreRow(client, registrationId);
    const cur = await client.query(
      `SELECT score FROM team_scores_lite WHERE registration_id = $1 FOR UPDATE`,
      [registrationId]
    );
    const current = cur.rows[0].score;
    if (current < pts) {
      throw new Error('Insufficient points');
    }
    await client.query(
      `UPDATE team_scores_lite SET score = score - $2 WHERE registration_id = $1`,
      [registrationId, pts]
    );
    await client.query(
      `INSERT INTO redemptions_lite (registration_id, cluster_label, points_spent, redeemed_by)
       VALUES ($1, $2, $3, $4)`,
      [registrationId, label || 'UNKNOWN', pts, redeemedBy]
    );
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  handlePostLogInserted,
  getTeamIdForRfid,
  getMemberIdsForTeam,
  getTeamScore,
  redeemPoints
};
