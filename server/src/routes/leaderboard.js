const express = require('express');
const router = express.Router();
const { getLeaderboardUsers, models, memoryStore, isDBConnected } = require('../database/db');

/**
 * GET /api/leaderboard
 * Get the global leaderboard
 */
router.get('/', async (req, res) => {
  try {
    const period = req.query.period || 'all'; // all, weekly, monthly
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    const { leaderboard, total } = await getLeaderboardUsers({ limit, offset, period });

    res.json({
      leaderboard,
      total,
      page,
      limit,
      period
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * GET /api/leaderboard/user/:userId
 * Get specific user's rank
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { leaderboard } = await getLeaderboardUsers({ limit: 1000, offset: 0, period: 'all' });
    const userEntry = leaderboard.find(u => String(u.id) === String(userId));

    if (!userEntry) {
      return res.status(404).json({ error: 'User not found in leaderboard' });
    }

    res.json({ rank: userEntry.rank });
  } catch (error) {
    console.error('Get user rank error:', error);
    res.status(500).json({ error: 'Failed to fetch user rank' });
  }
});

module.exports = router;
