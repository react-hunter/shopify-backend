const Connector = require('../models/Connector')
const Vendor = require('../models/Vendor')
const url = require('url')

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
            return next(err)
        } else {
            res.render('admin/connector/connectors', {
                title: 'Connector List',
                connectors: connectors,
                vendorId: req.params.vendorId
            })
        }
    })
}

/**
 * GET /vendors/{vendorId}/connectors/add
 * New Connector Input Page.
 * Input: vendorId, [Inputed connector data]
 * Output: vendorId, connector data
 */
exports.addConnector = (req, res, next) => {
    var connector = new Connector()

    if (req.query.name) {
        connector.name = req.query.name
    }
    if (req.query.kwiLocation) {
        connector.kwiLocation = req.query.kwiLocation
    }

    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err)
        } else {
            res.render('admin/connector/connectorAdd', {
                title: 'Add Connector for ' + vendor.name,
                connectorData: connector,
                vendorId: req.params.vendorId
            })
        }
    })
}

/**
 * POST /vendors/{vendorId}/connectors/add
 * Save new Connector.
 * If success, it redirects `Connector List` page. If not, it redirects to `Add` page with inputed data.
 * Input: vendorId, connector data
 */
exports.saveConnector = (req, res, next) => {
    var connector = new Connector()

    connector.vendorId = req.body.vendorId
    connector.name = req.body.name
    connector.kwiLocation = req.body.kwiLocation

    if (req.body.name == '') {
        req.flash('errors', {
            msg: 'Input is not correct. Please try again.'
        })
        res.redirect(url.format({
            pathname: '/vendors/' + req.body.vendorId + '/connectors/add',
            query: {
                name: req.body.name,
                kwiLocation: req.body.kwiLocation
            }
        }))
        return next()
    } else {
        connector.save(err => {
            if (err) {
                return next(err)
            } else {
                req.flash('success', {
                    msg: 'Connector has been added successfully.'
                })
                res.redirect('/vendors/' + req.body.vendorId + '/connectors')
            }
        })
    }
}

/**
 * GET /vendors/{vendorId}/connectors/{connectorId}
 * Connector Edit Page.
 * Input: vendorId, connectorId
 * Output: vendorId, connector data
 */
exports.getConnector = (req, res, next) => {
    Vendor.findById(req.params.vendorId, (err, vendor) => {
        if (err) {
            return next(err)
        } else {
            Connector.findById(req.params.connectorId, (error, connectorInfo) => {
                if (error) {
                    return next(error)
                } else {
                    res.render('admin/connector/connectorUpdate', {
                        title: 'Edit Connector ' + vendor.name,
                        connectorData: connectorInfo,
                        vendorId: req.params.vendorId
                    })
                }
            })
        }
    })
}

/**
 * POST /vendors/{vendorId}/connectors/update
 * Update Connector with new input data.
 * Redirect to Connector List page.
 * Input: vendorId, connectorId, inputed connector data
 * Output: vendorId, connector list data
 */
exports.updateConnector = (req, res, next) => {
    Vendor.findById(req.body.vendorId, (err, vendor) => {
        if (err) {
            return next(err)
        } else {
            Connector.findById(req.body.connectorId, (getErr, connectorInfo) => {
                if (getErr) {
                    return next(getErr)
                } else {
                    connectorInfo.name = req.body.name
                    connectorInfo.kwiLocation = req.body.kwiLocation
                    if (req.body.name == '') {
                        req.flash('errors', {
                            msg: 'Please insert correctly.'
                        })
                        res.redirect('/vendors/' + req.body.vendorId + '/connectors/' + req.body.connectorId)
                        return next()
                    }
                    connectorInfo.save(connectorErr => {
                        if (connectorErr) {
                            return next(connectorErr)
                        } else {
                            req.flash('success', {
                                msg: 'Connector has been updated successfully.'
                            })
                            res.redirect('/vendors/' + req.body.vendorId + '/connectors')
                        }
                    })
                }
            })
        }
    })
}

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
            return next(err)
        } else {
            req.flash('success', {
                msg: 'Connector has been deleted successfully.'
            })
            res.redirect('/vendors/' + req.params.vendorId + '/connectors')
        }
    })
}

/**
 * GET /vendors/{vendorId}/connectors/activate/{connectorId}
 * Activate Connector.
 * Redirect to Connector List Page
 * Input: vendorId, connectorId
 */
exports.activateConnector = (req, res, next) => {
    Connector.findById(req.params.connectorId, (getErr, connectorInfo) => {
        if (getErr) {
            return next(getErr)
        } else {
            Vendor.findById(req.params.vendorId, (vendorError, vendor) => {
                if (vendorError) {
                    return next(vendorError)
                } else {
                    if (vendor.colorSynched != 'yes') {
                        req.flash('errors', {
                            msg: 'To activate product connector, you should apply colors in products of this store firstly.'
                        })
                        res.redirect('/vendors')
                        return next()
                    } else {
                        connectorInfo.active = 'yes'
                        connectorInfo.activeDate = new Date()
            
                        connectorInfo.save(err => {
                            if (err) {
                                return next(err)
                            } else {
                                req.flash('success', {
                                    msg: 'Connector has been activated successfully.'
                                })
                                res.redirect('/vendors/' + req.params.vendorId + '/connectors')
                            }
                        })
                    }
                }
            })
        }
    })
}

/**
 * GET /vendors/{vendorId}/connectors/inactivate/{connectorId}
 * Inactivate Connector.
 * Redirect to Connector List Page
 * Input: vendorId, connectorId
 */
exports.inactivateConnector = (req, res, next) => {
    Connector.findById(req.params.connectorId, (getErr, connectorInfo) => {
        if (getErr) {
            return next(getErr)
        } else {
            connectorInfo.active = 'no'

            connectorInfo.save(err => {
                if (err) {
                    return next(err)
                } else {
                    req.flash('success', {
                        msg: 'Connector has been inactivated successfully.'
                    })
                    res.redirect('/vendors/' + req.params.vendorId + '/connectors')
                }
            })
        }
    })
}