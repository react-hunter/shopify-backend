const Vendor = require('../models/Vendor')
const Color = require('../models/Color')
const Shopify = require('shopify-api-node')
const Client = require('ssh2-sftp-client')
const url = require('url')

/**
 * GET /
 * Vendors Page.
 */
exports.index = (req, res, next) => {
    Vendor.find({}, (err, vendors) => {
        if (err) return next(err)

        res.render('admin/vendor/vendors', {
            title: 'Vendors',
            vendors: vendors
        })
    })
}

exports.addVendor = (req, res, next) => {
    var vendor = new Vendor()

    if (req.query.name) {
        vendor.name = req.query.name
    }
    if (req.query.brandName) {
        vendor.brandName = req.query.brandName
    }
    if (req.query.shipMethod) {
        vendor.shipMethod = req.query.shipMethod
    }
    if (req.query.apiShop) {
        vendor.apiShop = req.query.apiShop
    }
    if (req.query.apiKey) {
        vendor.apiKey = req.query.apiKey
    }
    if (req.query.sharedSecret) {
        vendor.sharedSecret = req.query.sharedSecret
    }
    if (req.query.apiPassword) {
        vendor.apiPassword = req.query.apiPassword
    }
    if (req.query.sftpHost) {
        vendor.sftpHost = req.query.sftpHost
    }
    if (req.query.sftpUsername) {
        vendor.sftpUsername = req.query.sftpUsername
    }
    if (req.query.sftpPassword) {
        vendor.sftpPassword = req.query.sftpPassword
    }
    res.render('admin/vendor/vendorAdd', {
        title: 'Adding Vendor',
        vendorData: vendor
    })
}

exports.saveVendor = (req, res, next) => {
    var vendor = new Vendor({
        name: req.body.name,
        brandName: req.body.brandName,
        shipMethod: req.body.shipMethod,
        active: 'no',
        api: {
            apiShop: req.body.apiShop,
            apiKey: req.body.apiKey,
            apiPassword: req.body.apiPassword,
            sharedSecret: req.body.sharedSecret,
        },
        sftp: {
            sftpHost: req.body.sftpHost,
            sftpUsername: req.body.sftpUsername,
            sftpPassword: req.body.sftpPassword
        }
    })
    if (req.body.brandName == '' || req.body.shipMethod == '' || req.body.apiShop == '' || req.body.apiKey == '' || req.body.apiPassword == '' || req.body.sharedSecret == '' || req.body.sftpHost == '' || req.body.sftpUsername == '' || req.body.sftpPassword == '') {
        req.flash('errors', {
            msg: 'Shopify API and SFTP information are required. Please try again.'
        })
        res.redirect(url.format({
            pathname: '/vendors/add',
            query: {
                name: req.body.name,
                brandName: req.body.brandName,
                shipMethod: req.body.shipMethod,
                apiShop: req.body.apiShop,
                apiKey: req.body.apiKey,
                apiPassword: req.body.apiPassword,
                sharedSecret: req.body.sharedSecret,
                sftpHost: req.body.sftpHost,
                sftpUsername: req.body.sftpUsername,
                sftpPassword: req.body.sftpPassword
            }
        }))
        return next()
    }

    vendor.save(err => {
        if (err) {
            return next(err)
        }
        res.redirect('/vendors')
    })
}

exports.getVendor = (req, res, next) => {
    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err)
        }

        res.render('admin/vendor/vendorUpdate', {
            title: 'Update Vendor',
            vendorData: vendor
        })
    })
}

