const commonHelper = require('../../helpers/common')

const Vendor = require('../../models/Vendor')
// const Connector = require('../../models/Connector')
const Order = require('../../models/Order')
const Webhook = require('../../models/Webhook')

const productFeedHelper = require('../../helpers/productFeed')
// const inventoryFeedHelper = require('../../helpers/inventoryFeed')
const orderFeedHelper = require('../../helpers/orderFeed')
const refundFeedHelper = require('../../helpers/refundFeed')

/**
 * POST /
 * Feed Trigger Action
 */

exports.productChange = async (req, res) => {
    res.status(200).send('OK')
    const vendorName = req.headers['x-shopify-shop-domain'].slice(0, -14)
    console.log('topic: ', req.headers['x-shopify-topic'] + ' : ' + vendorName)
    
    commonHelper.getVendorInfo(vendorName, (vendorErr, vendorInfo) => {
        if (vendorErr) {
            console.log('There are no vendor for this.')
        } else {
            commonHelper.getConnectorInfo(vendorInfo, 'product', (connectorErr, connectorInfo) => {
                if (connectorErr || !connectorInfo) {
                    console.log('There is no product connector for this vendor -> ', vendorItem.name)
                } else {
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
    res.status(200).send('OK')
    var vendorName = req.headers['x-shopify-shop-domain'].slice(0, -14)
    var orderName = req.body['name']
    if (orderName.indexOf('NBCU') !== -1) {
        console.log('topic: ', req.headers['x-shopify-topic'] + ' , order index: ', req.headers['x-shopify-order-id'] + ' fulfilled from ', vendorName, ' order name: ', orderName)
        commonHelper.getVendorInfo(vendorName, (vendorErr, vendorInfo) => {
            if (vendorErr) {
                console.log('There are no vendor for this request')
            } else {
                commonHelper.getConnectorInfo(vendorInfo, 'order', (connectorErr, connectorInfo) => {
                    if (connectorErr || !connectorInfo) {
                        console.log('There is no order connector for this vendor -> ', vendorItem.name)
                    } else {
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
        console.log('This request is not related with KWI. From -> ', vendorName, ', topic: ', req.headers['x-shopify-topic'], 'order index: ', req.headers['x-shopify-order-id'])
    }
}

exports.orderFulfillmentUpdate = (req, res) => {
    res.status(200).send('OK')

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
                    commonHelper.getConnectorInfo(vendorItem, 'product', (connectorErr, connectorInfo) => {
                        if (connectorErr || !connectorInfo) {
                            console.log('There is no product connector for this vendor -> ', vendorItem.name)
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
                commonHelper.getConnectorInfo(vendorItem, 'order', (connectorErr, connectorInfo) => {
                    if (connectorErr || !connectorInfo) {
                        console.log('There is no order connector for this vendor -> ', vendorItem.name)
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
                commonHelper.getConnectorInfo(vendorItem, 'refund', (connectorErr, connectorInfo) => {
                    if (connectorErr || !connectorInfo) {
                        console.log('There is no refund connector for this vendor -> ', vendorItem.name)
                    } else {
                        refundFeedHelper.refundFeedInOutCreate(vendorItem, connectorInfo, (refundErr) => {
                            if (refundErr) {
                                console.log(refundErr)
                            } else {
                                console.log('refund success in vendor -> ', vendorItem.name)
                            }
                        })
                    }
                })
            })
        }
    })
}

exports.testConnectors = () => {
    Vendor.find({
        active: 'yes',
        colorSynched: 'yes'
    }, (vendorErr, vendorList) => {
        if (vendorErr) {
            console.log('There are problems in getting vendor list.')
        } else {
            vendorList.forEach(vendorItem => {
                commonHelper.getConnectorInfo(vendorItem, 'refund', (connectorErr, connectorInfo) => {
                    if (connectorErr || !connectorInfo) {
                        console.log('There is no refund connector for this vendor -> ', vendorItem.name)
                    } else {
                        console.log('connector data: ', connectorInfo)
                    }
                })
            })
        }
    })
}
