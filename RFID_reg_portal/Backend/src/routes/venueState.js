const express = require('express');
const router = express.Router();
const { getCurrentCrowd, adjustCrowd } = require('../services/venueState');

// GET /api/venue/current
router.get('/venue/current', async (_req, res) => {
  try {
    const current = await getCurrentCrowd();
    res.json({ current_crowd: current });
  } catch (e) {
    console.error('[venue/current] error', e);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/venue/adjust  { delta }
router.post('/venue/adjust', async (req, res) => {
  try {
    const d = Number(req.body?.delta || 0);
    const current = await adjustCrowd(d);
    res.json({ current_crowd: current });
  } catch (e) {
    console.error('[venue/adjust] error', e);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
