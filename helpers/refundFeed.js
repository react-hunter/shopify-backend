const commonHelper = require('./common')
const Shopify = require('shopify-api-node')
const fs = require('fs')
const Client = require('ssh2-sftp-client')
const delay = require('delay')
const TSV = require('tsv')

module.exports = {
    refundFeedInCreate: async (vendorInfo, connectorInfo, callback) => {
        const returnFileName = 'uploads/return-' + vendor.api.apiShop + '.txt'
        const sftp = new Client()
        const shopify = new Shopify({
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
        
        var refundDataList = new Array()
        
        commonHelper.deleteAndInitialize(returnFileName)

        await delay(2000)
        
        shopify.order.list().then(orders => {
            orders.forEach(order => {
                shopify.refund.list(order.id).then(refunds => {
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
                }).catch(err => console.log(err))
            })
        }).then(() => {
            sftp.connect({
                host: vendorInfo.sftp.sftpHost,
                port: process.env.SFTP_PORT,
                username: vendorInfo.sftp.sftpUsername,
                password: vendorInfo.sftp.sftpPassword
            }).then(() => {
                fs.writeFile(returnFileName, TSV.stringify(refundDataList), function (err) {
                    if (err) {
                        callback('file')
                    } else {
                        var currentDate = new Date()
                        var splittedISODateByDot = currentDate.toLocaleString("en-US", {hour12: false}).split('.')
                        var remotePath = '/incoming/returns/return' + splittedISODateByDot[0].replace(' ', '').replace(',', '').replace(/\-/g, '').replace(/\//g, '').replace(/\:/g, '') + '.txt'
                        sftp.put(returnFileName, remotePath).then(response => {
                            commonHelper.addStatus(vendorInfo, connectorInfo, 2, (statusErr) => {
                                if (statusErr) {
                                    callback({error: 'status'})
                                } else {
                                    callback(null)
                                }
                            })
                            
                            sftp.end()
                        }).catch(error => {
                            commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                                if (statusErr) {
                                    callback({error: 'status'})
                                } else {
                                    callback({error: 'upload'})
                                }
                            })
                        })
                    }
                })
            })
        })
        .catch(err => {
            commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                if (statusErr) {
                    callback({error: 'status'})
                } else {
                    callback({error: 'store'})
                }
            })
        })
    },

    refundFeedOutCreate: (vendorInfo, connectorInfo, callback) => {

    }
};