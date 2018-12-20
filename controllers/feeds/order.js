const Shopify = require('shopify-api-node');
const fs = require('fs');
const Client = require('ssh2-sftp-client');
const delay = require('delay');
const TSV = require('tsv');

const Vendor = require('../../models/Vendor');
const Connector = require('../../models/Connector');
const History = require('../../models/History');
const Status = require('../../models/Status');

/**
 * GET /
 * Order page.
 */
exports.index = async (req, res, next) => {
    res.render('feeds/order', {
        title: 'order'
    });
    var vendorInfo, connectorInfo;
    Connector.find({
        vendorId: req.user.vendorId,
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
        connectorInfo = connectors[0];
    });
    Vendor.findOne({
        _id: req.user.vendorId,
        active: 'yes'
    }, (vendorError, vendor) => {
        if (vendorError) {
            return next(vendorError);
        }
        vendorInfo = vendor;
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
        });

        // Get order data from ftp
        let sftp = new Client();
        sftp.connect({
            host: vendorInfo.sftp.sftpHost,
            port: process.env.SFTP_PORT,
            username: vendorInfo.sftp.sftpUsername,
            password: vendorInfo.sftp.sftpPassword
        }).then(() => {
            return sftp.list('/outgoing/orders');
        }).then(sftpFileList => {
            let fileList = [];
            
            sftpFileList.forEach(sftpFile => {
                if (sftpFile.type == '-') {
                    fileList.push(sftpFile.name);
                }
            });

            fileList.forEach(fileName => {
                sftp.get('/outgoing/orders/' + fileName).then(fileData => {
                    var orderPost = {};
                    orderPost.order = {};
                    orderPost.order.line_items = [];
                    orderPost.order.billing_address = {};
                    orderPost.order.shipping_address = {};

                    let temp = TSV.parse(fileData._readableState.buffer.head.data);
                    var orderData = temp[1];
                    
                    orderPost.order.line_items.push({
                        variant_id: orderData['item_sku'],
                        quantity: orderData['item_qty_ordered']
                    });
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
                        address2: orderData['bill_street2'],
                        company: '',
                        latitude: '',
                        longitude: '',
                        country_code: 'US',
                        province_code: orderData['ship_postal_code']
                    };

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
                        address2: orderData['ship_street2'],
                        company: '',
                        latitude: '',
                        longitude: '',
                        country_code: 'US',
                        province_code: orderData['bill_postal_code']
                    };
                    orderPost.order.customer = {
                        first_name: orderData['bill_firstname'],
                        last_name: orderData['bill_lastname'],
                        name: orderData['bill_firstname'] + ' ' + orderData['bill_lastname'],
                        email: orderData['customer_email']
                    };
                    orderPost.order.email = 'shopsatnbcu+orders@balanceagent.com';
                    orderPost.order.buyer_accepts_marketing = false;
                    orderPost.order.send_receipt = false;
                    orderPost.order.send_fulfillment_receipt = false;
                    orderPost.order.total_discounts = orderData['discount_total'];
                    orderPost.order.total_tax = orderData['tax_total'];
                    orderPost.order.total_price = orderData['total_total'];
                    orderPost.order.currency = 'USD';
                    orderPost.order.financial_status = 'paid'; // need to check later, again. There is 'paid' value, too.
                    orderPost.order.fulfillment_status = 'fulfilled';
                    orderPost.order.source = orderData['ship_method'];
                    orderPost.order.shipping_lines = [{
                        code: "INT.TP",
                        price: 4,
                        discount_price: 1,
                        source: "usps",
                        title: "Small Packet International Air",
                        // tax_lines: ,
                        carrier_identifier: "third_party_carrier_identifier"
                    }];
                    orderPost.order.tags = 'NBCU';
                    orderPost.order.source_name = 'nbcu';
                    
                    orderPost.order.subtotal_price = orderData['subtotal'];
                    orderPost.order.total_tax = orderData['tax_total'];
                    shopify.order.create(orderPost.order).then(createResult => {
                        let originalOrderId = createResult.id;
                        let nextOrderNumber = createResult.order_number + 1;
                        orderPost.order.name = "NBCU-" + nextOrderNumber;
                        orderPost.order.send_receipt = true;
                        orderPost.order.send_fulfillment_receipt = true;

                        shopify.order.create(orderPost.order).then(createNextOrder => {
                            shopify.order.delete(originalOrderId).then(deleteResult => {
                                addStatus(vendorInfo, connectorInfo, 2, (statusErr) => {
                                    if (statusErr) {
                                        return next(statusErr);
                                    } else {
                                        console.log('added new order into shopify store');
                                        sftp.delete('/outgoing/orders/' + fileName).then(result => {
                                            console.log('App deleted ' + fileName);
                                        }).catch(deleteError => {
                                            console.log('Error in deleting order file of sftp: ', deleteError);
                                        });
                                    }
                                });
                            });
                        });
                    }).catch(createError => {
                        addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                            if (statusErr) {
                                return next(statusErr);
                            } else {
                                console.log('Creating Error: ', createError);
                            }
                        });
                    });
                }).catch(getDataError => {
                    addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                        if (statusErr) {
                            return next(statusErr);
                        } else {
                            return next(getDataError);
                        }
                    });
                });
            });

            
        }).catch(ftpError => {
            return next(ftpError);
        });
    });
};

