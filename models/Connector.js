const mongoose = require('mongoose');

const connectorSchema = new mongoose.Schema({
  vendorId: String,
  name: { type: String, unique: true},
  kwiLocation: { type: String, required: true },
  active: String,
  activeDate: Date,
  inactiveDate: Date,
  lastActivityDate: Date,
  lastActivityProcessed: String,
  processedTransactionAmount: Number,
  // vendorKeyType: {
  //   apiKey: String,
  //   userName: String,
  //   password: String
  // }

}, { timestamps: true });

const Connector = mongoose.model('Connector', connectorSchema);

module.exports = Connector;
