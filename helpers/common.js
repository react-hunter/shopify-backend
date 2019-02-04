const History = require('../models/History')
const Status = require('../models/Status')
const fs = require('fs')
const Color = require('../models/Color')

var colorList = []
Color.findOne({}, (colorError, color) => {
    if (colorError) {
        return next(colorError)
    } else {
        colorList = color.colorList
    }
})
module.exports = {
    getVariantImage: (images, imageId) => {
        var imageUrl = ''
        images.forEach(image => {
            if (image.id == imageId) {
                imageUrl = image.src
            }
        })
    
        return imageUrl
    },

    jsUcfirst: (string) => {
        return string.charAt(0).toUpperCase() + string.slice(1)
    },

    getShortenColorName: (str) => {
        var returnColor = ''
        colorList.forEach(colorItem => {
            if (colorItem.colorName == str.toLowerCase()) {
                returnColor = colorItem.shortName
            }
        })
        return returnColor
    },
    
    deleteAndInitialize: (filePath) => {
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) throw err
                console.log(filePath + ' file has been deleted')
                fs.writeFile(filePath, '', function (initErr) {
                    if (initErr) {
                        console.log(initErr)
                    }
                    console.log('Made new file and initialized with empty')
                })
            })
        }
    },
    
    addStatus: (vendor, connector, statusFlag, callback) => {
        Status.find({
            vendorId: vendor._id,
            connectorId: connector._id
        }, (err, statuses) => {
            if (err) {
                callback(err)
            } else {
                if (statuses.length == 0) {
                    var status = new Status()
                    status.vendorId = vendor._id
                    status.vendorName = vendor.api.apiShop
                    status.connectorId = connector._id
                    status.connectorType = connector.kwiLocation
                    status.success = 0
                    status.pending = 0
                    status.error = 0
                    switch (statusFlag) {
                        case 0:
                            status.error = 1
                            break
                        case 1:
                            status.pending = 1
                            break
                        default:
                            status.success = 1
                    }
                    status.save().then(() => {
                        module.exports.addHistory(vendor, connector, statusFlag, (historyErr) => {
                            if (historyErr) {
                                callback(historyErr)
                            } else {
                                callback(null)
                            }
                        })
                    })
                } else {
                    var status = statuses[0]
                    let statusQuery = ''
                    switch (statusFlag) {
                        case 0:
                            statusQuery = {error: 1}
                            break
                        case 1:
                            statusQuery = {pending: 1}
                            break
                        default:
                            statusQuery = {success: 1}
                    }
                    status.updateOne({ $inc: statusQuery},() => {
                        module.exports.addHistory(vendor, connector, statusFlag, (historyErr) => {
                            if (historyErr) {
                                callback(historyErr)
                            } else {
                                callback(null)
                            }
                        })
                    })
                }
            }
        })
    },
    
    addHistory: (vendor, connector, statusFlag, callback) => {
        var history = new History()
        history.vendorId = vendor._id
        history.vendorName = vendor.api.apiShop
        history.connectorId = connector._id
        history.connectorType = connector.kwiLocation
        history.status = statusFlag
    
        history.save().then(() => {
            callback(null)
        }).catch(err => {
            callback(err)
        })
    },

    writeProductFile: (data, isFirst, callback) => {
        if (isFirst == 1) {
            fs.appendFile("uploads/product-original-hedge.txt", data, function (err) {
                if (err) {
                    callback(err)
                }
            })
            callback(null, 'success')
        } else {
            fs.appendFile("uploads/product-original.txt", ', ' + data, function (err) {
                if (err) {
                    callback(err)
                }
            })
            callback(null, 'success')
        }
    },

    daysBetween: (publishDate) => {
        var one_day = 1000 * 60 * 60 * 24
        var publishDateTime = new Date(publishDate)
        var date_ms1 = publishDateTime.getTime()
        var currentDateTime = new Date()
        var date_ms2 = currentDateTime.getTime()
    
        var difference_ms = date_ms2 - date_ms1
    
        return Math.round(difference_ms / one_day)
    },

    downloadImage: (uri, filename, callback) => {
        request.head(uri, (err, res, body) => {
            request(uri).pipe(fs.createWriteStream(filename)).on('close', callback)
        })
    },

    deleteImageList: (fileList, callback) => {
        if (fileList.length > 0) {
            fileList.forEach(file => {
                if (fs.existsSync(file[1])) {
                    fs.unlink(file[1], (err) => {
                        if (err) throw err
                    })
                }
            })
        }
        callback(null)
    },

    deleteFiles: (sftpObj, filePathList, callback) => {
        if (filePathList.length > 0) {
            filePathList.forEach(filePath => {
                sftpObj.delete('/outgoing/orders/' + filePath).then(result => {
                    console.log('App deleted ' + filePath)
                }).catch(deleteError => {
                    callback(deleteError)
                })
            })
            callback(null)
        }
    },

    dateStringForName: () => {
        var currentDate = new Date()
        var isoDate = currentDate.toLocaleString("en-US", {
            hour12: false
        }).split(', ')
        var month = isoDate[0].split('/')[0]
        var day = isoDate[0].split('/')[1]
        var year = isoDate[0].split('/')[2]
        if (month < 10) {
            month = '0' + month
        }
        if (day < 10) {
            day = '0' + day
        }
        
        return year + month + day + isoDate[1].replace(/\:/g, '')
    },

    dateStringFromString: (dateString) => {
        var dateFromString = new Date(dateString)
        var isoDate = dateFromString.toLocaleString("en-US", {
            hour12: false
        }).split(', ')
        var month = isoDate[0].split('/')[0]
        var day = isoDate[0].split('/')[1]
        var year = isoDate[0].split('/')[2]
        if (month < 10) {
            month = '0' + month
        }
        if (day < 10) {
            day = '0' + day
        }
        
        return month + '/' + day + '/' + year
    }

}