exports.updateVendor = (req, res, next) => {
    Vendor.findById(req.body.vendorId, (err, vendor) => {
        if (err) {
            return next(err)
        }
        vendor.active = 'no'
        vendor.name = req.body.name
        vendor.brandName = req.body.brandName
        vendor.shipMethod = req.body.shipMethod

        vendor.api = {
            apiShop: req.body.apiShop,
            apiKey: req.body.apiKey,
            apiPassword: req.body.apiPassword,
            sharedSecret: req.body.sharedSecret,
        }
        vendor.sftp = {
            sftpHost: req.body.sftpHost,
            sftpUsername: req.body.sftpUsername,
            sftpPassword: req.body.sftpPassword
        }

        if (req.body.brandName == '' || req.body.shipMethod == '' || req.body.apiShop == '' || req.body.apiKey == '' || req.body.apiPassword == '' || req.body.sharedSecret == '' || req.body.sftpHost == '' || req.body.sftpUsername == '' || req.body.sftpPassword == '') {
            req.flash('errors', {
                msg: 'Shopify API and SFTP information are required. Please try again.'
            })
            res.redirect('/vendors/' + req.body.vendorId)
            return next()
        } else {
            vendor.save(err => {
                if (err) {
                    return next(err)
                }
                const shopifyObj = new Shopify({
                    shopName: vendor.api.apiShop,
                    apiKey: vendor.api.apiKey,
                    password: vendor.api.apiPassword,
                    timeout: 50000,
                    autoLimit: {
                        calls: 2,
                        interval: 1000,
                        bucketSize: 35
                    }
                })
                removeWebhookList(shopifyObj, (removeError) => {
                    if (removeError) {
                        req.flash('success', {
                            msg: 'You have updated vendor data successfully.'
                        })
                        res.redirect('/')
                    } else {
                        if (req.user.type == 'superadmin') {
                            res.redirect('/vendors')
                            return next()
                        } else {
                            req.flash('success', {
                                msg: 'You have updated vendor data successfully.'
                            })
                            res.redirect('/')
                        }
                    }
                })
            })
        }
    })
}

exports.enableVendor = (req, res, next) => {
    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err)
        }

        const shopify = new Shopify({
            shopName: vendor.api.apiShop,
            apiKey: vendor.api.apiKey,
            password: vendor.api.apiPassword,
            timeout: 50000,
            autoLimit: {
                calls: 2,
                interval: 1000,
                bucketSize: 35
            }
        })
        shopify.product.list({
            limit: 2,
            published_status: 'published'
        }).then(products => {  // check if the information of shopify app is correct
            if (products.length < 1) {
                req.flash('errors', {
                    msg: 'This vendor does not have any published products.'
                })
                res.redirect('/vendors')
                return next()
            } else {
                const sftp = new Client()
                sftp.connect({
                    host: vendor.sftp.sftpHost,
                    port: process.env.SFTP_PORT,
                    username: vendor.sftp.sftpUsername,
                    password: vendor.sftp.sftpPassword
                }).then(() => {
                    const productCreateWebhook = {
                        'topic': 'products/create',
                        'address': 'https://content-commerce.herokuapp.com/webhook/productChange',
                        'format': 'json'
                    }
                    const productUpdateWebhook = {
                        'topic': 'products/update',
                        'address': 'https://content-commerce.herokuapp.com/webhook/productChange',
                        'format': 'json'
                    }
                    const productDeleteWebhook = {
                        'topic': 'products/delete',
                        'address': 'https://content-commerce.herokuapp.com/webhook/productChange',
                        'format': 'json'
                    }
                    const orderFulfillWebhook = {
                        'topic': 'orders/fulfilled',
                        'address': 'https://content-commerce.herokuapp.com/webhook/fulfill',
                        'format': 'json'
                    }
    
                    const orderPartialFulfillWebhook = {
                        'topic': 'orders/partially_fulfilled',
                        'address': 'https://content-commerce.herokuapp.com/webhook/fulfill',
                        'format': 'json'
                    }
                    
                    var webhookPromises = [];
                    
                    
                    shopify.webhook.list().then(webhooks => {
                        webhooks.forEach(webhookItem => {
                            if (webhookItem.address.indexOf('content-commerce') != -1) {
                                webhookPromises.push(shopify.webhook.delete(webhookItem.id))
                            }
                        })
                    }).then(() => {
                        webhookPromises.push(shopify.webhook.create(productCreateWebhook))
                        // webhookPromises.push(shopify.webhook.create(productUpdateWebhook))
                        webhookPromises.push(shopify.webhook.create(productDeleteWebhook))
                        webhookPromises.push(shopify.webhook.create(orderFulfillWebhook))
                        webhookPromises.push(shopify.webhook.create(orderPartialFulfillWebhook))
                    }).then(() => {
                        Promise.all(webhookPromises).then(webhookCreateResponse => {
                            console.log('product create webhook response: ', webhookCreateResponse)
                            vendor.active = 'yes'
                            vendor.activeDate = Date()
                            vendor.save(err => {
                                if (err) {
                                    return next(err)
                                }
                                req.flash('info', {
                                    msg: 'You have enabled vendor successfully.'
                                })
                                res.redirect('/vendors')
                                return next()
                            })
                        }).catch(productWebhookError => {
                            console.log(productWebhookError)
                            req.flash('errors', {
                                msg: 'Error in creating product webhook.'
                            })
                            res.redirect('/vendors')
                            return next()
                        })
                    }).catch(webhookError => {
                        console.log('Error in webhook: ', webhookError)
                    })
                }).catch(sftpError => {
                    console.log('sftp error: ', sftpError)
                    req.flash('errors', {
                        msg: 'SFTP information of this vendor is not correct.'
                    })
                    res.redirect('/vendors')
                    return next()
                })
                
                
            }
        }).catch(e => {
            req.flash('errors', {
                msg: 'This vendor does not have correct information. You can not get products from store with this vendor.'
            })
            res.redirect('/vendors')
        })
    })
}

