const Shopify = require('shopify-api-node');
const delay = require('delay');

const Vendor = require('../../models/Vendor');
const Connector = require('../../models/Connector');
const lusca = require('lusca');

var csrfMiddleware = lusca.csrf();

/**
 * POST /
 * Feed Trigger Action
 */
exports.index = (req, res) => {
    
    console.log('request body: ', req);
    res.json({status: 'ok'});
};
