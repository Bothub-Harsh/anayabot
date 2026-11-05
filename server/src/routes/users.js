const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { findUserById, models, memoryStore, isDBConnected } = require('../database/db');

/**
 * GET /api/users/:userId
 * Get public user profile
 */
router.get('/:userId', async (req, res) => {
  try {
    const user = await findUserById(req.params.userId);

    if (!user || user.is_banned) {
      return res.status(404).json({ error: 'User not found' });
    }

    const totalMatches = user.total_matches || 0;
    const wins = user.wins || 0;
    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

    res.json({
      user: {
        id: user.id || user._id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        photo_url: user.photo_url,
        created_at: user.created_at,
        last_seen_at: user.last_seen_at,
        total_matches: totalMatches,
        wins,
        losses: user.losses || 0,
        draws: user.draws || 0,
        win_streak: user.win_streak || 0,
        best_win_streak: user.best_win_streak || 0,
        total_xp: user.total_xp || 0,
        level: user.level || 1,
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
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    let matches = [];
    if (models.Match && models.Match.db.readyState === 1) {
      const docs = await models.Match.find({
        'players.userId': userId
      })
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

      matches = docs.map(m => {
        const p = (m.players || []).find(x => x.userId === userId);
        return {
          id: m._id,
          room_code: m.room_code,
          name: m.name,
          status: m.status,
          started_at: m.started_at,
          completed_at: m.completed_at,
          color: p?.color || 'red',
          finished_position: p?.finished_position || null,
          winner_id: m.winner_id
        };
      });
    } else {
      const all = Array.from(memoryStore.matches.values())
        .filter(m => (m.players || []).some(p => p.userId === userId))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      matches = all.slice(offset, offset + limit).map(m => {
        const p = (m.players || []).find(x => x.userId === userId);
        return {
          id: m.id || m._id,
          room_code: m.room_code,
          name: m.name,
          status: m.status,
          started_at: m.started_at,
          completed_at: m.completed_at,
          color: p?.color || 'red',
          finished_position: p?.finished_position || null,
          winner_id: m.winner_id
        };
      });
    }

    res.json({ matches, page, limit });
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
    const user = await findUserById(req.params.userId);
    const wins = user?.wins || 0;
    const matches = user?.total_matches || 0;
    const streak = user?.best_win_streak || 0;

    const achievements = [
      { id: 'first_win', name: 'First Victory', description: 'Win your first Ludo match', earned_at: wins >= 1 ? user?.created_at : null, xp_reward: 50 },
      { id: 'five_wins', name: 'Champion', description: 'Win 5 matches', earned_at: wins >= 5 ? user?.updated_at : null, xp_reward: 150 },
      { id: 'streak_3', name: 'Hot Streak', description: 'Win 3 matches in a row', earned_at: streak >= 3 ? user?.updated_at : null, xp_reward: 200 },
      { id: 'veteran', name: 'Ludo Veteran', description: 'Play 20 matches', earned_at: matches >= 20 ? user?.updated_at : null, xp_reward: 300 }
    ];

    res.json({ achievements });
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
    const userId = req.user.id || req.user._id;
    
    if (language_code) {
      if (models.User && models.User.db.readyState === 1) {
        await models.User.findByIdAndUpdate(userId, { language_code });
      } else {
        const u = memoryStore.users.get(userId);
        if (u) u.language_code = language_code;
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
