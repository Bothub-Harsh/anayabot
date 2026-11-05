const express = require('express');
const router = express.Router();
const { requireAuth, findOrCreateUser, verifyTelegramInitData } = require('../middleware/auth');
const { query } = require('../database/db');

function formatUserResponse(u) {
  return {
    id: u.id,
    telegramId: u.telegram_id,
    telegram_id: u.telegram_id,
    username: u.username,
    firstName: u.first_name,
    first_name: u.first_name,
    lastName: u.last_name,
    last_name: u.last_name,
    photoUrl: u.photo_url,
    photo_url: u.photo_url,
    isAdmin: u.is_admin,
    is_admin: u.is_admin,
    level: u.level || 1,
    totalXp: u.total_xp || 0,
    total_xp: u.total_xp || 0,
    totalMatches: u.total_matches || 0,
    total_matches: u.total_matches || 0,
    wins: u.wins || 0,
    losses: u.losses || 0,
    winStreak: u.win_streak || 0,
    win_streak: u.win_streak || 0,
    bestWinStreak: u.best_win_streak || 0,
    best_win_streak: u.best_win_streak || 0
  };
}

async function handleLogin(req, res) {
  try {
    const initData = req.headers['x-telegram-init-data'] || req.body?.initData;
    const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || !process.env.TELEGRAM_BOT_TOKEN;

    let telegramUser = null;

    if (isDev && (!initData || initData === 'dev_bypass' || !process.env.TELEGRAM_BOT_TOKEN)) {
      telegramUser = {
        id: 123456789,
        first_name: 'Player',
        username: 'ludoplayer',
        language_code: 'en'
      };
    } else if (initData) {
      telegramUser = verifyTelegramInitData(initData);
    }

    if (!telegramUser) {
      return res.status(401).json({ error: 'Invalid or missing Telegram authentication' });
    }

    if (telegramUser.is_bot) {
      return res.status(403).json({ error: 'Bots are not allowed' });
    }

    const user = await findOrCreateUser(telegramUser);

    if (user.is_banned) {
      return res.status(403).json({
        error: 'Your account has been banned',
        reason: user.ban_reason
      });
    }

    // Fetch full stats
    const statsResult = await query(
      `SELECT u.*, pp.total_matches, pp.wins, pp.losses, pp.win_streak,
              pp.best_win_streak, pp.total_xp, pp.level
       FROM users u
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       WHERE u.id = $1`,
      [user.id]
    );

    const fullUser = statsResult.rows[0] || user;

    res.json({
      success: true,
      user: formatUserResponse(fullUser)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Support both /login and /telegram
router.post('/login', handleLogin);
router.post('/telegram', handleLogin);

/**
 * GET /api/auth/me
 * Get current user info with stats
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const statsResult = await query(
      `SELECT u.*, pp.total_matches, pp.wins, pp.losses, pp.win_streak,
              pp.best_win_streak, pp.total_xp, pp.level
       FROM users u
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    const user = statsResult.rows[0] || req.user;
    res.json({
      user: formatUserResponse(user)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
