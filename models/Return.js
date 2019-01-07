const mongoose = require('mongoose')

const returnSchema = new mongoose.Schema({
  vendorId: String,
  returnId: String
}, { timestamps: true })

const Return = mongoose.model('Return', returnSchema)

module.exports = Return
