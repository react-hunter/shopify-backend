const commonHelper = require('./common')
const fs = require('fs')
const Client = require('ssh2-sftp-client')
const delay = require('delay')
const TSV = require('tsv')

module.exports = {
    inventoryFeedCreate: async (vendorInfo, connectorInfo, callback) => {
        const inventoryFileName = 'uploads/inventory-' + vendorInfo.api.apiShop + '.txt'
        const sftp = new Client()
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
        var inventoryDataList = []
        
        // Initialize product feed file with empty
        commonHelper.deleteAndInitialize(inventoryFileName)

        await delay(2000)
        shopify.product.list()
        .then(products => {
            products.forEach(product => {
                product.variants.forEach(variant => {
                    var inventoryData = {}
                    inventoryData.id = variant.id
                    inventoryData.qty_on_hand = variant.inventory_quantity < 0 ? 0 : variant.inventory_quantity
                    inventoryData.date_available = product.published_at

                    inventoryDataList.push(inventoryData)
                })
            })
        })
        .then(async () => {
            await delay(2000)
            sftp.connect({
                    host: vendorInfo.sftp.sftpHost,
                    port: process.env.SFTP_PORT,
                    username: vendorInfo.sftp.sftpUsername,
                    password: vendorInfo.sftp.sftpPassword
                })
                .then(async () => {
                    await delay(1000)
                    fs.writeFile(inventoryFileName, TSV.stringify(inventoryDataList), (err) => {
                        if (err) {
                            console.log('Writing File Error: ', err)
                            callback({error: 'file'})
                        } else {
                            var currentDate = new Date()
                            var isoDate = currentDate.toLocaleString("en-US", {
                                hour12: false
                            }).split('.')
                            var remotePath = '/incoming/inventory/inventory' + isoDate[0].replace(' ', '').replace(/\-/g, '').replace(/\:/g, '').replace(/\//g, '').replace(',', '') + '.txt'
                            sftp.put(inventoryFileName, remotePath)
                            .then(response => {
                                commonHelper.addStatus(vendorInfo, connectorInfo, 2, (statusErr) => {
                                    if (statusErr) {
                                        callback({error: 'status'})
                                    } else {
                                        callback(null)
                                    }
                                });
                                
                                sftp.end()
                            })
                            .catch(error => {
                                commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                                    if (statusErr) {
                                        callback({error: 'status'})
                                    } else {
                                        callback({error: 'upload'})
                                    }
                                })
                            })
                        }
                    })
                })
                .catch(error => {
                    commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                        if (statusErr) {
                            callback({error: 'status'})
                        } else {
                            callback({error: 'connect'})
                        }
                    })
                })
        })
        .catch(err => {
            commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                if (statusErr) {
                    callback({error: 'status'})
                } else {
                    callback({error: 'store'})
                }
            })
        })
    }
}