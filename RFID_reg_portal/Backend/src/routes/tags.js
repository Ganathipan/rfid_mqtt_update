
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// Import RFID hardware router
const rfidHardwareRouter = require('./rfidHardware');
router.use(rfidHardwareRouter);

// ===================================================================
// GET /api/tags/status/:rfid
// Returns total points and eligibility for Lego game
// ===================================================================
router.get('/status/:rfid', async (req, res) => {
  const { rfid } = req.params;
  const threshold = 3; // change as needed

  try {
    const result = await pool.query(
      `SELECT COUNT(DISTINCT portal) AS points
         FROM logs
        WHERE rfid_card_id = $1
          AND label LIKE 'CLUSTER%'`,
      [rfid]
    );

    const points = parseInt(result.rows[0].points, 10) || 0;
    const eligible = points >= threshold;

    res.status(200).json({ rfid, points, eligible });
  } catch (e) {
    console.error('[status API error]', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

// ===================================================================
// GET /api/admin/registrations
// Returns all registration records for admin portal
// ===================================================================
router.get('/admin/registrations', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM registration ORDER BY id DESC');
    res.status(200).json(result.rows);
  } catch (e) {
    return handleError(res, e);
  }
});

// ===================================================================
// GET /api/tags/teamScore/:portal
// Returns the team score based on the last tap at this portal
// ===================================================================
router.get('/teamScore/:portal', async (req, res) => {
  const { portal } = req.params;
  const threshold = 3; // points needed for eligibility

  try {
    // Find the last tap at this portal
    const { rows } = await pool.query(
      `SELECT rfid_card_id, log_time
         FROM logs
        WHERE portal = $1
        ORDER BY log_time DESC
        LIMIT 1`,
      [portal]
    );

    if (rows.length === 0) {
      return res.json({ message: "No taps yet" });
    }

    const rfid = rows[0].rfid_card_id;

    // Find the team this RFID belongs to
    const teamRes = await pool.query(
      `SELECT registration_id
         FROM members
        WHERE rfid_card_id = $1`,
      [rfid]
    );

    if (teamRes.rows.length === 0) {
      return res.json({ rfid, message: "Not assigned to a team" });
    }

    const teamId = teamRes.rows[0].registration_id;

    // Find all RFIDs in the same team
    const membersRes = await pool.query(
      `SELECT rfid_card_id FROM members WHERE registration_id = $1`,
      [teamId]
    );
    const memberIds = membersRes.rows.map(r => r.rfid_card_id);

    // Calculate score = number of distinct clusters visited by team
    const pointsRes = await pool.query(
      `SELECT COUNT(DISTINCT portal) AS points
         FROM logs
        WHERE rfid_card_id = ANY($1)
          AND label LIKE 'CLUSTER%'`,
      [memberIds]
    );

    const points = parseInt(pointsRes.rows[0].points, 10) || 0;
    const eligible = points >= threshold;

    res.json({ portal, teamId, points, eligible, lastTap: rows[0].log_time });
  } catch (e) {
    console.error("[teamScore API error]", e);
    res.status(500).json({ error: "Database error" });
  }
});

// Utility: Ensure all REGISTERed cards in logs are present in rfid_cards
async function syncRfidCardsFromLogs() {
  try {
    const { rows } = await pool.query(`SELECT DISTINCT rfid_card_id, portal FROM logs WHERE label = 'REGISTER'`);
    for (const row of rows) {
      const { rfid_card_id, portal } = row;
      const exists = await pool.query(`SELECT 1 FROM rfid_cards WHERE rfid_card_id = $1`, [rfid_card_id]);
      if (exists.rowCount === 0) {
        await pool.query(`INSERT INTO rfid_cards (rfid_card_id, status, portal) VALUES ($1, 'available', $2)`, [rfid_card_id, portal]);
      }
    }
  } catch (e) {
    console.error('[syncRfidCardsFromLogs] Error:', e.message || e);
  }
}


// ===================================================================
// POST /api/tags/updateCount
// Update the group_size for the latest registration for a portal
// ===================================================================
router.post('/updateCount', async (req, res) => {
  const { portal, count } = req.body || {};
  if (!portal) return badReq(res, 'Portal is required');
  if (!count || isNaN(count) || count < 1) return badReq(res, 'Count must be >= 1');
  try {
    // Find latest registration for this portal and previous size
    const latestRes = await pool.query(
      `SELECT id, group_size FROM registration WHERE portal = $1 ORDER BY id DESC LIMIT 1`,
      [portal]
    );
    if (latestRes.rowCount === 0) return res.status(404).json({ error: 'No registration found for portal' });
    const regId = latestRes.rows[0].id;
    const oldSize = Number(latestRes.rows[0].group_size || 0);

    // Update the group size
    const result = await pool.query(
      `UPDATE registration SET group_size = $1 WHERE id = $2 RETURNING id`,
      [count, regId]
    );
    // Adjust venue_state by the delta
    const newSize = Number(count);
    const delta = newSize - oldSize;
    if (delta !== 0) {
      try {
        const { incCrowd, decCrowd } = require('../services/venueState');
        if (delta > 0) await incCrowd(delta);
        else await decCrowd(Math.abs(delta));
      } catch (_) {}
    }
    if (result.rowCount === 0) return res.status(404).json({ error: 'No registration found for portal' });
    return res.status(200).json({ success: true, id: result.rows[0].id });
  } catch (e) {
    return handleError(res, e);
  }
});

// ===================================================================
// POST /api/tags/register
// Register a new individual or group leader
// ===================================================================
router.post('/register', async (req, res) => {
  const {
    portal,
    group_size,
    province = null,
    district = null,
    school = null,
    university = null,
    age_range = null,
    sex = null,
    lang = null
  } = req.body || {};

  if (!portal) return badReq(res, 'Portal is required');
  if (!group_size || isNaN(group_size) || group_size < 1) return badReq(res, 'Group size must be >= 1');

  try {
    await syncRfidCardsFromLogs();
    const result = await pool.query(
      `INSERT INTO registration (portal, group_size, school, university, province, district, age_range, sex, lang)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [portal, group_size, school, university, province, district, age_range, sex, lang]
    );
    // Increment venue crowd by group_size
    try {
      const { incCrowd } = require('../services/venueState');
      await incCrowd(Number(group_size) || 1);
    } catch (_) {}
    return res.status(200).json({ id: result.rows[0].id });
  } catch (e) {
    return handleError(res, e);
  }
});

function handleError(res, err) {
  // Log full error for debugging
  console.error('[API ERROR]', err && err.stack ? err.stack : err);
  // Log the actual error message for troubleshooting
  if (err && err.message) {
    console.error('[API ERROR MESSAGE]', err.message);
  }
  const msg = String(err?.message || err || '');
  if (/^Leader\s+not\s+found$/i.test(msg)) return res.status(404).json({ error: 'Leader not found' });
  if (/^Tag\s+already\s+assigned$/i.test(msg)) return res.status(409).json({ error: 'Tag already assigned' });
  if (/^No\s+matching\s+entry\s+in\s+log$/i.test(msg)) return res.status(404).json({ error: 'No matching entry in log' });
  if (/^No\s+card\s+tapped\s+for\s+registration$/i.test(msg)) return res.status(400).json({ error: 'No card tapped for registration' });
  if (/^Tapped\s+card\s+is\s+not\s+available\s+for\s+registration$/i.test(msg)) return res.status(400).json({ error: 'Tapped card is not available for registration' });
  // Return the actual error message for server errors
  return res.status(500).json({ error: 'Server error: ' + msg });
}

// ---------- log query ----------
// Helper: Get the latest available tag for a portal
// Helper: Get the last REGISTERed tag from logs for a portal, only if available
async function getLastRegisterLogAvailableTag(portal) {
  // Get last REGISTER log for portal
  const { rows } = await pool.query(
    `SELECT rfid_card_id
       FROM logs
      WHERE label = 'REGISTER' AND portal = $1
      ORDER BY log_time DESC
      LIMIT 1`,
    [portal]
  );
  let tagId;
  if (rows.length === 0) {
    // No card tapped for registration
    throw new Error('No card tapped for registration');
  } else {
    tagId = rows[0].rfid_card_id;
    // Check if tag is available and tap is after last_assigned_time or status is released
    const card = await pool.query(
      `SELECT status, last_assigned_time FROM rfid_cards WHERE rfid_card_id = $1`, [tagId]
    );
    if (card.rowCount === 0) {
      throw new Error('Tapped card is not available for registration');
    }
    const status = card.rows[0].status;
    const lastAssigned = card.rows[0].last_assigned_time;
    // Get the REGISTER tap time
    const tapTimeRes = await pool.query(
      `SELECT log_time FROM logs WHERE rfid_card_id = $1 AND portal = $2 AND label = 'REGISTER' ORDER BY log_time DESC LIMIT 1`,
      [tagId, portal]
    );
    const tapTime = tapTimeRes.rows.length > 0 ? tapTimeRes.rows[0].log_time : null;
    if (status === 'released' && tapTime && (!lastAssigned || tapTime > lastAssigned)) {
      // Allow assignment: update status and last_assigned_time
      await pool.query(`UPDATE rfid_cards SET status='available', last_assigned_time=NULL WHERE rfid_card_id = $1`, [tagId]);
    } else if (status === 'available') {
      // Allow assignment
    } else {
      throw new Error('Tapped card is not available for registration');
    }
  }
  return tagId;
}
async function getLastTagFromDB(wantedLabels, portal) {
// Helper: Get the latest available tag for a portal
async function getLastAvailableTagFromDB(portal) {
  const { rows } = await pool.query(
    `SELECT rfid_card_id
       FROM rfid_cards
      WHERE portal = $1 AND status = 'available'
      ORDER BY rfid_card_id DESC
      LIMIT 1`,
    [portal]
  );
  if (rows.length === 0) throw new Error('No available tag for this portal');
  return rows[0].rfid_card_id;
}
  const { rows } = await pool.query(
    `SELECT rfid_card_id
       FROM logs
      WHERE label = ANY($1)
        AND portal = $2
      ORDER BY log_time DESC
      LIMIT 1`,
    [wantedLabels, portal]
  );
  if (rows.length === 0) throw new Error('No matching entry in log');
  return rows[0].rfid_card_id;
}

// ---------- DB helpers ----------
async function lockOrCreateCard(client, tagId, portal) {
  let r = await client.query(
    `SELECT rfid_card_id, status FROM rfid_cards WHERE rfid_card_id=$1 FOR UPDATE`,
    [tagId]
  );
  if (r.rowCount === 0) {
    // Insert new card as 'available' if not present
    await client.query(
      `INSERT INTO rfid_cards (rfid_card_id, status, portal)
       VALUES ($1, 'available', $2)`,
      [tagId, portal]
    );
    r = await client.query(
      `SELECT rfid_card_id, status FROM rfid_cards WHERE rfid_card_id=$1 FOR UPDATE`,
      [tagId]
    );
  }
  return r.rows[0];
}

async function assignTagToLeader(client, tagId, leaderId, portal) {
  // Only assign if card is available and was tapped (checked in getLastRegisterLogAvailableTag)
  const card = await client.query(
    `SELECT status FROM rfid_cards WHERE rfid_card_id = $1 FOR UPDATE`, [tagId]
  );
  if (card.rowCount === 0 || card.rows[0].status.toLowerCase() !== 'available') {
    throw new Error('Tapped card is not available for registration');
  }
  const r = await client.query(
    `SELECT id FROM registration WHERE id=$1 AND portal=$2 FOR UPDATE`,
    [leaderId, portal]
  );
  if (r.rowCount === 0) throw new Error('Leader not found');
  await client.query(
    `INSERT INTO members (registration_id, rfid_card_id, role, portal)
     VALUES ($1, $2, 'LEADER', $3)`,
    [leaderId, tagId, portal]
  );
  await client.query(`UPDATE rfid_cards SET status='assigned', portal=$2, last_assigned_time=NOW() WHERE rfid_card_id=$1`, [tagId, portal]);
}

async function assignTagToMember(client, tagId, leaderId, portal) {
  // Only assign if card is available and was tapped (checked in getLastRegisterLogAvailableTag)
  const card = await client.query(
    `SELECT status FROM rfid_cards WHERE rfid_card_id = $1 FOR UPDATE`, [tagId]
  );
  if (card.rowCount === 0 || card.rows[0].status.toLowerCase() !== 'available') {
    throw new Error('Tapped card is not available for registration');
  }
  const r = await client.query(
    `SELECT id FROM registration WHERE id=$1 AND portal=$2 FOR UPDATE`,
    [leaderId, portal]
  );
  if (r.rowCount === 0) throw new Error('Leader not found');
  await client.query(
    `INSERT INTO members (registration_id, rfid_card_id, role, portal)
     VALUES ($1, $2, 'MEMBER', $3)`,
    [leaderId, tagId, portal]
  );
  await client.query(`UPDATE rfid_cards SET status='assigned', portal=$2, last_assigned_time=NOW() WHERE rfid_card_id=$1`, [tagId, portal]);
}

async function releaseTag(client, tagId, portal) {
  await lockOrCreateCard(client, tagId, portal);
  // Delete all members with this card (regardless of portal)
  await client.query(`DELETE FROM members WHERE rfid_card_id=$1`, [tagId]);
  await client.query(`UPDATE rfid_cards SET status='released' WHERE rfid_card_id=$1`, [tagId]);
}

// ===================================================================
// ...existing code...

// ===================================================================
// POST /api/tags/link
// Assign last REGISTERed card from logs to leader or member
// ===================================================================
router.post('/link', async (req, res) => {
  const { portal, leaderId, asLeader } = req.body || {};
  if (!portal) return badReq(res, 'Portal is required');
  if (!leaderId) return badReq(res, 'Leader ID is required');

  try {
    await syncRfidCardsFromLogs();
    tagId = await getLastRegisterLogAvailableTag(portal);
  } catch (e) {
    return handleError(res, e);
  }
// On server startup, sync rfid_cards from logs
syncRfidCardsFromLogs();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (asLeader) {
      await assignTagToLeader(client, tagId, leaderId, portal);
    } else {
      await assignTagToMember(client, tagId, leaderId, portal);
    }
    await client.query('COMMIT');
    res.status(200).json({ ok: true, portal, leaderId, tagId, role: asLeader ? 'LEADER' : 'MEMBER' });
  } catch (e) {
    await client.query('ROLLBACK');
    return handleError(res, e);
  } finally {
    client.release();
  }
});

// ===================================================================
// GET /api/tags/list-cards
// Show all RFID cards and their status
// ===================================================================
router.get('/list-cards', async (_req, res) => {
  try {
    const result = await pool.query(`SELECT rfid_card_id, status, portal FROM rfid_cards ORDER BY rfid_card_id`);
    res.status(200).json(result.rows);
  } catch (e) {
    return handleError(res, e);
  }
});

// ===================================================================
// GET /api/tags/teamScore/:portal
// Returns the team score based on the last tap at this portal
// ===================================================================
router.get('/teamScore/:portal', async (req, res) => {
  const { portal } = req.params;
  const threshold = 3; // points needed for eligibility

  try {
    // Find the last tap at this portal
    const { rows } = await pool.query(
      `SELECT rfid_card_id, log_time
         FROM logs
        WHERE portal = $1
        ORDER BY log_time DESC
        LIMIT 1`,
      [portal]
    );

    if (rows.length === 0) {
      return res.json({ message: "No taps yet" });
    }

    const rfid = rows[0].rfid_card_id;

    // Find the team this RFID belongs to
    const teamRes = await pool.query(
      `SELECT registration_id
         FROM members
        WHERE rfid_card_id = $1`,
      [rfid]
    );

    if (teamRes.rows.length === 0) {
      return res.json({ rfid, message: "Not assigned to a team" });
    }

    const teamId = teamRes.rows[0].registration_id;

    // Find all RFIDs in the same team
    const membersRes = await pool.query(
      `SELECT rfid_card_id FROM members WHERE registration_id = $1`,
      [teamId]
    );
    const memberIds = membersRes.rows.map(r => r.rfid_card_id);

    // Calculate score = number of distinct clusters visited by team
    const pointsRes = await pool.query(
      `SELECT COUNT(DISTINCT portal) AS points
         FROM logs
        WHERE rfid_card_id = ANY($1)
          AND label LIKE 'CLUSTER%'`,
      [memberIds]
    );

    const points = parseInt(pointsRes.rows[0].points, 10) || 0;
    const eligible = points >= threshold;

    res.json({ portal, teamId, points, eligible, lastTap: rows[0].log_time });
  } catch (e) {
    console.error("[teamScore API error]", e);
    res.status(500).json({ error: "Database error" });
  }
});


// ===================================================================
// OLD exitout watcher (disabled in favor of stack system)
// Background EXITOUT watcher (every 3s) - COMMENTED OUT FOR STACK SYSTEM
// ===================================================================
// Track last processed log_time per portal
/*
let lastProcessedExitout = {};

async function checkAndReleaseOnNewExitout() {
  try {
    // Get latest EXITOUT/EXIT logs per portal
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (portal) rfid_card_id, portal, log_time
      FROM logs
      WHERE label IN ('EXITOUT','EXIT')
      ORDER BY portal, log_time DESC
    `);

    const now = new Date();
    for (const row of rows) {
      const { rfid_card_id: tagId, portal, log_time } = row;
      const logDate = new Date(log_time);
      // Only process if log_time is newer than last processed for this portal
      // AND the tag was assigned within the last 3 minutes
      if (
        (!lastProcessedExitout[portal] || logDate > new Date(lastProcessedExitout[portal])) &&
        (now - logDate <= 180000)
      ) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await releaseTag(client, tagId, portal);
          await client.query('COMMIT');
          lastProcessedExitout[portal] = log_time;
          console.log(`[EXITOUT watcher] Released tag: ${tagId} from ${portal} at ${log_time}`);
        } catch (e) {
          await client.query('ROLLBACK');
          console.error('[EXITOUT watcher] Error:', e.message || e);
        } finally {
          client.release();
        }
      }
    }
  } catch (e) {
    // no EXITOUT found
  }
}

// OLD exitout watcher interval - DISABLED in favor of stack system
// setInterval(checkAndReleaseOnNewExitout, 3000);
*/
