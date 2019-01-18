const commonHelper = require('../../helpers/common')

const Vendor = require('../../models/Vendor')
const Connector = require('../../models/Connector')
const Order = require('../../models/Order')
const Webhook = require('../../models/Webhook')

const productFeedHelper = require('../../helpers/productFeed')
const inventoryFeedHelper = require('../../helpers/inventoryFeed')
const orderFeedHelper = require('../../helpers/orderFeed')
const refundFeedHelper = require('../../helpers/refundFeed')

/**
 * POST /
 * Feed Trigger Action
 */

exports.productChange = async (req, res) => {
    res.status(200).send()
    const vendorName = req.headers['x-shopify-shop-domain'].slice(0, -14)
    console.log('webhook type: ', req.headers['x-shopify-topic'] + ' in ' + vendorName)
    getVendorInfo(vendorName, (vendorErr, vendorInfo) => {
        if (vendorErr) {
            console.log('There are no vendor for this.')
        } else {
            res.status(200).send()
            getConnectorInfo(vendorInfo, 'product', (connectorErr, connectorInfo) => {
                if (connectorErr) {
                    console.log('There is no connector for this.')
                } else {
                    res.status(200).send()
                    var webhookData = new Webhook()
                    webhookData.vendorId = vendorInfo._id
                    webhookData.connector = connectorInfo.kwiLocation
                    webhookData.requestId = req.headers['x-shopify-product-id']
                    
                    webhookData.save()
                }
            })
        }
    })
}

exports.orderFulfill = (req, res) => {
    res.status(200).send()
    const vendorName = req.headers['x-shopify-shop-domain'].slice(0, -14)
    getVendorInfo(vendorName, (vendorErr, vendorInfo) => {
        if (vendorErr) {
            console.log('There are no vendor for this.')
        } else {
            res.status(200).send()
            getConnectorInfo(vendorInfo, 'order', (connectorErr, connectorInfo) => {
                if (connectorErr) {
                    console.log('There is no connector for this.')
                } else {
                    res.status(200).send()
                    const hookOrderId = req.headers['x-shopify-order-id']
                    Order.find({
                        vendorId: vendorInfo._id
                    }).then(orders => {
                        orders.forEach(orderItem => {
                            if (orderItem.orderId == hookOrderId) {
                                orderFeedHelper.orderFeedInCreate(vendorInfo, connectorInfo, req.body, orderItem, (orderFeedErr) => {
                                    if (orderFeedErr) {
                                        console.log(orderFeedErr)
                                    } else {
                                        console.log('order inFeed success in vendor: ', vendorName)
                                    }
                                })
                            }
                        })
                    })
                }
            })
        }
    })
}

exports.refundCreate = (req, res) => {
    res.status(200).send()
    console.log('refund headers: ', req.headers)
    console.log('refund body: ', req.body)
    const vendorName = req.headers['x-shopify-shop-domain'].slice(0, -14)
    getVendorInfo(vendorName, (vendorErr, vendorInfo) => {
        if (vendorErr) {
            console.log('There is no vendor for this.')
        } else {
            res.status(200).send()
            getConnectorInfo(vendorInfo, 'order', (connectorErr, connectorInfo) => {
                if (connectorErr) {
                    console.log('There is no connector for this.')
                } else {
                    res.status(200).send()
                    const hookOrderId = req.headers['x-shopify-order-id']
                    Order.find({
                        vendorId: vendorInfo._id
                    }).then(orders => {
                        orders.forEach(orderItem => {
                            if (orderItem.orderId == hookOrderId) {
                                orderFeedHelper.orderFeedInCreate(vendorInfo, connectorInfo, req.body, orderItem.outgoingOrderNumbers, (orderFeedErr) => {
                                    if (orderFeedErr) {
                                        console.log(orderFeedErr)
                                    } else {
                                        console.log('order inFeed success in vendor: ', vendorName)
                                    }
                                })
                            }
                        })
                    })
                }
            })
        }
    })
}

// receive request whenever kwi creates order file
exports.kwiOrderCreate = (req, res) => {
    res.status(200).send()
    console.log('order data from kwi: ', req.body)
}

exports.kwiRefundCreate = (req, res) => {
    res.status(200).send()
    console.log('refund data from kwi: ', req.body)
}

exports.productTimer = () => {
    // Get and loop vendor list
    Vendor.find({
        active: 'yes',
        colorSynched: 'yes'
    }, (vendorErr, vendorList) => {
        vendorList.forEach(vendorItem => {
            Webhook.findOne({
                vendorId: vendorItem._id,
                connector: 'product'
            }, (productWebhookError, productWebhookList) => {
                if (!productWebhookError && productWebhookList) {
                    getConnectorInfo(vendorItem, 'product', (connectorErr, connectorInfo) => {
                        if (connectorErr) {
                            console.log('There is no connector for this.')
                        } else {
                            // Execute productFeedIn a time and delete all rows for this vendor && connector
                            productFeedHelper.productFeedInCreate(vendorItem, connectorInfo, (productFeedErr) => {
                                if (productFeedErr) {
                                    console.log(productFeedErr)
                                } else {
                                    Webhook.deleteMany({
                                        vendorId: vendorItem._id,
                                        connector: 'product'
                                    }, () => {
                                        console.log('product feed success in vendor: ', vendorItem.api.apiShop)
                                    })
                                }
                            })
                        }
                    })
                }
            })
        })
    })
    // Search product webhooks per vendor
    // Execute product webhook and delete request rows and add this to history.
}

// get information of vendor and connector by using vendorName
const getVendorInfo = (vendorName, callback) => {
    Vendor.findOne({
        'api.apiShop': vendorName,
        active: 'yes',
        colorSynched: 'yes'
    }, (vendorError, vendor) => {
        if (vendorError) {
            callback(vendorError)
        } else {
            callback(null, vendor)
        }
    })
}

const getConnectorInfo = (vendor, connectorType, callback) => {
    Connector.findOne({
        vendorId: vendor._id,
        active: 'yes',
        kwiLocation: connectorType,
    }, (connectorError, connector) => {
        if (connectorError) {
            callback(connectorError)
        } else {
            callback(null, connector)
        }
    })
}