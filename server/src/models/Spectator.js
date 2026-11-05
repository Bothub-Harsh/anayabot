const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const SpectatorSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  match_id: { type: String, required: true, index: true },
  user_id: { type: String, required: true, index: true },
  joined_at: { type: Date, default: Date.now },
  left_at: { type: Date, default: null }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

SpectatorSchema.virtual('id').get(function() {
  return this._id;
});

SpectatorSchema.index({ match_id: 1, user_id: 1 });

module.exports = mongoose.models.Spectator || mongoose.model('Spectator', SpectatorSchema);

