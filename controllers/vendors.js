const Vendor = require('../models/Vendor');
const Color  = require('../models/Color');
const Shopify = require('shopify-api-node');
const url = require('url');

/**
 * GET /
 * Vendors Page.
 */
exports.index = (req, res, next) => {
    Vendor.find({}, (err, vendors) => {
        if (err) return next(err);

        res.render('admin/vendor/vendors', {
            title: 'Vendors',
            vendors: vendors
        });
    });
};

exports.addVendor = (req, res, next) => {
    var vendor = new Vendor();

    if (req.query.name) {
        vendor.name = req.query.name;
    }
    if (req.query.brandName) {
        vendor.brandName = req.query.brandName;
    }
    if (req.query.shipMethod) {
        vendor.shipMethod = req.query.shipMethod;
    }
    if (req.query.apiShop) {
        vendor.apiShop = req.query.apiShop;
    }
    if (req.query.apiKey) {
        vendor.apiKey = req.query.apiKey;
    }
    if (req.query.apiPassword) {
        vendor.apiPassword = req.query.apiPassword;
    }
    if (req.query.sftpHost) {
        vendor.sftpHost = req.query.sftpHost;
    }
    if (req.query.sftpUsername) {
        vendor.sftpUsername = req.query.sftpUsername;
    }
    if (req.query.sftpPassword) {
        vendor.sftpPassword = req.query.sftpPassword;
    }
    res.render('admin/vendor/vendorAdd', {
        title: 'Adding Vendor',
        vendorData: vendor
    });
};

exports.saveVendor = (req, res, next) => {
    var vendor = new Vendor({
        name: req.body.name,
        brandName: req.body.brandName,
        shipMethod: req.body.shipMethod,
        active: 'no',
        api: {
            apiShop: req.body.apiShop,
            apiKey: req.body.apiKey,
            apiPassword: req.body.apiPassword
        },
        sftp: {
            sftpHost: req.body.sftpHost,
            sftpUsername: req.body.sftpUsername,
            sftpPassword: req.body.sftpPassword
        }
    });
    if (req.body.brandName == '' || req.body.shipMethod == '' || req.body.apiShop == '' || req.body.apiKey == '' || req.body.apiPassword == '' || req.body.sftpHost == '' || req.body.sftpUsername == '' || req.body.sftpPassword == '') {
        req.flash('errors', {
            msg: 'Shopify API and SFTP information are required. Please try again.'
        });
        res.redirect(url.format({
            pathname: '/vendors/add',
            query: {
                name: req.body.name,
                brandName: req.body.brandName,
                shipMethod: req.body.shipMethod,
                apiShop: req.body.apiShop,
                apiKey: req.body.apiKey,
                apiPassword: req.body.apiPassword,
                sftpHost: req.body.sftpHost,
                sftpUsername: req.body.sftpUsername,
                sftpPassword: req.body.sftpPassword
            }
        }));
        return next();
    }

    vendor.save(err => {
        if (err) {
            return next(err);
        }
        res.redirect('/vendors');
    });
};

exports.getVendor = (req, res, next) => {
    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err);
        }

        res.render('admin/vendor/vendorUpdate', {
            title: 'Update Vendor',
            vendorData: vendor
        });
    });
};

exports.updateVendor = (req, res, next) => {
    Vendor.findById(req.body.vendorId, (err, vendor) => {
        if (err) {
            return next(err);
        }

        vendor.active = 'no';
        vendor.name = req.body.name;
        vendor.brandName = req.body.brandName;
        vendor.shipMethod = req.body.shipMethod;

        vendor.api.apiShop = req.body.apiShop;
        vendor.api.apiKey = req.body.apiKey;
        vendor.api.apiPassword = req.body.apiPassword;
        vendor.sftp.sftpHost = req.body.sftpHost;
        vendor.sftp.sftpUsername = req.body.sftpUsername;
        vendor.sftp.sftpPassword = req.body.sftpPassword;

        if (req.body.brandName == '' || req.body.shipMethod == '' || req.body.apiShop == '' || req.body.apiKey == '' || req.body.apiPassword == '' || req.body.sftpHost == '' || req.body.sftpUsername == '' || req.body.sftpPassword == '') {
            req.flash('errors', {
                msg: 'Shopify API and SFTP information are required. Please try again.'
            });
            res.redirect('/vendors/' + req.body.vendorId);
            return next();
        } else {
            vendor.save(err => {
                if (err) {
                    return next(err);
                }
                if (req.user.type == 'superadmin') {
                    res.redirect('/vendors');
                    return next();
                } else {
                    req.flash('success', {
                        msg: 'You have updated vendor data successfully.'
                    });
                    res.redirect('/');
                }
            });
        }
    });
};

