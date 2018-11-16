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

var productHookList = {};
exports.index = (req, res) => {
    
    var hookHeaders = req.headers;
    var hookBody = req.body;

    var temp = hookHeaders['x-shopify-shop-domain'].split('.');
    var fromStore = temp[0];
    
    // productHookList[fromStore + '-update'] = [];
    if (hookHeaders['x-shopify-topic'] == 'products/update') {
        if (contains.call(productHookList[fromStore + '-update'], hookHeaders['x-shopify-product-id'])) {
            console.log('request headers: ', hookHeaders);
            console.log('request body: ', hookBody);
            console.log('////////////////////////////////////////////////////////////////////');
            res.json({status: 'ok'});
            productHookList[fromStore + '-update'] = [];
        } else {
            productHookList[fromStore + '-update'] = [];
            productHookList[fromStore + '-update'].push(hookHeaders['x-shopify-product-id']);
        }
    }
};

var contains = function(needle) {
    // Per spec, the way to identify NaN is that it is not equal to itself
    var findNaN = needle !== needle;
    var indexOf;

    if(!findNaN && typeof Array.prototype.indexOf === 'function') {
        indexOf = Array.prototype.indexOf;
    } else {
        indexOf = function(needle) {
            var i = -1, index = -1;

            for(i = 0; i < this.length; i++) {
                var item = this[i];

                if((findNaN && item !== item) || item === needle) {
                    index = i;
                    break;
                }
            }

            return index;
        };
    }

    return indexOf.call(this, needle) > -1;
}
