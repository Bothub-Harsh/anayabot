const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const PlayerSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, default: null },
  first_name: { type: String, default: null },
  color: { type: String, enum: ['red', 'blue', 'green', 'yellow'], required: true },
  position: { type: Number, required: true },
  status: { type: String, default: 'waiting' },
  isReady: { type: Boolean, default: true },
  finished_position: { type: Number, default: null },
  joined_at: { type: Date, default: Date.now },
  left_at: { type: Date, default: null }
}, { _id: false });

const MatchSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  room_code: { type: String, required: true, unique: true, index: true, uppercase: true },
  name: { type: String, default: 'Ludo Match' },
  status: { 
    type: String, 
    enum: ['waiting', 'playing', 'completed', 'cancelled'], 
    default: 'waiting',
    index: true 
  },
  visibility: { 
    type: String, 
    enum: ['public', 'private'], 
    default: 'public',
    index: true 
  },
  max_players: { type: Number, default: 4, min: 2, max: 4 },
  current_players: { type: Number, default: 1 },
  creator_id: { type: String, required: true, index: true },
  creator_username: { type: String, default: null },
  creator_name: { type: String, default: null },
  telegram_group_id: { type: String, default: null, index: true },
  telegram_message_id: { type: String, default: null },
  winner_id: { type: String, default: null },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  players: [PlayerSchema],
  started_at: { type: Date, default: null },
  completed_at: { type: Date, default: null },
  cancelled_at: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

MatchSchema.virtual('id').get(function() {
  return this._id;
});

MatchSchema.index({ status: 1, visibility: 1, created_at: -1 });
MatchSchema.index({ telegram_group_id: 1, status: 1 });

module.exports = mongoose.models.Match || mongoose.model('Match', MatchSchema);
