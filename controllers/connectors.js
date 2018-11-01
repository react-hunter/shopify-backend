const Connector = require('../models/Connector');
const User = require('../models/User');

const url = require('url');

/**
 * GET /vendors/{vendorId}/connectors
 * Connectors Page.
 * Input: vendorId
 * Output: vendorId and connector list data
 */
exports.listConnector = (req, res, next) => {
    Connector.find({
        vendorId: req.params.vendorId
    }, (err, connectors) => {
        if (err) {
            return next(err);
        }

        res.render('admin/connector/connectors', {
            title: 'Connector List',
            connectors: connectors,
            vendorId: req.params.vendorId
        });
    });
};

/**
 * GET /vendors/{vendorId}/connectors/add
 * New Connector Input Page.
 * Input: vendorId, [Inputed connector data]
 * Output: vendorId, connector data
 */
exports.addConnector = (req, res, next) => {
    var connector = new Connector();

    if (req.query.name) {
        connector.name = req.query.name;
    }
    if (req.query.kwiLocation) {
        connector.kwiLocation = req.query.kwiLocation;
    }

    User.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err);
        }
        res.render('admin/connector/connectorAdd', {
            title: 'Add Connector for ' + vendor.name,
            connectorData: connector,
            vendorId: req.params.vendorId
        });
    });
};

/**
 * POST /vendors/{vendorId}/connectors/add
 * Save new Connector.
 * Redirect Connector List page.
 * Input: vendorId, connector data
 */
exports.saveConnector = (req, res, next) => {
    var connector = new Connector();

    connector.vendorId = req.body.vendorId;
    connector.name = req.body.name;
    connector.kwiLocation = req.body.kwiLocation;

    if (req.body.name == '') {
        req.flash('info', {
            msg: 'Input is not correct. Please try again.'
        });
        res.redirect(url.format({
            pathname: '/vendors/' + req.body.vendorId + '/connectors/add',
            query: {
                name: req.body.name,
                kwiLocation: req.body.kwiLocation
            }
        }));
        return next();
    }
    connector.save(err => {
        if (err) {
            return next(err);
        }
        req.flash('info', {
            msg: 'Connector has been added successfully.'
        });
        res.redirect('/vendors/' + req.body.vendorId + '/connectors');
    });
};

/**
 * GET /vendors/{vendorId}/connectors/{connectorId}
 * Connector Edit Page.
 * Input: vendorId, connectorId
 * Output: vendorId, connector data
 */
exports.getConnector = (req, res, next) => {
    User.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err);
        } else {
            Connector.findById(req.params.connectorId, (error, connector) => {
                if (error) {
                    return next(error);
                } else {
                    res.render('admin/connector/connectorUpdate', {
                        title: 'Edit Connector ' + vendor.name,
                        connectorData: connector,
                        vendorId: req.params.vendorId
                    });
                }
            });
        }
    });
};

/**
 * POST /vendors/{vendorId}/connectors/update
 * Update Connector with new input data.
 * Redirect to Connector List page.
 * Input: vendorId, connectorId, inputed connector data
 * Output: vendorId, connector list data
 */
exports.updateConnector = (req, res, next) => {
    User.findById(req.body.vendorId, (err, vendor) => {
        if (err) {
            return next(err);
        } else {
            Connector.findById(req.body.connectorId, (getErr, connector) => {
                if (getErr) {
                    return next(getErr);
                } else {
                    connector.name = req.body.name;
                    connector.kwiLocation = req.body.kwiLocation;
                    if (req.body.name == '') {
                        req.flash('info', {
                            msg: 'Please insert correctly.'
                        });
                        res.redirect('/vendors/' + req.body.vendorId + '/connectors/' + req.body.connectorId);
                        return next();
                    }
                    connector.save(connectorErr => {
                        if (connectorErr) {
                            return next(connectorErr);
                        } else {
                            req.flash('info', {
                                msg: 'Connector has been updated successfully.'
                            });
                            res.redirect('/vendors/' + req.body.vendorId + '/connectors');
                        }
                    });
                }
            });
        }
    });
};

/**
 * GET /vendors/{vendorId}/connectors/delete/{connectorId}
 * Delete Connector.
 * Redirect to Connector List Page
 * Input: vendorId, connectorId
 */
exports.deleteConnector = (req, res, next) => {
    Connector.deleteOne({
        _id: req.params.connectorId
    }, err => {
        if (err) {
            return next(err);
        }
        req.flash('info', {
            msg: 'Connector has been deleted successfully.'
        });
        res.redirect('/vendors/' + req.params.vendorId + '/connectors');
    });
};

/**
 * GET /vendors/{vendorId}/connectors/activate/{connectorId}
 * Activate Connector.
 * Redirect to Connector List Page
 * Input: vendorId, connectorId
 */
exports.activateConnector = (req, res, next) => {
    Connector.findById(req.params.connectorId, (getErr, connector) => {
        if (getErr) {
            return next(getErr);
        } else {
            connector.active = 'yes';
            connector.activeDate = new Date();

            connector.save(err => {
                if (err) {
                    return next(err);
                } else {
                    req.flash('info', {
                        msg: 'Connector has been activated successfully.'
                    });
                    res.redirect('/vendors/' + req.params.vendorId + '/connectors');
                }
            });
        }
    });
};

/**
 * GET /vendors/{vendorId}/connectors/inactivate/{connectorId}
 * Inactivate Connector.
 * Redirect to Connector List Page
 * Input: vendorId, connectorId
 */
exports.inactivateConnector = (req, res, next) => {
    Connector.findById(req.params.connectorId, (getErr, connector) => {
        if (getErr) {
            return next(getErr);
        } else {
            connector.active = 'no';

            connector.save(err => {
                if (err) {
                    return next(err);
                } else {
                    req.flash('info', {
                        msg: 'Connector has been inactivated successfully.'
                    });
                    res.redirect('/vendors/' + req.params.vendorId + '/connectors');
                }
            });
        }
    });
};