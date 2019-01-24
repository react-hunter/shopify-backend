const Shopify = require('shopify-api-node')
const fs = require('fs')
const Client = require('ssh2-sftp-client')
const delay = require('delay')
const TSV = require('tsv')

const Vendor = require('../../models/Vendor')
const Connector = require('../../models/Connector')

const commonHelper = require('../../helpers/common')

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
            // req.flash('errors', {
            //     msg: 'Your vendor does not include refund connector or it is inactive. Please contact with Administrator or Admin User.'
            // })
            // res.redirect('/')
            // return next()
            callback('Your vendor does not include refund connector or it is inactive. Please contact with Administrator or Admin User.')
        }
        connectorInfo = connectors[0]
    })
    Vendor.findOne({
        _id: req.user.vendorId,
        active: 'yes'
    }, (vendorError, vendor) => {
        if (vendorError) {
            // return next(vendorError)
            callback(vendorError)
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
                    var refundData = dataFromSFTP[1], orderNumber = refundData['retailer_order_number'].split(' | ')[1]

                    // Calculate refund
                    refundCalculate.currency = 'USD'
                    refundCalculate.shipping = {
                        full_refund: true
                    }
                    dataFromSFTP.forEach(dataFromSFTPRow => {
                        if (dataFromSFTPRow.original_order_number != '') {
                            refundCalculate.refund_line_items.push({
                                line_item_id: dataFromSFTPRow['retailer_order_number'].split(' | ')[2],
                                quantity: dataFromSFTPRow['qty_requested'],
                                restock_type: 'return'
                            })
                        }
                    })
                    shopify.refund.calculate(orderNumber, refundCalculate).then(calculateResponse => {
                        console.log('calculate refund response: ', calculateResponse)
                        // Create refund
                        refundPost.currency = 'USD'
                        refundPost.notify = true
                        refundPost.shipping = {
                            full_refund: true
                        }
    
                        calculateResponse.refund_line_items.forEach(calRow => {
                            refundPost.refund_line_items.push({
                                line_item_id: calRow['line_item_id'],
                                restock_type: 'return',
                                location_id: calRow['location_id'],
                                quantity: calRow['quantity']
                            })
                        })

                        refundPost.transactions = calculateResponse.transactions

                        shopify.refund.create(orderNumber, refundPost).then(createResponse => {
                            console.log('create response: ', createResponse)
                        })
                        
                    }).catch(calculateError => {
                        console.log('Error in calculating refund: ', calculateError)
                        commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                            if (statusErr) {
                                // req.flash('errors', {
                                //     msg: 'calculate and db'
                                // })
                                callback('calculate and db')
                            } else {
                                // req.flash('errors', {
                                //     msg: 'Calculating refund: ' + calculateError
                                // })
                                callback('Calculating refund: ' + calculateError)
                            }
                            // res.redirect('/')
                        })
                    })
                }).catch(sftpError => {
                    commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                        if (statusErr) {
                            // req.flash('errors', {
                            //     msg: 'connect and db'
                            // })
                            callback('connect and db')
                        } else {
                            // req.flash('errors', {
                            //     msg: 'Getting file - /incoming/returns/' + fileName
                            // })
                            callback('Getting file - /incoming/returns/' + fileName)
                        }
                        // res.redirect('/')
                    })
                })
            })
        }).catch(sftpError => {
            commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                if (statusErr) {
                    // req.flash('errors', {
                    //     msg: 'connect and db'
                    // })
                    callback('connect and db')
                } else {
                    // req.flash('errors', {
                    //     msg: 'connect in connecting to sftp for ' + vendorInfo.api.apiShop
                    // })
                    callback('connect in connecting to sftp for ' + vendorInfo.api.apiShop)
                }
                // res.redirect('/')
            })
        })
    })
}
