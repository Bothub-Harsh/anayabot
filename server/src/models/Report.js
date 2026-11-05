const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ReportSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  reporter_id: { type: String, required: true },
  reported_user_id: { type: String, default: null },
  comment_id: { type: String, default: null },
  match_id: { type: String, default: null },
  reason: { type: String, required: true },
  description: { type: String, default: null },
  status: { type: String, default: 'pending', index: true },
  resolved_by: { type: String, default: null },
  resolved_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

ReportSchema.virtual('id').get(function() {
  return this._id;
});

module.exports = mongoose.models.Report || mongoose.model('Report', ReportSchema);