exports.disableVendor = (req, res, next) => {
    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err)
        }
        
        if (vendor.hasTransaction) {
            req.flash('info', {
                msg: 'This vendor has transactions. You can not disable this user now.'
            })
            res.redirect('/vendors')
            return next()
        }
        
        var shopify = new Shopify({
            shopName: vendor.api.apiShop,
            apiKey: vendor.api.apiKey,
            password: vendor.api.apiPassword,
            timeout: 50000,
            autoLimit: {
                calls: 2,
                interval: 1000,
                bucketSize: 35
            }
        })
        
        shopify.webhook.list().then(webhookList => {
            var webhookPromises = []
            webhookList.forEach(webhookItem => {
                if (webhookItem.address.indexOf('content-commerce') != -1) {
                    webhookPromises.push(shopify.webhook.delete(webhookItem.id))
                }
            })
            Promise.all(webhookPromises).then(webhookDeleteResponse => {
                vendor.active = 'no'
                vendor.save(err => {
                    if (err) {
                        return next(err)
                    }
                    res.redirect('/vendors')
                })
            }).catch(webhookDeleteError => {
                console.log('Error in deleting webhooks')
                req.flash('errors', {
                    msg: 'There is a problem in deleting webhooks.'
                })
                res.redirect('/vendors')
                return next()
            })
        })

    })
}

exports.deleteVendor = (req, res, next) => {
    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err)
        }

        if (vendor.hasTransaction) {
            req.flash('info', {
                msg: 'This vendor has transactions. You can not delete this user now.'
            })
            res.redirect('/vendors')
            return next()
        } else {
            var shopify = new Shopify({
                shopName: vendor.api.apiShop,
                apiKey: vendor.api.apiKey,
                password: vendor.api.apiPassword,
                timeout: 50000,
                autoLimit: {
                    calls: 2,
                    interval: 1000,
                    bucketSize: 35
                }
            })

            shopify.webhook.list().then(webhookList => {
                var webhookPromises = []
                webhookList.forEach(webhookItem => {
                    if (webhookItem.address.indexOf('content-commerce') != -1) {
                        webhookPromises.push(shopify.webhook.delete(webhookItem.id))
                    }
                })
                Promise.all(webhookPromises).then(webhookDeleteResponse => {
                    Vendor.deleteOne({
                        _id: req.params.vendorId
                    }, err => {
                        if (err) {
                            return next(err)
                        }
                        req.flash('success', {
                            msg: 'Vendor has been deleted successfully.'
                        })
                        res.redirect('/vendors')
                    })
                }).catch(webhookDeleteError => {
                    console.log('Error in deleting webhooks')
                    req.flash('errors', {
                        msg: 'There is a problem in deleting webhooks.'
                    })
                    res.redirect('/vendors')
                    return next()
                })
            })
        }
    })
}

