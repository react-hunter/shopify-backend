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
exports.productCreate = (req, res) => {
    
    var hookHeaders = req.headers;
    var hookBody = req.body;

    var temp = hookHeaders['x-shopify-shop-domain'].split('.');
    var fromStore = temp[0];
    
    // productHookList[fromStore + '-update'] = [];
    if (hookHeaders['x-shopify-topic'] == 'products/create') {
        if (contains.call(productHookList[fromStore + '-create'], hookHeaders['x-shopify-product-id'])) {
            console.log('created product id: ', hookHeaders['x-shopify-product-id']);
            console.log('created product title: ', hookBody.title);
            console.log('////////////////////////////////////////////////////////////////////');
            res.status(200).send();
            productHookList[fromStore + '-create'] = [];
        } else {
            productHookList[fromStore + '-create'] = [];
            productHookList[fromStore + '-create'].push(hookHeaders['x-shopify-product-id']);
        }
    }
};

exports.productUpdate = (req, res, next) => {
    console.log('arrive webhook for product update');
    // res.status(200).send();
    console.log('headers: ', req.headers);
    res.redirect('/product');
    return next();
};

exports.productDelete = (req, res) => {
    console.log('arrive webhook for product Delete');
    res.status(200).send();
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
