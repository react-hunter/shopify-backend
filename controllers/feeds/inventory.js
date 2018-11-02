const Shopify = require('shopify-api-node');
const fs = require('fs');
const Client = require('ssh2-sftp-client');
const delay = require('delay');
const TSV = require('tsv');

/**
 * GET /
 * Inventory page.
 */
exports.index = (req, res) => {

    const shopify = new Shopify({
        shopName: process.env.SHOPIFY_STORE_NAME,
        apiKey: process.env.SHOPIFY_APP_KEY,
        password: process.env.SHOPIFY_APP_PASSWORD
    });

    const sftp = new Client();
    var inventoryDataList = new Array();

    deleteAndInitialize('uploads/inventory.txt');

    shopify.collect.list()
        .then(collects => {
            collects.forEach(collect => {
                shopify.product.get(collect.product_id)
                    .then(product => {
                        product.variants.forEach(variant => {
                            var inventoryData = {};
                            inventoryData.id = variant.id;
                            inventoryData.qty_on_hand = variant.inventory_quantity < 0 ? 0 : variant.inventory_quantity;
                            inventoryData.date_available = product.published_at;

                            inventoryDataList.push(inventoryData);
                        });
                    })
                    .catch(inventoryError => console.log('inventoryError: ', inventoryError));

            })
        })
        .then(() => {
            sftp.connect({
                    host: process.env.SFTP_HOST,
                    port: process.env.SFTP_PORT,
                    username: process.env.SFTP_USERNAME,
                    password: process.env.SFTP_PASSWORD
                })
                .then(() => {
                    fs.writeFile("uploads/inventory.txt", TSV.stringify(inventoryDataList), function (err) {
                        if (err) {
                            console.log(err);
                        } else {
                            var currentDate = new Date();
                            var temp = currentDate.toLocaleString().split('.');
                            var remotePath = '/incoming/inventory/inventory' + temp[0].replace(' ', '').replace(/\-/g, '').replace(/\:/g, '') + '.txt';
                            sftp.put('uploads/inventory.txt', remotePath)
                                .then(response => {
                                    res.render('feeds/inventory', {
                                        title: 'Inventory',
                                        inventoryList: inventoryDataList
                                    });
                                })
                                .catch(error => console.log('upload error: ', error));
                        }
                    });
                })
                .catch(error => console.log('connect error: ', error));
        })
        .catch(err => console.log('collectError: ', err));

};

const deleteAndInitialize = function (filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) throw err;
            console.log(filePath + ' file was deleted');
            fs.writeFile(filePath, '', function (initErr) {
                if (initErr) {
                    console.log(initErr);
                }
                console.log('init empty');
            });
        });
    }
}