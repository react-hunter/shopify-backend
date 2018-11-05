const User = require('../models/User');
const Connector = require('../models/Connector');

const url = require('url');

/**
 * GET /
 * Vendors Page.
 */
exports.index = (req, res, next) => {
    User.find({
        type: 'vendor'
    }, (err, vendors) => {
        if (err) return next(err);

        res.render('admin/vendor/vendors', {
            title: 'Vendors',
            vendors: vendors
        });
    });
};

exports.addVendor = (req, res, next) => {
    var vendor = new User();

    if (req.query.email) {
        vendor.email = req.query.email;
    }
    if (req.query.name) {
        vendor.name = req.query.name;
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
    var vendor = new User({
        email: req.body.email,
        password: req.body.password,
        profile: {
            name: req.body.name
        },
        type: 'vendor',
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
    if (req.body.password != req.body.confirmpassword || req.body.password == '') {
        req.flash('info', {
            msg: 'Password is not matched. Please try again.'
        });
        res.redirect(url.format({
            pathname: '/vendors/add',
            query: {
                email: req.body.email,
                name: req.body.name,
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

    vendor.save((err) => {
        if (err) {
            return next(err);
        }
        res.redirect('/vendors');
    });
};

exports.getVendor = (req, res, next) => {
    User.findById(req.params.vendorId, (err, vendor) => {
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
    User.findById(req.body.vendorId, (err, vendor) => {
        if (err) {
            return next(err);
        }
        
        vendor.email = req.body.email;
        vendor.active = 'no';
        if (req.body.password != '') {
            vendor.password = req.body.password;
        }
        vendor.profile.name = req.body.name;

        vendor.api.apiShop = req.body.apiShop;
        vendor.api.apiKey = req.body.apiKey;
        vendor.api.apiPassword = req.body.apiPassword;
        vendor.sftp.sftpHost = req.body.sftpHost;
        vendor.sftp.sftpUsername = req.body.sftpUsername;
        vendor.sftp.sftpPassword = req.body.sftpPassword;

        vendor.save((err) => {
            if (err) {
                return next(err);
            }

            res.redirect('/vendors');
        });
    });
};

exports.enableVendor = (req, res, next) => {
    User.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err);
        }

        vendor.active = 'yes';
        vendor.activeDate = Date();
        vendor.save(err => {
            if (err) {
                return next(err);
            }
            res.redirect('/vendors');
        });
    });
};

exports.disableVendor = (req, res, next) => {
    console.log('params: ', req.params);
    User.findById(req.params.vendorId, (err, vendor) => {
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
    User.findById(req.params.vendorId, (err, vendor) => {
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
            User.deleteOne({
                _id: req.params.vendorId
            }, err => {
                if (err) {
                    return next(err);
                }
                req.flash('info', {
                    msg: 'Vendor has been deleted successfully.'
                });
                res.redirect('/vendors');
            });
        }
    });
};
