const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getAdminStats, models, memoryStore, updateMatchDoc } = require('../database/db');

// All admin routes require authentication + admin role
router.use(requireAuth, requireAdmin);

/**
 * GET /api/admin/stats
 * Get platform statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getAdminStats();
    res.json(stats);
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

    if (models.User && models.User.db.readyState === 1) {
      const filter = {};
      if (search) {
        filter.$or = [
          { username: { $regex: search, $options: 'i' } },
          { first_name: { $regex: search, $options: 'i' } }
        ];
      }

      const users = await models.User.find(filter)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .lean();

      res.json({
        users: users.map(u => ({ ...u, id: u._id })),
        page,
        limit
      });
    } else {
      let users = Array.from(memoryStore.users.values());
      if (search) {
        const s = search.toLowerCase();
        users = users.filter(u =>
          (u.username && u.username.toLowerCase().includes(s)) ||
          (u.first_name && u.first_name.toLowerCase().includes(s)) ||
          String(u.telegram_id).includes(s)
        );
      }
      users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const paged = users.slice(offset, offset + limit);
      res.json({ users: paged, page, limit });
    }
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

    if (models.User && models.User.db.readyState === 1) {
      const user = await models.User.findById(req.params.userId);
      if (user?.is_admin) {
        return res.status(400).json({ error: 'Cannot ban an admin' });
      }
      await models.User.findByIdAndUpdate(req.params.userId, {
        is_banned: true,
        ban_reason: reason
      });
    } else {
      const user = memoryStore.users.get(req.params.userId);
      if (user?.is_admin) {
        return res.status(400).json({ error: 'Cannot ban an admin' });
      }
      if (user) {
        user.is_banned = true;
        user.ban_reason = reason;
      }
    }

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
    if (models.User && models.User.db.readyState === 1) {
      await models.User.findByIdAndUpdate(req.params.userId, {
        is_banned: false,
        ban_reason: null
      });
    } else {
      const user = memoryStore.users.get(req.params.userId);
      if (user) {
        user.is_banned = false;
        user.ban_reason = null;
      }
    }

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
    if (models.User && models.User.db.readyState === 1) {
      await models.User.findByIdAndUpdate(req.params.userId, { is_admin: true });
    } else {
      const user = memoryStore.users.get(req.params.userId);
      if (user) user.is_admin = true;
    }
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

    if (models.Report && models.Report.db.readyState === 1) {
      const reports = await models.Report.find({ status })
        .sort({ created_at: -1 })
        .limit(50)
        .lean();
      res.json({ reports: reports.map(r => ({ ...r, id: r._id })) });
    } else {
      const reports = memoryStore.reports.filter(r => r.status === status);
      res.json({ reports });
    }
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
    const { action } = req.body;
    const adminId = req.user.id || req.user._id;

    if (models.Report && models.Report.db.readyState === 1) {
      await models.Report.findByIdAndUpdate(req.params.reportId, {
        status: action || 'resolved',
        resolved_by: adminId,
        resolved_at: new Date()
      });
    } else {
      const rep = memoryStore.reports.find(r => r.id === req.params.reportId || r._id === req.params.reportId);
      if (rep) {
        rep.status = action || 'resolved';
        rep.resolved_by = adminId;
        rep.resolved_at = new Date().toISOString();
      }
    }

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
    const adminId = req.user.id || req.user._id;

    if (models.Comment && models.Comment.db.readyState === 1) {
      await models.Comment.findByIdAndUpdate(req.params.commentId, {
        is_deleted: true,
        deleted_by: adminId
      });
    } else {
      const c = memoryStore.comments.find(x => x.id === req.params.commentId || x._id === req.params.commentId);
      if (c) {
        c.is_deleted = true;
        c.deleted_by = adminId;
      }
    }
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
    await updateMatchDoc(req.params.matchId, {
      status: 'cancelled',
      cancelled_at: new Date()
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Cancel match error:', error);
    res.status(500).json({ error: 'Failed to cancel match' });
  }
});

module.exports = router;
