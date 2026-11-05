const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ReactionSchema = new mongoose.Schema({
  emoji: { type: String, required: true },
  userId: { type: String, required: true }
}, { _id: false });

const CommentSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  match_id: { type: String, required: true, index: true },
  user_id: { type: String, required: true, index: true },
  username: { type: String, default: null },
  first_name: { type: String, default: null },
  message: { type: String, required: true, maxlength: 500 },
  message_type: { type: String, default: 'text' },
  is_system: { type: Boolean, default: false },
  is_deleted: { type: Boolean, default: false },
  reactions: [ReactionSchema],
  created_at: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

CommentSchema.virtual('id').get(function() {
  return this._id;
});

CommentSchema.index({ match_id: 1, created_at: 1 });

module.exports = mongoose.models.Comment || mongoose.model('Comment', CommentSchema);

