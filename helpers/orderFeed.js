const commonHelper = require('./common')
const Shopify = require('shopify-api-node')
const fs = require('fs')
const Client = require('ssh2-sftp-client')
const delay = require('delay')
const TSV = require('tsv')

module.exports = {
    orderFeedOutCreate: (vendorInfo, connectorInfo, callback) => {
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

                    let dataFromSFTP = TSV.parse(fileData._readableState.buffer.head.data)
                    var orderData = dataFromSFTP[1]
                    
                    orderPost.order.line_items.push({
                        variant_id: orderData['item_sku'],
                        quantity: orderData['item_qty_ordered']
                    })
                    orderPost.order.billing_address = {
                        first_name: orderData['bill_firstname'],
                        last_name: orderData['bill_lastname'],
                        name: orderData['bill_firstname'] + ' ' + orderData['bill_lastname'],
                        address1: orderData['bill_street'],
                        phone: orderData['bill_phone'],
                        city: orderData['bill_city'],
                        zip: orderData['bill_postal_code'],
                        province: orderData['bill_state'],
                        country: 'United States',
                        address2: orderData['bill_street_2'],
                        company: '',
                        latitude: '',
                        longitude: '',
                        country_code: 'US',
                        province_code: orderData['ship_postal_code']
                    }

                    orderPost.order.shipping_address = {
                        first_name: orderData['ship_firstname'],
                        last_name: orderData['ship_lastname'],
                        name: orderData['ship_firstname'] + ' ' + orderData['ship_lastname'],
                        address1: orderData['ship_street'],
                        phone: orderData['ship_phone'],
                        city: orderData['ship_city'],
                        zip: orderData['ship_postal_code'],
                        province: orderData['ship_state'],
                        country: 'United States',
                        address2: orderData['ship_street_2'],
                        company: '',
                        latitude: '',
                        longitude: '',
                        country_code: 'US',
                        province_code: orderData['bill_postal_code']
                    }
                    orderPost.order.customer = {
                        first_name: orderData['bill_firstname'],
                        last_name: orderData['bill_lastname'],
                        name: orderData['bill_firstname'] + ' ' + orderData['bill_lastname'],
                        email: orderData['customer_email']
                    }
                    orderPost.order.email = 'shopsatnbcu+orders@balanceagent.com'
                    orderPost.order.buyer_accepts_marketing = false
                    orderPost.order.send_receipt = false
                    orderPost.order.send_fulfillment_receipt = false
                    orderPost.order.total_discounts = orderData['discount_total']
                    orderPost.order.total_tax = orderData['tax_total']
                    orderPost.order.total_price = orderData['total_total']
                    orderPost.order.currency = 'USD'
                    orderPost.order.financial_status = 'paid'
                    orderPost.order.fulfillment_status = null
                    orderPost.order.source = orderData['ship_method']
                    orderPost.order.shipping_lines = [{
                        code: "INT.TP",
                        price: 4,
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
                                        callback({error: 'status'})
                                    } else {
                                        console.log('added new order into shopify store')
                                        sftp.delete('/outgoing/orders/' + fileName).then(result => {
                                            console.log('App deleted ' + fileName)
                                        }).catch(deleteError => {
                                            console.log('Error in deleting order file of sftp: ', deleteError)
                                        })
                                    }
                                })
                            })
                        })
                    }).catch(createError => {
                        commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                            if (statusErr) {
                                callback({error: 'status'})
                            } else {
                                callback({error: 'orderOut'})
                            }
                        })
                    })
                }).catch(getDataError => {
                    commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                        if (statusErr) {
                            callback({error: 'status'})
                        } else {
                            callback({error: 'store'})
                        }
                    })
                })
            })

            
        }).catch(ftpError => {
            callback({error: 'connect'})
        })
    },

    orderFeedInCreate: async (vendorInfo, connectorInfo, fulfilledOrder, orderRow, callback) => {
        const order = fulfilledOrder
        const orderFileName = 'uploads/shipment-' + vendorInfo.api.apiShop + '.txt'
        const sftp = new Client()
        var orderDataList = new Array()
        const BreakException = {}
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
        
        commonHelper.deleteAndInitialize(orderFileName)

        await delay(2000)

        // Calculate subTotal, totalTotal, totalDiscount
        var subTotal = 0; totalTotal = 0; totalTax = 0;
        totalTax = order.total_price - order.subtotal_price

        order.line_items.forEach((item, index) => {
            if (item.fulfillment_status == 'fulfilled' || item.fulfillment_status == 'partial') {
                var taxes = 0.0
                if (item.tax_lines.length > 0) {
                    item.tax_lines.forEach((tax) => {
                        taxes += parseFloat(tax.price)
                    })
                }
                var discounts = 0.0
                if (item.discount_allocations.length > 0) {
                    item.discount_allocations.forEach((dis) => {
                        discounts += parseFloat(dis.amount)
                    })
                }
                subTotal += (parseFloat(item.price) + taxes - discounts) * ( item.quantity - item.fulfillable_quantity )
            }
        })
        totalTotal = subTotal + totalTax

        // Make feed file
        order.line_items.forEach((item, index) => {
            if (item.fulfillment_status == 'fulfilled' || item.fulfillment_status == 'partial') {
                var orderData = {}
                // orderData.order_number = order.order_number
                orderData.order_number = orderRow.outgoingOrderNumbers[index]
                orderData.order_date = order.created_at.substr(5, 2) + '/' + order.created_at.substr(8, 2) + '/' + order.created_at.substr(0, 4)
                orderData.order_payment_method = orderRow.orderPaymentMethod
                orderData.transaction_id = orderRow.transactionId
                if (order.shipping_lines.length > 0) {
                    orderData.ship_method = order.shipping_lines[0].source
                } else {
                    orderData.ship_method = ''
                }
                orderData.subtotal = subTotal
                orderData.tax_total = order.total_tax
                orderData.discount_total = order.total_discounts
                // orderData.total_total = parseFloat(order.subtotal_price) + parseFloat(order.total_tax) - parseFloat(order.total_discounts)
                orderData.total_total = totalTotal

                orderData.customer_email = ''
                if (order.customer) {
                    orderData.customer_email = order.customer.email
                }

                if (order.shipping_address) {
                    orderData.ship_firstname = order.shipping_address.first_name
                    orderData.ship_lastname = order.shipping_address.last_name
                    orderData.ship_street = order.shipping_address.address1
                    orderData.ship_street2 = order.shipping_address.address2
                    orderData.ship_postal_code = order.shipping_address.zip
                    orderData.ship_city = order.shipping_address.city
                    orderData.ship_state = orderRow.shipState
                    orderData.ship_country = order.shipping_address.country
                    orderData.ship_phone = order.shipping_address.phone
                }

                if (order.billing_address) {
                    orderData.bill_firstname = order.billing_address.first_name
                    orderData.bill_lastname = order.billing_address.last_name
                    orderData.bill_street = order.billing_address.address1
                    orderData.bill_street2 = order.billing_address.address2
                    orderData.bill_postal_code = order.billing_address.zip
                    orderData.bill_city = order.billing_address.city
                    orderData.bill_state = orderRow.billState
                    orderData.bill_country = order.billing_address.country
                    orderData.bill_phone = order.billing_address.phone
                }

                if (item.fulfillment_status == 'fulfilled') {
                    orderData.item_status = 'shipped'
                } else if (item.fulfillment_status == 'partial') {
                    orderData.item_status = 'ordered'
                } else {
                    orderData.item_status = 'cancelled'
                }
                // Get variant by using item.variant_id
                // Initialize item_orig_price at first because it should match the order of header.
                orderData.item_sku = ''
                orderData.item_orig_price = 0
                shopify.productVariant.get(item.variant_id).then(
                    variant => {
                        orderData.item_sku = variant.id
                        orderData.item_orig_price = variant.compare_at_price
                    },
                    variantError => console.log('Error in getting product variant: ', variantError)
                )
                orderData.item_price = item.price
                orderData.item_qty_ordered = item.quantity
                orderData.item_qty_shipped = item.quantity - item.fulfillable_quantity
                orderData.item_qty_cancelled = item.fulfillable_quantity
                
                var taxes = 0.0
                if (item.tax_lines.length > 0) {
                    item.tax_lines.forEach((tax) => {
                        taxes += parseFloat(tax.price)
                    })
                }
                orderData.item_tax = taxes
                var discounts = 0.0
                if (item.discount_allocations.length > 0) {
                    item.discount_allocations.forEach((dis) => {
                        discounts += parseFloat(dis.amount)
                    })
                }
                orderData.item_discount = discounts
                orderData.item_total = (parseFloat(item.price) + taxes - discounts) * orderData.item_qty_shipped

                orderData.final_sale = false
                orderData.order_gift_sender = ''
                orderData.order_gift_recepient = ''
                orderData.order_gift_message = ''

                orderData.auth_code = order.checkout_token
                orderData.tracking_number = ''
                if (order.shipping_lines.length > 0) {
                    orderData.ship_carrier = order.shipping_lines[0].source
                }
                orderData.invoice_amount = totalTotal
                orderData.retailer_order_number = order.order_number + ' | ' + order.id + ' | ' + item.id

                var fulfillmentId = 0
                order.fulfillments.forEach((fulfillment) => {
                    if (fulfillment.status == 'success') {
                        fulfillmentId = parseInt(fulfillment.id)
                        let fulfillmentCreateDate = new Date(fulfillment.created_at)
                        orderData.ship_date = (fulfillmentCreateDate.getMonth() + 1) + '/' + fulfillmentCreateDate.getDate() + '/' + fulfillmentCreateDate.getFullYear()
                        if (fulfillment.line_items.length > 0) {
                            try {
                                fulfillment.line_items.forEach(fulfillmentItem => {
                                    if (fulfillmentItem.id == item.id) {
                                        orderData.tracking_number = fulfillment.tracking_number
                                        throw BreakException
                                    }
                                })
                            } catch (e) {
                                if (e !== BreakException) throw e
                            }
                        }
                    }
                })
                
                if (fulfillmentId > 0) {
                    shopify.fulfillmentEvent.list(order.id, fulfillmentId)
                    .then((events) => {
                        if (events.length > 0) {
                            events.forEach((event) => {
                                if (event.status == 'in_transit')
                                    orderData.delivery_date = event.estimated_delivery_at
                                else
                                    orderData.delivery_date = event.delivery_date
                            })
                        } else {
                            orderData.delivery_date = ''
                        }
                    })
                    .catch(err => console.log('fulfillmentEvent error: ', err))
                } else {
                    orderData.delivery_date = ''
                }
                orderDataList.push(orderData)
            }
        })

        await delay(3000)

        sftp.connect({
            host: vendorInfo.sftp.sftpHost,
            port: process.env.SFTP_PORT,
            username: vendorInfo.sftp.sftpUsername,
            password: vendorInfo.sftp.sftpPassword
        }).then(() => {
            fs.writeFile(orderFileName, TSV.stringify(orderDataList), function (err) {
                if (err) {
                    console.log('Writing File Error: ', err)
                    callback({error: 'file'})
                } else {
                    var remotePath = '/incoming/orders/orderext_' + commonHelper.dateStringForName() + '.txt'
                    sftp.put(orderFileName, remotePath).then(response => {
                        commonHelper.addStatus(vendorInfo, connectorInfo, 2, (statusErr) => {
                            if (statusErr) {
                                callback({error: 'status'})
                            } else {
                                callback(null)
                            }
                        })
                    }).catch(error => {
                        console.log('upload error: ', error)
                        callback({error: 'upload'})
                    })
                }
            })
        }).catch((e) => {
            commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                if (statusErr) {
                    callback({error: 'status'})
                } else {
                    console.log('SFTP connection error: ', e)
                    callback({error: 'connect'})
                }
            })
        })
        
    }
}