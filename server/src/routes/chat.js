const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { addComment, findComments, models, memoryStore } = require('../database/db');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /api/chat/:matchId/messages
 * Get chat messages for a match
 */
router.get('/:matchId/messages', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before || null;

    const messages = await findComments(req.params.matchId, { limit, before });
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * POST /api/chat/:matchId/messages
 * Post a message (REST fallback when socket unavailable)
 */
router.post('/:matchId/messages', requireAuth, async (req, res) => {
  try {
    const { message, messageType = 'text' } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    if (message.length > 500) {
      return res.status(400).json({ error: 'Message too long (max 500 chars)' });
    }

    const userId = req.user.id || req.user._id;
    const comment = await addComment({
      match_id: req.params.matchId,
      user_id: userId,
      username: req.user.username || req.user.first_name || 'Player',
      first_name: req.user.first_name || 'Player',
      message: message.trim(),
      message_type: messageType
    });

    res.status(201).json({ message: comment });
  } catch (error) {
    console.error('Post message error:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
});

/**
 * DELETE /api/chat/messages/:messageId
 * Delete own message
 */
router.delete('/messages/:messageId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const isAdmin = !!req.user.is_admin;
    const messageId = req.params.messageId;

    if (models.Comment && models.Comment.db.readyState === 1) {
      const comment = await models.Comment.findById(messageId);
      if (!comment) {
        return res.status(404).json({ error: 'Message not found' });
      }
      if (comment.user_id !== userId && !isAdmin) {
        return res.status(403).json({ error: 'Cannot delete this message' });
      }
      comment.is_deleted = true;
      comment.deleted_by = userId;
      await comment.save();
    } else {
      const c = memoryStore.comments.find(x => x.id === messageId || x._id === messageId);
      if (!c) {
        return res.status(404).json({ error: 'Message not found' });
      }
      if (c.user_id !== userId && !isAdmin) {
        return res.status(403).json({ error: 'Cannot delete this message' });
      }
      c.is_deleted = true;
      c.deleted_by = userId;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

/**
 * POST /api/chat/messages/:messageId/report
 * Report a message
 */
router.post('/messages/:messageId/report', requireAuth, async (req, res) => {
  try {
    const { reason, description } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const userId = req.user.id || req.user._id;
    const messageId = req.params.messageId;

    let reportedUserId = null;
    let matchId = null;

    if (models.Comment && models.Comment.db.readyState === 1) {
      const comment = await models.Comment.findById(messageId);
      if (!comment) return res.status(404).json({ error: 'Message not found' });
      reportedUserId = comment.user_id;
      matchId = comment.match_id;

      await models.Report.create({
        _id: uuidv4(),
        reporter_id: userId,
        reported_user_id: reportedUserId,
        comment_id: messageId,
        match_id: matchId,
        reason,
        description: description || null
      });
    } else {
      const c = memoryStore.comments.find(x => x.id === messageId || x._id === messageId);
      if (!c) return res.status(404).json({ error: 'Message not found' });
      reportedUserId = c.user_id;
      matchId = c.match_id;

      memoryStore.reports.push({
        _id: uuidv4(),
        reporter_id: userId,
        reported_user_id: reportedUserId,
        comment_id: messageId,
        match_id: matchId,
        reason,
        description: description || null,
        status: 'pending',
        created_at: new Date().toISOString()
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Report message error:', error);
    res.status(500).json({ error: 'Failed to report message' });
  }
});

module.exports = router;
