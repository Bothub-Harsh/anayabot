const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { query } = require('../database/db');

// All admin routes require authentication + admin role
router.use(requireAuth, requireAdmin);

/**
 * GET /api/admin/stats
 * Get platform statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const [users, matches, activeMatches, reports] = await Promise.all([
      query('SELECT COUNT(*) FROM users WHERE is_banned = FALSE'),
      query('SELECT COUNT(*) FROM matches'),
      query("SELECT COUNT(*) FROM matches WHERE status IN ('waiting', 'playing')"),
      query("SELECT COUNT(*) FROM reports WHERE status = 'pending'")
    ]);

    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalMatches: parseInt(matches.rows[0].count),
      activeMatches: parseInt(activeMatches.rows[0].count),
      pendingReports: parseInt(reports.rows[0].count)
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/admin/users
 * Get users list with admin info
 */
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const searchFilter = search
      ? `AND (u.username ILIKE $3 OR u.first_name ILIKE $3 OR u.telegram_id::text LIKE $3)`
      : '';

    const params = search
      ? [limit, offset, `%${search}%`]
      : [limit, offset];

    const result = await query(
      `SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name,
              u.is_admin, u.is_banned, u.ban_reason, u.created_at, u.last_seen_at,
              pp.total_matches, pp.wins
       FROM users u
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       WHERE 1=1 ${searchFilter}
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    res.json({ users: result.rows, page, limit });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * POST /api/admin/users/:userId/ban
 * Ban a user
 */
router.post('/users/:userId/ban', async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Ban reason is required' });
    }

    // Cannot ban admins
    const userResult = await query('SELECT is_admin FROM users WHERE id = $1', [req.params.userId]);
    if (userResult.rows[0]?.is_admin) {
      return res.status(400).json({ error: 'Cannot ban an admin' });
    }

    await query(
      'UPDATE users SET is_banned = TRUE, ban_reason = $2 WHERE id = $1',
      [req.params.userId, reason]
    );

    res.json({ success: true, message: 'User banned successfully' });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

/**
 * POST /api/admin/users/:userId/unban
 * Unban a user
 */
router.post('/users/:userId/unban', async (req, res) => {
  try {
    await query(
      'UPDATE users SET is_banned = FALSE, ban_reason = NULL WHERE id = $1',
      [req.params.userId]
    );

    res.json({ success: true, message: 'User unbanned successfully' });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

/**
 * POST /api/admin/users/:userId/make-admin
 * Grant admin role
 */
router.post('/users/:userId/make-admin', async (req, res) => {
  try {
    await query(
      'UPDATE users SET is_admin = TRUE WHERE id = $1',
      [req.params.userId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Make admin error:', error);
    res.status(500).json({ error: 'Failed to grant admin role' });
  }
});

/**
 * GET /api/admin/reports
 * Get pending reports
 */
router.get('/reports', async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const result = await query(
      `SELECT r.*, 
              reporter.username as reporter_username, reporter.first_name as reporter_name,
              reported.username as reported_username, reported.first_name as reported_name
       FROM reports r
       JOIN users reporter ON r.reporter_id = reporter.id
       JOIN users reported ON r.reported_user_id = reported.id
       WHERE r.status = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [status]
    );

    res.json({ reports: result.rows });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

/**
 * POST /api/admin/reports/:reportId/resolve
 * Resolve a report
 */
router.post('/reports/:reportId/resolve', async (req, res) => {
  try {
    const { action } = req.body; // 'dismiss' or 'action_taken'

    await query(
      `UPDATE reports SET status = $2, resolved_by = $3, resolved_at = NOW()
       WHERE id = $1`,
      [req.params.reportId, action || 'resolved', req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({ error: 'Failed to resolve report' });
  }
});

/**
 * DELETE /api/admin/comments/:commentId
 * Delete a comment (admin moderation)
 */
router.delete('/comments/:commentId', async (req, res) => {
  try {
    await query(
      'UPDATE comments SET is_deleted = TRUE, deleted_by = $2 WHERE id = $1',
      [req.params.commentId, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

/**
 * POST /api/admin/matches/:matchId/cancel
 * Force cancel a match
 */
router.post('/matches/:matchId/cancel', async (req, res) => {
  try {
    await query(
      `UPDATE matches SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1 AND status NOT IN ('completed', 'cancelled')`,
      [req.params.matchId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Cancel match error:', error);
    res.status(500).json({ error: 'Failed to cancel match' });
  }
});

module.exports = router;
