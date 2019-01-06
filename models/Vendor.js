const mongoose = require('mongoose')

const vendorSchema = new mongoose.Schema({
  name: String,
  brandName: String,
  shipMethod: String,
  active: String,
  colorSynched: String,
  hasTransaction: Boolean,
  api: {
    apiShop: String,
    apiKey: String,
    apiPassword: String,
    sharedSecret: String,
  },
  sftp: {
    sftpHost: String,
    sftpUsername: String,
    sftpPassword: String
  },
  activeDate: Date
}, { timestamps: true })

/**
 * Password hash middleware.
 */

const Vendor = mongoose.model('Vendor', vendorSchema)

module.exports = Vendor
