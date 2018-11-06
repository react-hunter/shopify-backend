const mongoose = require('mongoose');

const connectorSchema = new mongoose.Schema({
  vendorId: String,
  name: { type: String, required: true, unique: false },
  kwiLocation: { type: String, required: true },
  active: String,
  activeDate: Date,
  inactiveDate: Date,
  lastActivityDate: Date,
  lastActivityProcessed: String,
  processedTransactionAmount: Number
  
}, { timestamps: true });

const Connector = mongoose.model('Connector', connectorSchema);

module.exports = Connector;