exports.synchronizeColors = (req, res, next) => {
    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err)
        }
        if (vendor.active != 'yes') {
            console.log('enter inactive vendor')
            req.flash('errors', {
                msg: 'To apply colors, you should enable this vendor.'
            })
            res.redirect('/vendors')
            return next()
        }
        var dbColors = [],
            dbColorList = [],
            dbColorShortnameList = [],
            originalColorValue
        var proColorList = []
        // Get current color list in db.
        Color.findOne({}, (colorError, colorValue) => {
            if (colorError) {
                return next(colorError)
            }
            originalColorValue = colorValue
            dbColors = colorValue.colorList
            dbColors.forEach(dbColor => {
                dbColorList.push(dbColor.colorName)
                dbColorShortnameList.push(dbColor.shortName)
            })
        })

        const shopify = new Shopify({
            shopName: vendor.api.apiShop,
            apiKey: vendor.api.apiKey,
            password: vendor.api.apiPassword,
            timeout: 50000,
            autoLimit: {
                calls: 2,
                interval: 1000,
                bucketSize: 35
            }
        })

        shopify.product.list({
            limit: 250
        }).then(products => {
            products.forEach(pro => {
                pro.options.forEach(optionItem => {
                    if (optionItem.name.toLowerCase() === 'color') {
                        optionItem.values.forEach(colorItem => {
                            if (proColorList.indexOf(colorItem.toLowerCase()) == -1 && dbColorList.indexOf(colorItem.toLowerCase()) == -1) {
                                proColorList.push(colorItem.toLowerCase())
                            }
                        })
                    }
                })
            })
            return proColorList
        }).then(colors => {
            colors.forEach(colorItem => {
                var shortColor = ''
                shortColor = generateShortColor(colorItem)
                if (dbColorShortnameList.indexOf(shortColor) != -1) {
                    // If generated colorname exists in db, regenerate short color.
                    shortColor = generateShortColor(colorItem, 1)
                } else {
                    dbColorList.push(colorItem)
                    dbColorShortnameList.push(shortColor)
                    dbColors.push({
                        colorName: colorItem,
                        shortName: shortColor
                    })
                }
            })
            originalColorValue.colorList = dbColors
            originalColorValue.save(() => {
                vendor.colorSynched = 'yes'
                vendor.save(() => {
                    req.flash('success', {
                        msg: 'You have applied the colors in products of this store successfully.'
                    })
                    res.redirect('/vendors')
                    return next()
                })
            })
        }).catch(e => {
            req.flash('errors', {
                msg: 'This vendor does not have correct information. You can not get products from store with this vendor.'
            })
            res.redirect('/vendors')
        })
    })
}

const generateShortColor = (originalColor, flag = 0) => {
    var splittedColorString = []
    var shortenColor = ''

    // split string with special sign if it includes
    if (originalColor.indexOf(' ') != -1) {
        splittedColorString = originalColor.split(' ')
    } else if (originalColor.indexOf('-') != -1) {
        splittedColorString = originalColor.split('-')
    } else if (originalColor.indexOf('/') != -1) {
        splittedColorString = originalColor.split('/')
    } else {
        splittedColorString.push(originalColor)
    }

    if (splittedColorString.length == 1) {
        shortenColor = splittedColorString[0].substr(0, 1) + splittedColorString[0].substr(Math.round((splittedColorString[0].length + flag) / 2) - 1, 1) + splittedColorString[0].substr(-1)
    } else if (splittedColorString.length == 2) {
        shortenColor = splittedColorString[0].substr(0, 1) + splittedColorString[1].substr(0, 1) + splittedColorString[1].substr(-1)
    } else if (splittedColorString.length > 2) {
        shortenColor = splittedColorString[0].substr(0, 1) + splittedColorString[1].substr(0, 1) + splittedColorString[2].substr(0, 1)
    }

    return shortenColor.toUpperCase()
}

const removeWebhookList = (shopifyObj, callback) => {
    shopifyObj.webhook.list().then(webhookList => {
        var webhookPromises = []
        webhookList.forEach(webhookItem => {
            if (webhookItem.address.indexOf('content-commerce') != -1) {
                webhookPromises.push(shopifyObj.webhook.delete(webhookItem.id))
            }
        })
        Promise.all(webhookPromises).then(webhookDeleteResponse => {
            callback(null)
        }).catch(webhookDeleteError => {
            callback(webhookDeleteError)
        })
    })
}