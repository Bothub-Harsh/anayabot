const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { query } = require('../database/db');

/**
 * GET /api/users/:userId
 * Get public user profile
 */
router.get('/:userId', async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.photo_url,
              u.created_at, u.last_seen_at,
              pp.total_matches, pp.wins, pp.losses, pp.draws,
              pp.win_streak, pp.best_win_streak, pp.total_xp, pp.level
       FROM users u
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       WHERE u.id = $1 AND u.is_banned = FALSE`,
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const winRate = user.total_matches > 0
      ? Math.round((user.wins / user.total_matches) * 100)
      : 0;

    res.json({
      user: {
        ...user,
        winRate
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * GET /api/users/:userId/matches
 * Get user's match history
 */
router.get('/:userId/matches', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT m.id, m.room_code, m.name, m.status, m.started_at, m.completed_at,
              mp.color, mp.finished_position,
              u_winner.username as winner_username, u_winner.first_name as winner_name
       FROM matches m
       JOIN match_players mp ON m.id = mp.match_id
       LEFT JOIN users u_winner ON m.winner_id = u_winner.id
       WHERE mp.user_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.userId, limit, offset]
    );

    res.json({ matches: result.rows, page, limit });
  } catch (error) {
    console.error('Get user matches error:', error);
    res.status(500).json({ error: 'Failed to fetch user matches' });
  }
});

/**
 * GET /api/users/:userId/achievements
 * Get user achievements
 */
router.get('/:userId/achievements', async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, ua.earned_at
       FROM achievements a
       LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
       ORDER BY ua.earned_at DESC NULLS LAST, a.xp_reward DESC`,
      [req.params.userId]
    );

    res.json({ achievements: result.rows });
  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

/**
 * PUT /api/users/me/settings
 * Update current user settings
 */
router.put('/me/settings', requireAuth, async (req, res) => {
  try {
    const { language_code } = req.body;
    
    if (language_code) {
      await query(
        'UPDATE users SET language_code = $2 WHERE id = $1',
        [req.user.id, language_code]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