exports.enableVendor = (req, res, next) => {
    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err);
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
        });
        shopify.product.list({
            limit: 2,
            published_status: 'published'
        }).then(products => {
            if (products.length < 1) {
                req.flash('errors', {
                    msg: 'This vendor does not have any published products.'
                });
                res.redirect('/vendors');
                return next();
            } else {
                vendor.active = 'yes';
                vendor.activeDate = Date();
                vendor.save(err => {
                    if (err) {
                        return next(err);
                    }
                    req.flash('info', {
                        msg: 'You have enabled vendor successfully.'
                    });
                    res.redirect('/vendors');
                    return next();
                });
            }
        }).catch(e => {
            req.flash('errors', {
                msg: 'This vendor does not have correct information. You can not get products from store with this vendor.'
            });
            res.redirect('/vendors');
        });
    });
};

exports.disableVendor = (req, res, next) => {
    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err);
        }

        if (vendor.hasTransaction) {
            req.flash('info', {
                msg: 'This vendor has transactions. You can not disable this user now.'
            });
            res.redirect('/vendors');
            return next();
        }

        vendor.active = 'no';
        vendor.save(err => {
            if (err) {
                return next(err);
            }
            res.redirect('/vendors');
        });
    });
};

exports.deleteVendor = (req, res, next) => {
    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err);
        }

        if (vendor.hasTransaction) {
            req.flash('info', {
                msg: 'This vendor has transactions. You can not delete this user now.'
            });
            res.redirect('/vendors');
            return next();
        } else {
            Vendor.deleteOne({
                _id: req.params.vendorId
            }, err => {
                if (err) {
                    return next(err);
                }
                req.flash('success', {
                    msg: 'Vendor has been deleted successfully.'
                });
                res.redirect('/vendors');
            });
        }
    });
};

exports.synchronizeColors = (req, res, next) => {
    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err);
        }
        if (vendor.active != 'yes') {
            console.log('enter inactive vendor');
            req.flash('errors', {
                msg: 'To apply colors, you should enable this vendor.'
            });
            res.redirect('/vendors');
            return next();
        }
        var dbColors = [], dbColorList = [], dbColorShortnameList = [], originalColorValue;
        var proColorList = [];
        // Get current color list in db.
        Color.findOne({}, (colorError, colorValue) => {
            if (colorError) {
                return next(colorError);
            }
            originalColorValue = colorValue;
            dbColors = colorValue.colorList;
            dbColors.forEach(dbColor => {
                dbColorList.push(dbColor.colorName);
                dbColorShortnameList.push(dbColor.shortName);
            });
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
        });

        shopify.product.list({
            limit: 250
        }).then(products => {
            products.forEach(pro => {
                pro.options.forEach(opt => {
                    if (opt.name.toLowerCase() === 'color') {
                        opt.values.forEach(colorItem => {
                            if (proColorList.indexOf(colorItem.toLowerCase()) == -1 && dbColorList.indexOf(colorItem.toLowerCase()) == -1) {
                                proColorList.push(colorItem.toLowerCase());
                            }
                        });
                    }
                });
            });
            return proColorList;
        }).then(colors => {
            colors.forEach(colorItem => {
                var shortColor = '';
                shortColor = generateShortColor(colorItem);
                if (dbColorShortnameList.indexOf(shortColor) != -1) {
                    // regenerate short color
                    shortColor = generateShortColor(colorItem, 1);
                } else {
                    dbColorList.push(colorItem);
                    dbColorShortnameList.push(shortColor);
                    dbColors.push({colorName: colorItem, shortName: shortColor});
                }
            });
            originalColorValue.colorList = dbColors;
            originalColorValue.save(() => {
                vendor.colorSynched = 'yes';
                vendor.save(() => {
                    req.flash('success', {
                        msg: 'You have applied the colors in products of this store successfully.'
                    });
                    res.redirect('/vendors');
                    return next();
                });
            });
        }).catch(e => {
            req.flash('errors', {
                msg: 'This vendor does not have correct information. You can not get products from store with this vendor.'
            });
            res.redirect('/vendors');
        })
    });
};

const generateShortColor = (originalColor, flag = 0) => {
    var splittedColorString = [];
    var shortenColor = '';
    
    // split string with special sign if it includes
    if (originalColor.indexOf(' ') != -1) {
        splittedColorString = originalColor.split(' ');
    } else if (originalColor.indexOf('-') != -1) {
        splittedColorString = originalColor.split('-');
    } else if (originalColor.indexOf('/') != -1) {
        splittedColorString = originalColor.split('/');
    } else {
        splittedColorString.push(originalColor);
    }

    if (splittedColorString.length == 1) {
        shortenColor = splittedColorString[0].substr(0, 1) + splittedColorString[0].substr(Math.round((splittedColorString[0].length + flag) / 2)-1, 1) + splittedColorString[0].substr(-1)
    } else if (splittedColorString.length == 2) {
        shortenColor = splittedColorString[0].substr(0, 1) + splittedColorString[1].substr(0, 1) + splittedColorString[1].substr(-1)
    } else if (splittedColorString.length > 2) {
        shortenColor = splittedColorString[0].substr(0, 1) + splittedColorString[1].substr(0, 1) + splittedColorString[2].substr(0, 1);
    }
    
    return shortenColor.toUpperCase();
};