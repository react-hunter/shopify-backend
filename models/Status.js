const mongoose = require('mongoose')

const statusSchema = new mongoose.Schema({
  vendorId: String,
  vendorName: String,
  connectorId: String,
  connectorType: String,
  success: Number,
  pending: Number,
  error: Number
}, { timestamps: true })

/**
 * Password hash middleware.
 */

const Status = mongoose.model('Status', statusSchema)

module.exports = Status
