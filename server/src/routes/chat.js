const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { query } = require('../database/db');

/**
 * GET /api/chat/:matchId/messages
 * Get chat messages for a match
 */
router.get('/:matchId/messages', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before; // cursor-based pagination

    let queryText = `
      SELECT c.id, c.match_id, c.message, c.message_type, c.is_system,
             c.is_deleted, c.created_at,
             u.id as user_id, u.username, u.first_name,
             json_agg(json_build_object('emoji', r.emoji, 'userId', r.user_id)) 
               FILTER (WHERE r.id IS NOT NULL) as reactions
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN reactions r ON c.id = r.comment_id
      WHERE c.match_id = $1 AND c.is_deleted = FALSE
    `;
    
    const params = [req.params.matchId];
    
    if (before) {
      queryText += ` AND c.created_at < (SELECT created_at FROM comments WHERE id = $${params.length + 1})`;
      params.push(before);
    }
    
    queryText += ` GROUP BY c.id, u.id ORDER BY c.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(queryText, params);

    // Return in ascending order for display
    res.json({ messages: result.rows.reverse() });
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

    const result = await query(
      `INSERT INTO comments (match_id, user_id, message, message_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.matchId, req.user.id, message.trim(), messageType]
    );

    res.status(201).json({ message: result.rows[0] });
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
    const result = await query(
      `UPDATE comments SET is_deleted = TRUE, deleted_by = $2
       WHERE id = $1 AND (user_id = $2 OR $3 = TRUE)
       RETURNING id`,
      [req.params.messageId, req.user.id, req.user.is_admin]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Cannot delete this message' });
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

    // Get comment info
    const commentResult = await query(
      'SELECT user_id, match_id FROM comments WHERE id = $1',
      [req.params.messageId]
    );

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const comment = commentResult.rows[0];

    await query(
      `INSERT INTO reports (reporter_id, reported_user_id, comment_id, match_id, reason, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, comment.user_id, req.params.messageId, comment.match_id, reason, description || null]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Report message error:', error);
    res.status(500).json({ error: 'Failed to report message' });
  }
});

module.exports = router;
