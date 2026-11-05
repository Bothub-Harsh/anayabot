const mongoose = require('mongoose');

const GameStateSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // matchId
  match_id: { type: String, required: true, unique: true, index: true },
  current_player_index: { type: Number, default: 0 },
  turn_number: { type: Number, default: 1 },
  phase: { type: String, default: 'playing' },
  board_state: { type: mongoose.Schema.Types.Mixed, required: true },
  dice_value: { type: Number, default: null },
  dice_rolled: { type: Boolean, default: false },
  consecutive_sixes: { type: Number, default: 0 },
  last_action: { type: mongoose.Schema.Types.Mixed, default: null },
  winners: { type: Array, default: [] }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

GameStateSchema.virtual('id').get(function() {
  return this._id;
});

module.exports = mongoose.models.GameState || mongoose.model('GameState', GameStateSchema);
