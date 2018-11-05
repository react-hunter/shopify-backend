const Shopify = require('shopify-api-node');
const fs = require('fs');
const Client = require('ssh2-sftp-client');
const TSV = require('tsv');

/**
 * GET /
 * Refund page.
 */
exports.index = (req, res) => {

    const shopify = new Shopify({
        shopName: process.env.SHOPIFY_STORE_NAME,
        apiKey: process.env.SHOPIFY_APP_KEY,
        password: process.env.SHOPIFY_APP_PASSWORD
    });

    const sftp = new Client();
    var refundDataList = new Array();

    shopify.order.list()
        .then(orders => {
            orders.forEach(order => {
                shopify.refund.list(order.id)
                    .then(refunds => {
                        refunds.forEach(refund => {
                            if (refund.refund_line_items.length > 0) {
                                refund.refund_line_items.forEach(refundItem => {
                                    var refundData = {};
                                    console.log('refund item data:', refundItem.line_item);
                                    refundData.original_order_number = refund.order_id;
                                    // refundData.rma_number = 
                                    refundData.item_sku = refundItem.sku;
                                    refundData.date_requested = refund.created_at;
                                    refundData.qty_requested = refundItem.quantity;
                                    refundData.date_received = refund.processed_at;
                                    // refundData.qty_received = 
                                    refundData.reason = refund.order_adjustments[0].reason;
                                    refundData.retailer_order_number = order.number;
                                    // refundData.retailer_rma_number = 
                                    refundData.item_status = refundItem.line_item.fulfillment_status;

                                    refundDataList.push(refundData);
                                });
                            }
                        });
                    })
                    .catch(err => console.log(err));
            });
        })
        .then(() => {
            sftp.connect({
                    host: process.env.SFTP_HOST,
                    port: process.env.SFTP_PORT,
                    username: process.env.SFTP_USERNAME,
                    password: process.env.SFTP_PASSWORD
                })
                .then(() => {
                    fs.writeFile("uploads/return.txt", TSV.stringify(refundDataList), function (err) {
                        if (err) {
                            console.log(err);
                        } else {
                            var currentDate = new Date();
                            var temp = currentDate.toLocaleString("en-US", {hour12: false}).split('.');
                            var remotePath = '/incoming/returns/return' + temp[0].replace(' ', '').replace(',', '').replace(/\-/g, '').replace(/\//g, '').replace(/\:/g, '') + '.txt';
                            sftp.put('uploads/return.txt', remotePath)
                                .then(response => {
                                    res.render('feeds/refund', {
                                        title: 'Refund',
                                        refundList: refundDataList
                                    });
                                })
                                .catch(error => console.log('upload error: ', error));
                        }
                    });
                });
        })
        .catch(err => console.log(err));
};