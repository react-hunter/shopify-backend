const Shopify = require('shopify-api-node');
const fs = require('fs');
const Client = require('ssh2-sftp-client');
const delay = require('delay');
const TSV = require('tsv');

const Vendor = require('../../models/Vendor');
const Connector = require('../../models/Connector');

/**
 * GET /
 * Order page.
 */
exports.index = async (req, res, next) => {

    var vendorData;
    var shopify = null;
    var errorExist = false;
    Vendor.findOne({
        _id: req.user.vendorId
    }, (vendorError, vendor) => {
        if (vendorError) {
            return next(vendorError);
        }
        vendorData = vendor;

        if (vendorData.api.apiShop == '' || vendorData.api.apiKey == '' || vendorData.api.apiPassword == '') {
            req.flash('errors', {
                msg: 'You should have API information to manage product feed. Please contact with Administrator.'
            });
            errorExist = true;
            res.redirect('/');
            return next();
        }
        if (vendorData.sftp.sftpHost == '' || vendorData.sftp.sftpPassword == '' || vendorData.sftp.sftpUsername == '') {
            req.flash('errors', {
                msg: 'You should have SFTP information to manage product feed. Please contact with Administrator.'
            });
            errorExist = true;
            res.redirect('/');
            return next();
        }
        if (vendorData.active == 'yes') {
            shopify = new Shopify({
                shopName: vendorData.api.apiShop,
                apiKey: vendorData.api.apiKey,
                password: vendorData.api.apiPassword,
                timeout: 50000,
                autoLimit: {
                    calls: 2,
                    interval: 1000,
                    bucketSize: 35
                }
            });
        }
        // Check vendor availability. If vendor's status is inactive, it should redirect to homepage without any action.
        if (vendorData.active == 'no') {
            req.flash('errors', {
                msg: 'Your vendor should be active to manage feed. Please contact with Administrator.'
            });
            errorExist = true;
            res.redirect('/');
            return next();
        }

        // Check order connector
        Connector.find({
            vendorId: vendorData._id,
            kwiLocation: 'order',
            active: 'yes'
        }, (err, connectors) => {
            if (err) {
                return next(err);
            }
            if (connectors.length == 0) {
                req.flash('errors', {
                    msg: 'Your vendor does not include order connector or it is inactive. Please contact with Administrator or Admin User.'
                });
                errorExist = true;
                res.redirect('/');
                return next();
            }
        });
    });

    const sftp = new Client(); // sftp client
    var orderDataList = new Array();
    var BreakException = {};

    deleteAndInitialize('uploads/order.txt');

    if (req.user.active !== 'yes') {
        req.flash('errors', {
            msg: 'Your account is inactive now. Please contact with Administrator.'
        });
        errorExist = true;
        res.redirect('/');
        return next();
    }

    await delay(2000);
    if (!errorExist) {
        shopify.order.list()
            .then((orders) => {

                orders.forEach(order => {
                    order.line_items.forEach(item => {
                        var orderData = {};
                        orderData.order_number = order.order_number;
                        orderData.order_date = order.created_at.substr(5, 2) + '/' + order.created_at.substr(8, 2) + '/' + order.created_at.substr(0, 4);
                        orderData.order_payment_method = order.gateway;
                        orderData.transaction_id = order.checkout_id;
                        if (order.shipping_lines.length > 0) {
                            orderData.ship_method = order.shipping_lines[0].source;
                        } else {
                            orderData.ship_method = '';
                        }
                        orderData.subtotal = order.subtotal_price;
                        orderData.tax_total = order.total_tax;
                        orderData.discount_total = order.total_discounts;
                        orderData.total_total = parseFloat(order.subtotal_price) + parseFloat(order.total_tax) - parseFloat(order.total_discounts);

                        orderData.customer_email = '';
                        if (order.customer) {
                            orderData.customer_email = order.customer.email;
                        }

                        if (order.shipping_address) {
                            orderData.ship_firstname = order.shipping_address.first_name;
                            orderData.ship_lastname = order.shipping_address.last_name;
                            orderData.ship_street = order.shipping_address.address1;
                            orderData.ship_street2 = order.shipping_address.address2;
                            orderData.ship_postal_code = order.shipping_address.zip;
                            orderData.ship_city = order.shipping_address.city;
                            orderData.ship_state = order.shipping_address.province;
                            orderData.ship_country = order.shipping_address.country;
                            orderData.ship_phone = order.shipping_address.phone;
                        }

                        if (order.billing_address) {
                            orderData.bill_firstname = order.billing_address.first_name;
                            orderData.bill_lastname = order.billing_address.last_name;
                            orderData.bill_street = order.billing_address.address1;
                            orderData.bill_street2 = order.billing_address.address2;
                            orderData.bill_postal_code = order.billing_address.zip;
                            orderData.bill_city = order.billing_address.city;
                            orderData.bill_state = order.billing_address.province;
                            orderData.bill_country = order.billing_address.country;
                            orderData.bill_phone = order.billing_address.phone;
                        }

                        if (item.fulfillment_status == 'fulfilled') {
                            orderData.item_status = 'shipped';
                        } else if (item.fulfillment_status == 'partial' || item.fulfillment_status == null) {
                            orderData.item_status = 'ordered';
                        } else {
                            orderData.item_status = 'cancelled';
                        }
                        // Get variant by using item.variant_id
                        // Initialize item_orig_price at first because it should match the order of header.
                        orderData.item_sku = '';
                        orderData.item_orig_price = 0;
                        shopify.productVariant.get(item.variant_id).then(
                            variant => {
                                // orderData.item_sku = variant.sku;
                                orderData.item_sku = variant.id;
                                orderData.item_orig_price = variant.compare_at_price;
                            },
                            variantError => console.log('Error in getting product variant: ', variantError)
                        );
                        orderData.item_price = item.price;
                        orderData.item_qty_ordered = item.quantity;
                        orderData.item_qty_shipped = item.quantity - item.fulfillable_quantity;
                        if (item.fulfillment_status == null) {
                            orderData.item_qty_cancelled = 0;
                        } else {
                            orderData.item_qty_cancelled = item.fulfillable_quantity;
                        }
                        var taxes = 0.0;
                        if (item.tax_lines.length > 0) {
                            item.tax_lines.forEach((tax) => {
                                taxes += parseFloat(tax.price);
                            });
                        }
                        orderData.item_tax = taxes;
                        var discounts = 0.0;
                        if (item.discount_allocations.length > 0) {
                            item.discount_allocations.forEach((dis) => {
                                discounts += parseFloat(dis.amount);
                            });
                        }
                        orderData.item_discount = discounts;
                        orderData.item_total = (parseFloat(item.price) + taxes - discounts) * item.quantity;

                        orderData.order_gift_sender = '';
                        orderData.order_gift_recepient = '';
                        orderData.order_gift_message = '';

                        // var temp = order.order_status_url.split('?key=');
                        // orderData.auth_code = temp[1];
                        orderData.auth_code = order.checkout_token;
                        orderData.final_sale = false;
                        orderData.tracking_number = '';
                        if (order.shipping_lines.length > 0) {
                            orderData.ship_carrier = order.shipping_lines[0].source;
                        }
                        orderData.invoice_amount = order.total_price;
                        orderData.retailer_order_number = order.number;

                        var fulfillmentId = 0;
                        if (order.fulfillments.length > 0) {
                            order.fulfillments.forEach((fulfillment) => {
                                if (fulfillment.status == 'success') {
                                    fulfillmentId = parseInt(fulfillment.id);
                                    var tempDate = new Date(fulfillment.created_at);
                                    orderData.ship_date = (tempDate.getMonth() + 1) + '/' + tempDate.getDate() + '/' + tempDate.getFullYear();
                                    if (fulfillment.line_items.length > 0) {
                                        try {
                                            fulfillment.line_items.forEach(fulfillmentItem => {
                                                if (fulfillmentItem.id == item.id) {
                                                    orderData.tracking_number = fulfillment.tracking_number;
                                                    throw BreakException;
                                                }
                                            });
                                        } catch (e) {
                                            if (e !== BreakException) throw e;
                                        }
                                    }
                                }
                            });
                        } else {
                            orderData.ship_date = 'No Ship yet';
                        }
                        if (fulfillmentId > 0) {
                            shopify.fulfillmentEvent.list(order.id, fulfillmentId)
                                .then((events) => {
                                    if (events.length > 0) {
                                        events.forEach((event) => {
                                            if (event.status == 'in_transit')
                                                orderData.delivery_date = event.estimated_delivery_at;
                                            else
                                                orderData.delivery_date = event.delivery_date;
                                        });
                                    } else {
                                        orderData.delivery_date = 'Not Sure';
                                    }
                                    orderDataList.push(orderData);
                                })
                                .catch(err => console.log('fulfillmentEvent error: ', err));
                        } else {
                            orderData.delivery_date = 'Not Sure';
                            orderDataList.push(orderData);
                        }

                    });
                });

            })
            .then(() => {
                sftp.connect({
                        host: vendorData.sftp.sftpHost,
                        port: process.env.SFTP_PORT,
                        username: vendorData.sftp.sftpUsername,
                        password: vendorData.sftp.sftpPassword
                    })
                    .then(() => {
                        fs.writeFile("uploads/order.txt", TSV.stringify(orderDataList), function (err) {
                            if (err) {
                                console.log('Writing File Error: ', err);
                            } else {
                                var currentDate = new Date();
                                var temp = currentDate.toLocaleString("en-US", {
                                    hour12: false
                                }).split('.');
                                var remotePath = '/incoming/orders/order' + temp[0].replace(' ', '').replace(/\-/g, '').replace(/\//g, '').replace(',', '').replace(/\:/g, '') + '.txt';
                                sftp.put('uploads/order.txt', remotePath)
                                    .then(response => {
                                        res.render('feeds/order', {
                                            title: 'Order',
                                            orderList: orderDataList
                                        });
                                    })
                                    .catch(error => console.log('upload error: ', error));
                            }
                        });
                    })
            })
            .catch(err => console.log(err));
    }
};