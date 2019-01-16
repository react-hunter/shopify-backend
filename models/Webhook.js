const mongoose = require('mongoose')

const webhookSchema = new mongoose.Schema({
  vendorId: String,
  connector: String,
  requestId: String
}, { timestamps: true })

const Webhook = mongoose.model('Webhook', webhookSchema)

module.exports = Webhook
