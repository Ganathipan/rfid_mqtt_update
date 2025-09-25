/**
 * ExitOut Stack Routes
 * 
 * Provides REST API endpoints for managing the exitout stack system.
 * Mounted under /api/exitout
 */

const express = require('express');
const router = express.Router();
const exitoutStackService = require('../services/exitoutStackService');
const pool = require('../db/pool');

/**
 * GET /api/exitout/stack
 * Returns the current exitout stack with counts per team
 */
router.get('/stack', async (req, res) => {
  try {
    const stack = exitoutStackService.getStack();
    const stats = exitoutStackService.getStackStats();
    
    res.status(200).json({
      success: true,
      stack,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[ExitOut Routes] Error getting stack:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve exitout stack',
      message: error.message
    });
  }
});

/**
 * POST /api/exitout/release/:registrationId
 * Releases all cards in the stack for the specified team
 */
router.post('/release/:registrationId', async (req, res) => {
  const { registrationId } = req.params;
  
  if (!registrationId) {
    return res.status(400).json({
      success: false,
      error: 'Registration ID is required'
    });
  }
  
  try {
    const releaseResult = await exitoutStackService.releaseAll(registrationId);
    
    if (releaseResult.status === 'no_cards_in_stack') {
      return res.status(200).json({
        success: true,
        message: 'No cards in stack for this team',
        result: releaseResult
      });
    }
    
    if (releaseResult.status === 'transaction_failed') {
      return res.status(500).json({
        success: false,
        error: 'Failed to release cards due to database error',
        result: releaseResult
      });
    }
    
    res.status(200).json({
      success: true,
      message: `Released ${releaseResult.released} cards for team ${registrationId}`,
      result: releaseResult
    });
    
  } catch (error) {
    console.error(`[ExitOut Routes] Error releasing cards for team ${registrationId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to release cards',
      message: error.message,
      registrationId
    });
  }
});

/**
 * GET /api/exitout/stats
 * Returns overall exitout stack statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = exitoutStackService.getStackStats();
    
    res.status(200).json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[ExitOut Routes] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve exitout statistics',
      message: error.message
    });
  }
});

/**
 * POST /api/exitout/clear
 * Clears the entire exitout stack (admin operation)
 * WARNING: This will remove all stacked cards without processing them
 */
router.post('/clear', async (req, res) => {
  try {
    const clearResult = exitoutStackService.clearStack();
    
    res.status(200).json({
      success: true,
      message: 'Exitout stack cleared successfully',
      result: clearResult
    });
  } catch (error) {
    console.error('[ExitOut Routes] Error clearing stack:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear exitout stack',
      message: error.message
    });
  }
});

/**
 * GET /api/exitout/team/:registrationId
 * Returns the exitout stack for a specific team
 */
router.get('/team/:registrationId', async (req, res) => {
  const { registrationId } = req.params;
  
  if (!registrationId) {
    return res.status(400).json({
      success: false,
      error: 'Registration ID is required'
    });
  }
  
  try {
    const fullStack = exitoutStackService.getStack();
    const teamStack = fullStack.find(item => item.registrationId === registrationId);
    
    if (!teamStack) {
      return res.status(200).json({
        success: true,
        team: {
          registrationId,
          cardCount: 0,
          cards: [],
          lastUpdated: new Date().toISOString()
        }
      });
    }
    
    res.status(200).json({
      success: true,
      team: teamStack
    });
  } catch (error) {
    console.error(`[ExitOut Routes] Error getting team stack for ${registrationId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve team exitout stack',
      message: error.message,
      registrationId
    });
  }
});

/**
 * POST /api/exitout/simulate/:registrationId
 * Simulates adding a card to the exitout stack for testing purposes
 * This is useful for development and testing
 */
router.post('/simulate/:registrationId', async (req, res) => {
  const { registrationId } = req.params;
  const { tagId } = req.body;
  
  if (!registrationId) {
    return res.status(400).json({
      success: false,
      error: 'Registration ID is required'
    });
  }
  
  if (!tagId) {
    return res.status(400).json({
      success: false,
      error: 'Tag ID is required in request body'
    });
  }
  
  try {
    const result = exitoutStackService.addToStack(registrationId, tagId);
    
    res.status(200).json({
      success: true,
      message: `Added ${tagId} to exitout stack for team ${registrationId}`,
      result
    });
  } catch (error) {
    console.error(`[ExitOut Routes] Error simulating add to stack:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to add card to exitout stack',
      message: error.message
    });
  }
});

module.exports = router;