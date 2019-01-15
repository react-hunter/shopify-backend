const Shopify = require('shopify-api-node')
const fs = require('fs')
const Client = require('ssh2-sftp-client')
const delay = require('delay')
const TSV = require('tsv')

const Vendor = require('../../models/Vendor')
const Connector = require('../../models/Connector')
const History = require('../../models/History')
const Status = require('../../models/Status')

/**
 * GET /
 * Refund page.
 */
exports.index = async (req, res, next) => {

    res.render('feeds/refund', {
        title: 'refund'
    })
    var vendorInfo, connectorInfo
    Connector.find({
        vendorId: req.user.vendorId,
        kwiLocation: 'refund',
        active: 'yes'
    }, (err, connectors) => {
        if (err) {
            return next(err)
        }
        if (connectors.length == 0) {
            req.flash('errors', {
                msg: 'Your vendor does not include refund connector or it is inactive. Please contact with Administrator or Admin User.'
            })
            res.redirect('/')
            return next()
        }
        connectorInfo = connectors[0]
    })
    Vendor.findOne({
        _id: req.user.vendorId,
        active: 'yes'
    }, (vendorError, vendor) => {
        if (vendorError) {
            return next(vendorError)
        }
        vendorInfo = vendor
        shopify = new Shopify({
            shopName: vendorInfo.api.apiShop,
            apiKey: vendorInfo.api.apiKey,
            password: vendorInfo.api.apiPassword,
            timeout: 50000,
            autoLimit: {
                calls: 2,
                interval: 1000,
                bucketSize: 35
            }
        })
        
        const sftp = new Client()

        sftp.connect({
            host: vendorInfo.sftp.sftpHost,
            port: process.env.SFTP_PORT,
            username: vendorInfo.sftp.sftpUsername,
            password: vendorInfo.sftp.sftpPassword
        }).then(() => {
            return sftp.list('/outgoing/returns')
        }).then(sftpFileList => {
            let fileList = []
            sftpFileList.forEach(sftpFile => {
                if (sftpFile.type == '-') {
                    fileList.push(sftpFile.name)
                }
            })
            fileList.forEach(fileName => {
                sftp.get('/outgoing/returns/' + fileName).then(fileData => {
                    var refundPost = {}, refundCalculate = {}
                    refundPost.refund_line_items = [], refundCalculate.refund_line_items = []
                    var dataFromSFTP = TSV.parse(fileData._readableState.buffer.head.data)
                    var refundData = dataFromSFTPRow[1]

                    // Calculate refund
                    refundCalculate.currency = 'USD'
                    refundCalculate.shipping = {
                        full_refund: true
                    }
                    dataFromSFTP.forEach(dataFromSFTPRow => {
                        if (dataFromSFTPRow.original_order_number != '') {
                            refundCalculate.refund_line_items.push({
                                // line_item_id: ,
                                quantity: dataFromSFTPRow['qty_requested'],
                                restock_type: 'return'
                            })
                        }
                    })
                    shopify.refund.calculate(refundData['original_order_number'], refundCalculate).then(calculateResponse => {
                        // Create refund
                        refundPost.currency = 'USD'
                        refundPost.notify = true
                        refundPost.shipping = {
                            full_refund: true
                        }
    
                        dataFromSFTP.forEach(dataFromSFTPRow => {
                            if (dataFromSFTPRow.original_order_number != '') {
                                refundPost.refund_line_items.push({
                                    // line_item_id: ,
                                    restock_type: 'return',
                                    // location_id: ,
                                    quantity: dataFromSFTPRow['qty_requested']
                                })
                            }
                        })
                        
                        console.log('refund data: ', refundPost)
                    }).catch(calculateError => {
                        console.log('Error in calculating refund: ', calculateError)
                    })
                }).then(sftpError => {
                    console.log('Error in getting refund data from sftp: ', sftpError)
                })
            })
        })
    })
}

const deleteAndInitialize = function (filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) throw err
            console.log(filePath + ' file has been deleted')
            fs.writeFile(filePath, '', function (initErr) {
                if (initErr) {
                    console.log(initErr)
                }
                console.log('Made return file and initialized with empty')
            })
        })
    }
}

const addStatus = (vendor, connector, statusFlag, callback) => {
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
                    addHistory(vendor, connector, statusFlag, (historyErr) => {
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
                    addHistory(vendor, connector, statusFlag, (historyErr) => {
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
}

const addHistory = (vendor, connector, flag, callback) => {
    var history = new History()
    history.vendorId = vendor._id
    history.vendorName = vendor.api.apiShop
    history.connectorId = connector._id
    history.connectorType = connector.kwiLocation
    history.status = flag

    history.save().then(() => {
        callback(null)
    }).catch(err => {
        callback(err)
    })
}