exports.shipment = async (req, res, next) => {

    var vendorInfo, connectorInfo;
    var orderFileName = '';
    var shopify = null;
    var errorExist = false;
    Vendor.findOne({
        _id: req.user.vendorId
    }, (vendorError, vendor) => {
        if (vendorError) {
            return next(vendorError);
        }
        vendorInfo = vendor;
        orderFileName = 'uploads/shipment-' + vendor.api.apiShop + '.txt';

        if (vendorInfo.api.apiShop == '' || vendorInfo.api.apiKey == '' || vendorInfo.api.apiPassword == '') {
            req.flash('errors', {
                msg: 'You should have API information to manage product feed. Please contact with Administrator.'
            });
            errorExist = true;
            res.redirect('/');
            return next();
        }
        if (vendorInfo.sftp.sftpHost == '' || vendorInfo.sftp.sftpPassword == '' || vendorInfo.sftp.sftpUsername == '') {
            req.flash('errors', {
                msg: 'You should have SFTP information to manage product feed. Please contact with Administrator.'
            });
            errorExist = true;
            res.redirect('/');
            return next();
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
            });
        }
        // Check vendor availability. If vendor's status is inactive, it should redirect to homepage without any action.
        if (vendorInfo.active == 'no') {
            req.flash('errors', {
                msg: 'Your vendor should be active to manage feed. Please contact with Administrator.'
            });
            errorExist = true;
            res.redirect('/');
            return next();
        }

        // Check order connector
        Connector.find({
            vendorId: vendorInfo._id,
            kwiLocation: 'ship',
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
            connectorInfo = connectors[0];
        });
    });

    const sftp = new Client(); // sftp client
    var orderDataList = new Array();
    var BreakException = {};

    deleteAndInitialize(orderFileName);

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
                    host: vendorInfo.sftp.sftpHost,
                    port: process.env.SFTP_PORT,
                    username: vendorInfo.sftp.sftpUsername,
                    password: vendorInfo.sftp.sftpPassword
                }).then(() => {
                    fs.writeFile(orderFileName, TSV.stringify(orderDataList), function (err) {
                        if (err) {
                            console.log('Writing File Error: ', err);
                        } else {
                            // var currentDate = new Date();
                            // var temp = currentDate.toLocaleString("en-US", {
                            //     hour12: false
                            // }).split('.');
                            // var remotePath = '/incoming/orders/order' + temp[0].replace(' ', '').replace(/\-/g, '').replace(/\//g, '').replace(',', '').replace(/\:/g, '') + '.txt';
                            // sftp.put(orderFileName, remotePath).then(response => {
                            //     res.render('feeds/order', {
                            //         title: 'Order',
                            //         orderList: orderDataList
                            //     });
                            // }).catch(error => console.log('upload error: ', error));

                            addStatus(vendorInfo, connectorInfo, 2, (statusErr) => {
                                if (statusErr) {
                                    return next(statusErr);
                                } else {
                                    res.render('feeds/shipment', {
                                        title: 'Shipment',
                                        orderList: orderDataList
                                    });
                                }
                            });
                        }
                    });
                }).catch((e) => {
                    addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                        if (statusErr) {
                            return next(statusErr);
                        } else {
                            console.log('SFTP connection error: ', e);
                        }
                    });
                });
            }).catch(err => {
                addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                    if (statusErr) {
                        return next(statusErr);
                    } else {
                        console.log('Orders Listing Error: ', err)
                    }
                });
            });
    }
};

const deleteAndInitialize = function (filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) throw err;
            console.log(filePath + ' file has been deleted');
            fs.writeFile(filePath, '', function (initErr) {
                if (initErr) {
                    console.log(initErr);
                }
                console.log('Made inventory file and initialized with empty');
            });
        });
    }
}

const deleteFiles = function (sftpObj, filePathList, callback) {
    if (filePathList.length > 0) {
        filePathList.forEach(filePath => {
            sftpObj.delete('/outgoing/orders/' + filePath).then(result => {
                console.log('App deleted ' + filePath);
            }).catch(deleteError => {
                callback(deleteError);
            });
        });
        callback(null);
    }
}

const addStatus = (vendor, connector, statusFlag, callback) => {
    Status.find({
        vendorId: vendor._id,
        connectorId: connector._id
    }, (err, statuses) => {
        if (err) {
            callback(err);
        } else {
            if (statuses.length == 0) {
                var status = new Status();
                status.vendorId = vendor._id;
                status.vendorName = vendor.api.apiShop;
                status.connectorId = connector._id;
                status.connectorType = connector.kwiLocation;
                status.success = 0;
                status.pending = 0;
                status.error = 0;
                switch (statusFlag) {
                    case 0:
                        status.error = 1;
                        break;
                    case 1:
                        status.pending = 1;
                        break;
                    default:
                        status.success = 1;
                }
                status.save().then(() => {
                    addHistory(vendor, connector, statusFlag, (historyErr) => {
                        if(historyErr) {
                            callback(historyErr);
                        } else {
                            callback(null);
                        }
                    });
                });
            } else {
                var status = statuses[0];
                let statusQuery = '';
                switch (statusFlag) {
                    case 0:
                        statusQuery = {error: 1};
                        break;
                    case 1:
                        statusQuery = {pending: 1};
                        break;
                    default:
                        statusQuery = {success: 1};
                }
                status.updateOne({ $inc: statusQuery},() => {
                    addHistory(vendor, connector, statusFlag, (historyErr) => {
                        if(historyErr) {
                            callback(historyErr);
                        } else {
                            callback(null);
                        }
                    });
                });
            }
        }
    });
};

const addHistory = (vendor, connector, flag, callback) => {
    var history = new History();
    history.vendorId = vendor._id;
    history.vendorName = vendor.api.apiShop;
    history.connectorId = connector._id;
    history.connectorType = connector.kwiLocation;
    history.status = flag;

    history.save().then(() => {
        callback(null);
    }).catch(err => {
        callback(err);
    });
};