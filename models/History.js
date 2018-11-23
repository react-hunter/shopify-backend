const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  vendorId: String,
  vendorName: String,
  connectorId: String,
  connectorName: String,
  
  hasTransaction: Boolean,
  activeDate: Date
}, { timestamps: true });

/**
 * Password hash middleware.
 */

const History = mongoose.model('History', historySchema);

module.exports = History;
