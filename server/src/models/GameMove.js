const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const GameMoveSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  match_id: { type: String, required: true, index: true },
  user_id: { type: String, required: true, index: true },
  username: { type: String, default: null },
  first_name: { type: String, default: null },
  turn_number: { type: Number, required: true },
  type: { type: String, required: true },
  dice_value: { type: Number, default: null },
  token_id: { type: Number, default: null },
  from_position: { type: Number, default: null },
  to_position: { type: Number, default: null },
  captured: { type: mongoose.Schema.Types.Mixed, default: null },
  created_at: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

GameMoveSchema.virtual('id').get(function() {
  return this._id;
});

GameMoveSchema.index({ match_id: 1, created_at: 1 });

module.exports = mongoose.models.GameMove || mongoose.model('GameMove', GameMoveSchema);

