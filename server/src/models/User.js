const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const UserSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  telegram_id: { type: Number, required: true, unique: true, index: true },
  username: { type: String, default: null, trim: true },
  first_name: { type: String, required: true },
  last_name: { type: String, default: null },
  photo_url: { type: String, default: null },
  language_code: { type: String, default: 'en' },
  is_admin: { type: Boolean, default: false },
  is_banned: { type: Boolean, default: false },
  ban_reason: { type: String, default: null },
  total_matches: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  win_streak: { type: Number, default: 0 },
  best_win_streak: { type: Number, default: 0 },
  total_xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  last_seen_at: { type: Date, default: Date.now }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

UserSchema.virtual('id').get(function() {
  return this._id;
});

UserSchema.index({ wins: -1, total_xp: -1 });
UserSchema.index({ is_banned: 1 });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
