const mongoose = require('mongoose')

const orderSchema = new mongoose.Schema({
  vendorId: String,
  orderId: String,
  outgoingOrderNumbers: Array,
  orderPaymentMethod: String,
  transactionId: String,
  shipState: String,
  billState: String
}, { timestamps: true })

const Order = mongoose.model('Order', orderSchema)

module.exports = Order
