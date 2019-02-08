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
    console.log('topic: ', req.headers['x-shopify-topic'] + ' : ' + vendorName)
    
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
                    
                    Webhook.find({
                        vendorId: vendorInfo._id,
                        connector: connectorInfo.kwiLocation
                    }, (webhookError, webhookList) => {
                        if (webhookError) {
                            console.log('webhook Error')
                            webhookData.save()
                        }
                        if (!webhookError && webhookList.length == 0) {
                            console.log('There are no data in webhook')
                            webhookData.save()
                        }
                    })
                }
            })
        }
    })
}

exports.orderFulfill = (req, res) => {
    res.status(200).send()
    var vendorName = req.headers['x-shopify-shop-domain'].slice(0, -14)
    var orderName = req.body['name']
    if (orderName.indexOf('NBCU') !== -1) {
        console.log('topic: ', req.headers['x-shopify-topic'] + ' , order index: ', req.headers['x-shopify-order-id'] + ' fulfilled from ', vendorName, ' order name: ', orderName)
        getVendorInfo(vendorName, (vendorErr, vendorInfo) => {
            if (vendorErr) {
                console.log('There are no vendor for this request')
            } else {
                res.status(200).send()
                getConnectorInfo(vendorInfo, 'order', (connectorErr, connectorInfo) => {
                    if (connectorErr) {
                        console.log('There is no connector for this.')
                    } else {
                        res.status(200).send()
                        var hookOrderId = req.headers['x-shopify-order-id']
                        // const hookOrderId = req.body['order_id']
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
    } else {
        console.log('This request is not related with KWI. From -> ', vendorName)
    }
}

exports.orderFulfillmentUpdate = (req, res) => {
    res.status(200).send()

    console.log('headers: ', req.headers)
    console.log('body: ', req.body)
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
                            // Execute productFeedIn a time and delete all rows related with this vendor && connector
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
}

exports.orderOutTimer = () => {
    Vendor.find({
        active: 'yes',
        colorSynched: 'yes'
    }, (vendorErr, vendorList) => {
        if (vendorErr) {
            console.log('There are problems in getting vendor list')
        } else {
            vendorList.forEach(vendorItem => {
                getConnectorInfo(vendorItem, 'order', (connectorErr, connectorInfo) => {
                    if (connectorErr) {
                        console.log('There is no connector for this.')
                    } else {
                        orderFeedHelper.orderFeedOutCreate(vendorItem, connectorInfo, (orderErr) => {
                            if (orderErr) {
                                console.log(orderErr)
                            } else {
                                console.log('Creating order is success in vendor -> ', vendorItem.name)
                            }
                        })
                    }
                })
            })
        }
    })
}

exports.refundCreateTimer = () => {
    Vendor.find({
        active: 'yes',
        colorSynched: 'yes'
    }, (vendorErr, vendorList) => {
        if (vendorErr) {
            console.log('There are problems in getting vendor list.')
        } else {
            vendorList.forEach(vendorItem => {
                getConnectorInfo(vendorItem, 'refund', (connectorErr, connectorInfo) => {
                    if (connectorErr) {
                        console.log('There is no connector for this.')
                    } else {
                        refundFeedHelper.refundFeedInOutCreate(vendorItem, connectorInfo, (refundErr) => {
                            if (refundErr) {
                                console.log(refundErr)
                            } else {
                                console.log('refund success in vendor: ', vendorItem.name)
                            }
                        })
                    }
                })
            })
        }
    })
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