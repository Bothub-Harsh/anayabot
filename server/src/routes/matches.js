const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');
const matchService = require('../services/matchService');
const { getPublicGameState } = require('../game/ludoEngine');

/**
 * GET /api/matches
 * Get public matches list
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const matches = await matchService.getPublicMatches();
    res.json({ matches });
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

/**
 * POST /api/matches
 * Create a new match
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, maxPlayers, visibility, settings } = req.body;

    if (maxPlayers && (maxPlayers < 2 || maxPlayers > 4)) {
      return res.status(400).json({ error: 'maxPlayers must be between 2 and 4' });
    }

    const match = await matchService.createMatch(req.user.id, {
      name,
      maxPlayers: maxPlayers || 4,
      visibility: visibility || 'public',
      settings: settings || {}
    });

    res.status(201).json({ match });
  } catch (error) {
    console.error('Create match error:', error);
    res.status(500).json({ error: 'Failed to create match' });
  }
});

/**
 * GET /api/matches/:matchId
 * Get match details
 */
router.get('/:matchId', optionalAuth, async (req, res) => {
  try {
    let match = await matchService.getMatchById(req.params.matchId);
    if (!match && req.params.matchId.length <= 8) {
      match = await matchService.getMatchByRoomCode(req.params.matchId.toUpperCase());
    }
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    const gameState = match.status === 'playing' ? await matchService.getGameState(match.id) : null;
    res.json({ match, gameState });
  } catch (error) {
    console.error('Get match error:', error);
    res.status(500).json({ error: 'Failed to fetch match' });
  }
});

/**
 * GET /api/matches/room/:roomCode and /api/matches/join/:roomCode
 * Get match by room code
 */
const handleFindByCode = async (req, res) => {
  try {
    const match = await matchService.getMatchByRoomCode(req.params.roomCode.toUpperCase());
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    const gameState = match.status === 'playing' ? await matchService.getGameState(match.id) : null;
    res.json({ match, gameState });
  } catch (error) {
    console.error('Get match by room code error:', error);
    res.status(500).json({ error: 'Failed to fetch match' });
  }
};

router.get('/room/:roomCode', optionalAuth, handleFindByCode);
router.get('/join/:roomCode', optionalAuth, handleFindByCode);

/**
 * POST /api/matches/:matchId/join
 * Join a match
 */
router.post('/:matchId/join', requireAuth, async (req, res) => {
  try {
    const result = await matchService.joinMatch(req.params.matchId, req.user.id);
    res.json(result);
  } catch (error) {
    console.error('Join match error:', error);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/matches/:matchId/start
 * Start a match (creator only)
 */
router.post('/:matchId/start', requireAuth, async (req, res) => {
  try {
    const result = await matchService.startMatch(req.params.matchId, req.user.id);
    res.json(result);
  } catch (error) {
    console.error('Start match error:', error);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/matches/:matchId/leave
 * Leave a match
 */
router.post('/:matchId/leave', requireAuth, async (req, res) => {
  try {
    await matchService.leaveMatch(req.params.matchId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Leave match error:', error);
    res.status(500).json({ error: 'Failed to leave match' });
  }
});

/**
 * GET /api/matches/:matchId/state
 * Get current game state
 */
router.get('/:matchId/state', requireAuth, async (req, res) => {
  try {
    const gameState = await matchService.getGameState(req.params.matchId);
    if (!gameState) {
      return res.status(404).json({ error: 'Game state not found' });
    }
    res.json({ gameState: getPublicGameState(gameState) });
  } catch (error) {
    console.error('Get game state error:', error);
    res.status(500).json({ error: 'Failed to fetch game state' });
  }
});

/**
 * GET /api/matches/:matchId/moves
 * Get move history for a match
 */
router.get('/:matchId/moves', optionalAuth, async (req, res) => {
  try {
    const { query } = require('../database/db');
    const result = await query(
      `SELECT gm.*, u.username, u.first_name
       FROM game_moves gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.match_id = $1
       ORDER BY gm.created_at ASC
       LIMIT 500`,
      [req.params.matchId]
    );
    res.json({ moves: result.rows });
  } catch (error) {
    console.error('Get moves error:', error);
    res.status(500).json({ error: 'Failed to fetch moves' });
  }
});

module.exports = router;
