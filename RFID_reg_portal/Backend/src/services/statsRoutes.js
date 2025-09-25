const express = require('express');
const router = express.Router();
const {
  getClusterOccupancy,
  deriveMovements
} = require('./statsController');

// Routes
router.get('/cluster-occupancy', getClusterOccupancy);
router.post('/derive-movements', deriveMovements);

module.exports = router;
