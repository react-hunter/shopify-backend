const Shopify = require('shopify-api-node')
const fs = require('fs')
const Client = require('ssh2-sftp-client')
const delay = require('delay')
const TSV = require('tsv')

const Vendor = require('../../models/Vendor')
const Connector = require('../../models/Connector')

const callback = (err, res) => {
    if (err) {
        console.log('Error: ', err)
    } else {
        console.log('success: ', res)
    }
}
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
                                // line_item_id: dataFromSFTPRow['line_item_id'],
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
    
                        dataFromSFTP.forEach((dataFromSFTPRow, index) => {
                            if (dataFromSFTPRow.original_order_number != '') {
                                refundPost.refund_line_items.push({
                                    // line_item_id: dataFromSFTPRow['line_item_id'],
                                    restock_type: 'return',
                                    // location_id: dataFromSFTPRow['refund_line_items'][index]['location_id'],
                                    quantity: dataFromSFTPRow['qty_requested']
                                })
                            }
                        })

                        refundPost.transactions = calculateResponse.transactions
                        
                        console.log('refund data: ', refundPost)
                    }).catch(calculateError => {
                        console.log('Error in calculating refund: ', calculateError)
                        commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                            if (statusErr) {
                                req.flash('errors', {
                                    msg: 'calculate and db'
                                })
                            } else {
                                req.flash('errors', {
                                    msg: 'Calculating refund: ' + calculateError
                                })
                            }
                            res.redirect('/')
                        })
                    })
                }).catch(sftpError => {
                    commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                        if (statusErr) {
                            req.flash('errors', {
                                msg: 'connect and db'
                            })
                        } else {
                            req.flash('errors', {
                                msg: 'Getting file - /incoming/returns/' + fileName
                            })
                        }
                        res.redirect('/')
                    })
                })
            })
        }).catch(sftpError => {
            commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                if (statusErr) {
                    req.flash('errors', {
                        msg: 'connect and db'
                    })
                } else {
                    req.flash('errors', {
                        msg: 'connect in connecting to sftp for ' + vendorInfo.api.apiShop
                    })
                }
                res.redirect('/')
            })
        })
    })
}
