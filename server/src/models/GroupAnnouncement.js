const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const GroupAnnouncementSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  telegram_group_id: { type: String, required: true, index: true },
  match_id: { type: String, default: null },
  announcement_type: { type: String, required: true },
  telegram_message_id: { type: String, default: null },
  created_at: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

GroupAnnouncementSchema.virtual('id').get(function() {
  return this._id;
});

module.exports = mongoose.models.GroupAnnouncement || mongoose.model('GroupAnnouncement', GroupAnnouncementSchema);
