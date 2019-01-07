const mongoose = require('mongoose')

const orderSchema = new mongoose.Schema({
  vendorId: String,
  orderId: String
}, { timestamps: true })

const Order = mongoose.model('Order', orderSchema)

module.exports = Order
