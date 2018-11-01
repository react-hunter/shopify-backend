const User = require('../models/User');
const Connector = require('../models/Connector');

const url = require('url');

/**
 * GET /
 * Users Page.
 */
exports.index = (req, res, next) => {
    User.find({
        $or: [{
            type: 'user'
        }, {
            type: 'readonly'
        }]
    }, (err, users) => {
        if (err) return next(err);

        res.render('admin/user/users', {
            title: 'Users',
            users: users
        });
    });
};

exports.addUser = (req, res, next) => {
    var user = new User();
    if(req.query.email) {
        user.email = req.query.email;
    }
    if(req.query.name) {
        user.name = req.query.name;
    }
    if(req.query.clientName) {
        user.clientName = req.query.clientName;
    }
    if(req.query.domain) {
        user.domain = req.query.domain;
    }
    if(req.query.connectors) {
        user.connectors = req.query.connectors;
    }
    res.render('admin/user/userAdd', {
        title: 'Adding User',
        userData: user
    });
};

exports.saveUser = (req, res, next) => {
    var user = new User();
    user.email = req.body.email;
    user.profile.name = req.body.name;
    user.partnerClient.name = req.body.clientName;
    user.partnerClient.domain = req.body.domain;
    user.partnerClient.connectors = req.body.connectors;
    user.type = 'readonly';
    if(req.body.password != '') {
        user.password = req.body.password;
    }
    if (req.body.password != req.body.confirmpassword) {
        req.flash('info', {
            msg: 'Password is not matched. Please try again.'
        });
        res.redirect(url.format({
            pathname: '/users/add',
            query: {
                email: req.body.email,
                name: req.body.name,
                clientName: req.body.clientName,
                domain: req.body.domain,
                connectors: req.body.connectors
            }
        }));
        return next();
    }

    user.save((err) => {
        if (err) {
            return next(err);
        }
        req.flash('info', {
            msg: 'User has been added successfully.'
        });
        res.redirect('/users');
    });
};

exports.getUser = (req, res, next) => {
    User.findById(req.params.userId, (err, user) => {
        if (err) {
            return next(err);
        }

        res.render('admin/user/userUpdate', {
            title: 'Update User',
            userData: user
        });
    });
};

exports.updateUser = (req, res, next) => {
    User.findById(req.body.userId, (err, user) => {
        if (err) {
            return next(err);
        }

        user.email = req.body.email;
        user.active = 'no';
        user.profile.name = req.body.name;

        user.partnerClient.name = req.body.clientName;
        user.partnerClient.domain = req.body.domain;
        user.partnerClient.connectors = req.body.connectors;
        if (req.body.password != '') {
            user.password = req.body.password;
            if (req.body.password != req.body.confirmpassword) {
                req.flash('info', {
                    msg: 'Password is not matched. Please try again.'
                });
                res.redirect('/users/' + userId);
                return next();
            }
        } else {
            user.save((err) => {
                if (err) {
                    return next(err);
                }

                res.redirect('/users');
            });
        }
    });
};

exports.activateUser = (req, res, next) => {
    User.findById(req.params.userId, (err, user) => {
        if (err) {
            return next(err);
        }

        var newUserData = user;
        user.active = 'yes';
        newUserData.save(err => {
            if (err) {
                return next(err);
            }
            res.redirect('/users');
        });
    });
};

exports.deactivateUser = (req, res, next) => {
    User.findById(req.params.userId, (err, user) => {
        if (err) {
            return next(err);
        }
        // var newUserData = user;
        user.active = 'no';
        user.save(err => {
            if (err) {
                return next(err);
            }
            res.redirect('/users');
        });
    });
};

exports.deleteUser = (req, res, next) => {
    User.deleteOne({
        _id: req.params.userId
    }, err => {
        if (err) {
            return next(err);
        }

        res.redirect('/users');
    });
}