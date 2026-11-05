const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

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

    let dateFilter = '';
    if (period === 'weekly') {
      dateFilter = "AND pp.updated_at > NOW() - INTERVAL '7 days'";
    } else if (period === 'monthly') {
      dateFilter = "AND pp.updated_at > NOW() - INTERVAL '30 days'";
    }

    const result = await query(
      `SELECT 
         ROW_NUMBER() OVER (ORDER BY pp.wins DESC, pp.total_xp DESC) as rank,
         u.id, u.username, u.first_name, u.last_name, u.photo_url,
         pp.total_matches, pp.wins, pp.losses, pp.win_streak,
         pp.best_win_streak, pp.total_xp, pp.level,
         CASE WHEN pp.total_matches > 0 
           THEN ROUND((pp.wins::NUMERIC / pp.total_matches) * 100, 1)
           ELSE 0 
         END as win_rate
       FROM player_profiles pp
       JOIN users u ON pp.user_id = u.id
       WHERE u.is_banned = FALSE ${dateFilter}
       ORDER BY pp.wins DESC, pp.total_xp DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM player_profiles pp
       JOIN users u ON pp.user_id = u.id
       WHERE u.is_banned = FALSE ${dateFilter}`
    );

    res.json({
      leaderboard: result.rows,
      total: parseInt(countResult.rows[0].count),
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
    const result = await query(
      `SELECT rank FROM (
         SELECT u.id,
           ROW_NUMBER() OVER (ORDER BY pp.wins DESC, pp.total_xp DESC) as rank
         FROM player_profiles pp
         JOIN users u ON pp.user_id = u.id
         WHERE u.is_banned = FALSE
       ) ranked
       WHERE id = $1`,
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in leaderboard' });
    }

    res.json({ rank: parseInt(result.rows[0].rank) });
  } catch (error) {
    console.error('Get user rank error:', error);
    res.status(500).json({ error: 'Failed to fetch user rank' });
  }
});

module.exports = router;
