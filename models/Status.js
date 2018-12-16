const mongoose = require('mongoose');

const statusSchema = new mongoose.Schema({
  vendorId: String,
  vendorName: String,
  connectorId: String,
  connectorType: String,
  counter: Number,
  status: Number    // 0: failed, 1: pending, 2: success
}, { timestamps: true });

/**
 * Password hash middleware.
 */

const Status = mongoose.model('Status', statusSchema);

module.exports = Status;
