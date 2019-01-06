const mongoose = require('mongoose')

const historySchema = new mongoose.Schema({
  vendorId: String,
  vendorName: String,
  connectorId: String,
  connectorType: String,
  status: Number    // 0: failed, 1: pending, 2: success
}, { timestamps: true })

/**
 * Password hash middleware.
 */

const History = mongoose.model('History', historySchema)

module.exports = History
