const User = require('../models/User');
const Connector = require('../models/Connector');

const url = require('url');

/**
 * GET /
 * Users Page.
 * Input: none
 * Output: users data
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

/**
 * GET /
 * Input: none
 * Output: Inputed data
 * functionality: Redirect to User Add page with previous inputed
 */
exports.addUser = (req, res, next) => {
    var user = new User();
    if (req.query.email) {
        user.email = req.query.email;
    }
    if (req.query.name) {
        user.name = req.query.name;
    }
    if (req.query.clientName) {
        user.clientName = req.query.clientName;
    }
    if (req.query.domain) {
        user.domain = req.query.domain;
    }
    if (req.query.connectors) {
        user.connectors = req.query.connectors;
    }
    res.render('admin/user/userAdd', {
        title: 'Adding User',
        userData: user
    });
};

/**
 * GET /
 * Input: User Data
 * Output: None
 * Functionality: Save user data into db with inputed data.
 */
exports.saveUser = (req, res, next) => {
    var user = new User();
    user.email = req.body.email;
    user.active = 'no';
    user.profile.name = req.body.name;
    user.partnerClient.name = req.body.clientName;
    user.partnerClient.domain = req.body.domain;
    user.partnerClient.connectors = req.body.connectors;
    user.type = 'readonly';
    if (req.body.password != '') {
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

    user.save(err => {
        if (err) {
            return next(err);
        }
        req.flash('info', {
            msg: 'User has been added successfully.'
        });
        res.redirect('/users');
    });
};

/**
 * GET /
 * Input: userId
 * Output: users data
 * Functionality: With user data by userId, redirect to user page.
 */
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

/**
 * GET /
 * Input: userId and updated User Data
 * Output: none
 * Functionality: Update user data by inputed data.
 */
exports.updateUser = (req, res, next) => {
    User.findById(req.body.userId, (err, user) => {
        if (err) {
            return next(err);
        }

        user.email = req.body.email;
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
            user.save(err => {
                if (err) {
                    return next(err);
                }

                res.redirect('/users');
            });
        }
    });
};

/**
 * GET /
 * Input: userId
 * Output: None
 * Functionality: Activate User. In a word, active field to 'yes'
 */
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

/**
 * GET /
 * Input: userId
 * Output: None
 * Functionality: Deactivate User. In a word, active field to 'no'
 */
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
/**
 * GET /
 * Input: userId
 * Output: None
 * Functionality: Delete User data by userId.
 */
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