const Shopify = require('shopify-api-node')
const Client = require('ssh2-sftp-client')
const TSV = require('tsv')

const Vendor = require('../../models/Vendor')
const Connector = require('../../models/Connector')
const Order = require('../../models/Order')

const commonHelper = require('../../helpers/common')

const ProvinceList = require('../../config/constants').ProvinceList
/**
 * GET /
 * Order page.
 */
exports.index = async (req, res, next) => {
    res.render('feeds/order', {
        title: 'order'
    })
    var vendorInfo, connectorInfo
    Connector.find({
        vendorId: req.user.vendorId,
        kwiLocation: 'order',
        active: 'yes'
    }, (err, connectors) => {
        if (err) {
            return next(err)
        }
        if (connectors.length == 0) {
            req.flash('errors', {
                msg: 'Your vendor does not include order connector or it is inactive. Please contact with Administrator or Admin User.'
            })
            errorExist = true
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
        let shopify = new Shopify({
            shopName: vendor.api.apiShop,
            apiKey: vendor.api.apiKey,
            password: vendor.api.apiPassword,
            timeout: 50000,
            autoLimit: {
                calls: 2,
                interval: 1000,
                bucketSize: 35
            }
        })

        // Get order data from ftp
        let sftp = new Client()
        sftp.connect({
            host: vendorInfo.sftp.sftpHost,
            port: process.env.SFTP_PORT,
            username: vendorInfo.sftp.sftpUsername,
            password: vendorInfo.sftp.sftpPassword
        }).then(() => {
            return sftp.list('/outgoing/orders')
        }).then(sftpFileList => {
            let fileList = []
            
            sftpFileList.forEach(sftpFile => {
                if (sftpFile.type == '-') {
                    fileList.push(sftpFile.name)
                }
            })

            fileList.forEach(fileName => {
                sftp.get('/outgoing/orders/' + fileName).then(fileData => {
                    var orderPost = {}
                    orderPost.order = {}
                    orderPost.order.line_items = []
                    orderPost.order.billing_address = {}
                    orderPost.order.shipping_address = {}
                    var outgoingOrderNumbers = []

                    let dataFromSFTP = TSV.parse(fileData._readableState.buffer.head.data)
                    // console.log('data from sftp', dataFromSFTP)
                    var orderData = dataFromSFTP[1]
                    
                    dataFromSFTP.forEach(dataFromSFTPRow => {
                        if (dataFromSFTPRow.order_number != '' && dataFromSFTPRow['item_sku'] != 'SHIPPING') {
                            orderPost.order.line_items.push({
                                variant_id: dataFromSFTPRow['item_sku'],
                                quantity: dataFromSFTPRow['item_qty_ordered'],
                                price: dataFromSFTPRow['item_price']
                            })
                            outgoingOrderNumbers.push(dataFromSFTPRow.order_number)
                        }
                    })
                    orderPost.order.billing_address = {
                        first_name: orderData['bill_firstname'],
                        last_name: orderData['bill_lastname'],
                        name: orderData['bill_firstname'] + ' ' + orderData['bill_lastname'],
                        address1: orderData['bill_street'],
                        phone: orderData['bill_phone'],
                        city: orderData['bill_city'],
                        zip: orderData['bill_postal_code'],
                        province: ProvinceList[orderData['bill_state']],
                        country: 'United States',
                        address2: orderData['bill_street_2'],
                        company: '',
                        latitude: '',
                        longitude: '',
                        country_code: 'US',
                        province_code: orderData['bill_state']
                    }

                    orderPost.order.shipping_address = {
                        first_name: orderData['ship_firstname'],
                        last_name: orderData['ship_lastname'],
                        name: orderData['ship_firstname'] + ' ' + orderData['ship_lastname'],
                        address1: orderData['ship_street'],
                        phone: orderData['ship_phone'],
                        city: orderData['ship_city'],
                        zip: orderData['ship_postal_code'],
                        province: ProvinceList[orderData['ship_state']],
                        country: 'United States',
                        address2: orderData['ship_street_2'],
                        company: '',
                        latitude: '',
                        longitude: '',
                        country_code: 'US',
                        province_code: orderData['ship_state']
                    }
                    orderPost.order.customer = {
                        first_name: orderData['bill_firstname'],
                        last_name: orderData['bill_lastname'],
                        name: orderData['bill_firstname'] + ' ' + orderData['bill_lastname'],
                        // email: orderData['customer_email']
                        email: 'shopsatnbcu+orders@balanceagent.com'
                    }
                    
                    orderPost.order.email = 'shopsatnbcu+orders@balanceagent.com'
                    orderPost.order.buyer_accepts_marketing = false
                    orderPost.order.send_receipt = false
                    orderPost.order.send_fulfillment_receipt = false
                    orderPost.order.total_discounts = orderData['discount_total']
                    orderPost.order.total_tax = orderData['tax_total']
                    orderPost.order.total_price = orderData['total_total']
                    orderPost.order.currency = 'USD'
                    orderPost.order.financial_status = 'paid' // need to check later, again. There is 'paid' value, too.
                    orderPost.order.fulfillment_status = null
                    orderPost.order.source = orderData['ship_method']
                    const ship_price = orderData['total_total'] - orderData['subtotal'] - orderData['tax_total']
                    orderPost.order.shipping_lines = [{
                        code: "INT.TP",
                        price: ship_price.toFixed(2).toString(),
                        discount_price: 1,
                        source: "usps",
                        title: "Small Packet International Air",
                        carrier_identifier: "third_party_carrier_identifier"
                    }]
                    orderPost.order.tags = 'NBCU'
                    orderPost.order.source_name = 'nbcu'
                    
                    orderPost.order.subtotal_price = orderData['subtotal']
                    orderPost.order.total_tax = orderData['tax_total']
                    shopify.order.create(orderPost.order).then(createResult => {
                        let originalOrderId = createResult.id
                        let nextOrderNumber = createResult.order_number + 1
                        orderPost.order.name = "NBCU-" + nextOrderNumber
                        orderPost.order.send_receipt = true
                        orderPost.order.send_fulfillment_receipt = true

                        shopify.order.create(orderPost.order).then(createNextOrder => {
                            shopify.order.delete(originalOrderId).then(deleteResult => {
                                commonHelper.addStatus(vendorInfo, connectorInfo, 2, (statusErr) => {
                                    if (statusErr) {
                                        return next(statusErr)
                                    } else {
                                        console.log('Added new order into shopify store.')
                                        sftp.delete('/outgoing/orders/' + fileName).then(result => {
                                            console.log('App deleted ' + fileName)
                                            var orderDataDB = new Order()
                                            orderDataDB.vendorId = vendor._id
                                            orderDataDB.orderId = createNextOrder.id
                                            orderDataDB.outgoingOrderNumbers = outgoingOrderNumbers
                                            orderDataDB.orderPaymentMethod = orderData['order_payment_method']
                                            orderDataDB.transactionId = orderData['transaction_id']
                                            orderDataDB.shipState = orderData['ship_state']
                                            orderDataDB.billState = orderData['bill_state']
                                            
                                            orderDataDB.save().then(() => {
                                                console.log('Added order data into DB.')
                                            })
                                        }).catch(deleteError => {
                                            console.log('Error in deleting order file of sftp: ', deleteError)
                                        })
                                    }
                                })
                            })
                        }).catch(createNextError => {
                            console.log('Creating Next Order Error: ', createNextError)
                        })
                    }).catch(createError => {
                        commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                            if (statusErr) {
                                return next(statusErr)
                            } else {
                                console.log('Creating Error: ', createError)
                            }
                        })
                    })
                }).catch(getDataError => {
                    commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                        if (statusErr) {
                            return next(statusErr)
                        } else {
                            return next(getDataError)
                        }
                    })
                })
            })

            
        }).catch(ftpError => {
            return next(ftpError)
        })
    })
}
