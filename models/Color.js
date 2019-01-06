const mongoose = require('mongoose')

const colorSchema = new mongoose.Schema({
    colorList: Array
})

const Color = mongoose.model('Color', colorSchema)

module.exports = Color