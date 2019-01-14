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
        _id: req.user.vendorId
    }, (vendorError, vendor) => {
        if (vendorError) {
            return next(vendorError)
        }
        vendorInfo = vendor
        returnFileName = 'uploads/return-' + vendor.api.apiShop + '.txt'

        if (vendorInfo.api.apiShop == '' || vendorInfo.api.apiKey == '' || vendorInfo.api.apiPassword == '') {
            req.flash('errors', {
                msg: 'You should have API information to manage product feed. Please contact with Administrator.'
            })
            errorExist = true
            res.redirect('/')
            return next()
        }
        if (vendorInfo.sftp.sftpHost == '' || vendorInfo.sftp.sftpPassword == '' || vendorInfo.sftp.sftpUsername == '') {
            req.flash('errors', {
                msg: 'You should have SFTP information to manage product feed. Please contact with Administrator.'
            })
            errorExist = true
            res.redirect('/')
            return next()
        }
        if (vendorInfo.active == 'yes') {
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
        }
        // Check vendor availability. If vendor's status is inactive, it should redirect to homepage without any action.
        if (vendorInfo.active == 'no') {
            req.flash('errors', {
                msg: 'Your vendor should be active to manage feed. Please contact with Administrator.'
            })
            errorExist = true
            res.redirect('/')
            return next()
        }

        // Check refund connector
        Connector.find({
            vendorId: vendorInfo._id,
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
                errorExist = true
                res.redirect('/')
                return next()
            }
            connectorInfo = connectors[0]
        })
    })

    const sftp = new Client()
    var refundDataList = new Array()

    deleteAndInitialize(returnFileName)

    if (req.user.active !== 'yes') {
        req.flash('errors', {
            msg: 'Your account is inactive now. Please contact with Administrator.'
        })
        errorExist = true
        res.redirect('/')
        return next()
    }
    await delay(2000)
    if (!errorExist) {
        shopify.order.list()
        .then(orders => {
            orders.forEach(order => {
                shopify.refund.list(order.id)
                .then(refunds => {
                    refunds.forEach(refund => {
                        if (refund.refund_line_items.length > 0) {
                            refund.refund_line_items.forEach(refundItem => {
                                var refundData = {}
                                refundData.original_order_number = refund.order_id
                                // refundData.rma_number = 
                                refundData.item_sku = refundItem.sku
                                refundData.date_requested = refund.created_at
                                refundData.qty_requested = refundItem.quantity
                                refundData.date_received = refund.processed_at
                                // refundData.qty_received = 
                                refundData.reason = refund.order_adjustments[0].reason
                                refundData.retailer_order_number = order.number
                                // refundData.retailer_rma_number = 
                                refundData.item_status = refundItem.line_item.fulfillment_status

                                refundDataList.push(refundData)
                            })
                        }
                    })
                })
                .catch(err => {
                    console.log(err)
                });
            });
        })
        .then(() => {
            sftp.connect({
                host: vendorInfo.sftp.sftpHost,
                port: process.env.SFTP_PORT,
                username: vendorInfo.sftp.sftpUsername,
                password: vendorInfo.sftp.sftpPassword
            })
            .then(() => {
                fs.writeFile(returnFileName, TSV.stringify(refundDataList), function (err) {
                    if (err) {
                        console.log(err)
                    } else {
                        var currentDate = new Date()
                        var splittedISODateByDot = currentDate.toLocaleString("en-US", {hour12: false}).split('.')
                        var remotePath = '/incoming/returns/return' + splittedISODateByDot[0].replace(' ', '').replace(',', '').replace(/\-/g, '').replace(/\//g, '').replace(/\:/g, '') + '.txt'
                        sftp.put(returnFileName, remotePath)
                        .then(response => {
                            addStatus(vendorInfo, connectorInfo, 2, (statusErr) => {
                                if (statusErr) {
                                    return next(statusErr)
                                } else {
                                    res.render('feeds/refund', {
                                        title: 'Refund',
                                        refundList: refundDataList
                                    })
                                }
                            })
                            
                            sftp.end()
                        })
                        .catch(error => {
                            addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                                if (statusErr) {
                                    return next(statusErr)
                                } else {
                                    console.log('upload error: ', error)
                                }
                            })
                        })
                    }
                })
            })
        })
        .catch(err => {
            addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                if (statusErr) {
                    return next(statusErr)
                } else {
                    console.log('Getting refund data Error: ', err)
                }
            })
        })
    }
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