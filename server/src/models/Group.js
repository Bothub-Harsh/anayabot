const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const GroupSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  telegram_id: { type: Number, required: true, unique: true, index: true },
  title: { type: String, default: '' },
  type: { type: String, default: 'group' },
  settings: {
    allowGameCreation: { type: Boolean, default: true },
    maxPlayers: { type: Number, default: 4 },
    announcements: { type: Boolean, default: true },
    allowSpectators: { type: Boolean, default: true }
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

GroupSchema.virtual('id').get(function() {
  return this._id;
});

module.exports = mongoose.models.Group || mongoose.model('Group', GroupSchema);

