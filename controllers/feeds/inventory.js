const Shopify = require('shopify-api-node');
const fs = require('fs');
const Client = require('ssh2-sftp-client');
const delay = require('delay');
const TSV = require('tsv');

/**
 * GET /
 * Inventory page.
 */
exports.index = (req, res, next) => {

    const userData = req.user;
    if (userData.api.apiShop == '' || userData.api.apiKey == '' || userData.api.apiPassword == '') {
        req.flash('info', {
            msg: 'You should insert API information to manage Inventory Feed.'
        });
        res.redirect('/');
        return next();
    }
    if (userData.sftp.sftpHost == '' || userData.sftp.sftpPassword == '' || userData.sftp.sftpUsername == '') {
        req.flash('info', {
            msg: 'You should insert SFTP information to manage Inventory Feed.'
        });
        res.redirect('/');
        return next();
    }

    const shopify = new Shopify({
        shopName: userData.api.apiShop,
        apiKey: userData.api.apiKey,
        password: userData.api.apiPassword
    });

    const sftp = new Client();
    var inventoryDataList = new Array();

    deleteAndInitialize('uploads/inventory.txt');

    shopify.collect.list()
        .then(collects => {
            console.log('collect list: ', collects);
            collects.forEach(collect => {
                shopify.product.get(collect.product_id)
                    .then(product => {
                        console.log('Product Data: ', product);
                        product.variants.forEach(variant => {
                            var inventoryData = {};
                            inventoryData.id = variant.id;
                            inventoryData.qty_on_hand = variant.inventory_quantity < 0 ? 0 : variant.inventory_quantity;
                            inventoryData.date_available = product.published_at;

                            inventoryDataList.push(inventoryData);
                        });
                    })
                    .catch(inventoryError => console.log('inventoryError: ', inventoryError));

            });
        })
        .then(() => {
            sftp.connect({
                    host: userData.sftp.sftpHost,
                    port: process.env.SFTP_PORT,
                    username: userData.sftp.sftpUsername,
                    password: userData.sftp.sftpPassword
                })
                .then(() => {
                    console.log('sftp connected !');
                    console.log('inventoryData: ', inventoryDataList);
                    fs.writeFile("uploads/inventory.txt", TSV.stringify(inventoryDataList), function (err) {
                        if (err) {
                            console.log('Writing File Error: ', err);
                        } else {
                            // delay(1000);
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