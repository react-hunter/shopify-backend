const Shopify = require('shopify-api-node');
const fs = require('fs');
// const request = require('request');
const Client = require('ssh2-sftp-client');
const TaxCodeList = require('../../config/constants').TaxCodeList;
const ProductTypeList = require('../../config/constants').ProductTypeList;
const TaxonomyList = require('../../config/constants').TaxonomyList;
const delay = require('delay');
const TSV = require('tsv');

const Vendor = require('../../models/Vendor');
const Connector = require('../../models/Connector');
const Color = require('../../models/Color');
const History = require('../../models/History');
const Status = require('../../models/Status');

/**
 * POST /
 * Feed Trigger Action
 */

var productHookList = {};
exports.productCreate = (req, res) => {
    console.log('req header from store: ', req.headers);
    console.log('req session from store: ', req.session);
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

const getVariantImage = function (images, image_id) {
    var image_url = '';
    images.forEach(image => {
        if (image.id == image_id) {
            image_url = image.src;
        }
    });

    return image_url;
}

const jsUcfirst = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
const getShortenColorName = function (str) {
    var returnColor = '';
    colorList.forEach(colorItem => {
        if (colorItem.colorName == str.toLowerCase()) {
            returnColor = colorItem.shortName;
        }
    });
    return returnColor;
}
const deleteAndInitialize = function (filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) throw err;
            console.log('product file has been deleted');
            fs.writeFile(filePath, '', function (initErr) {
                if (initErr) {
                    console.log(initErr);
                }
                console.log('Made product file and initialized with empty');
            });
        });
    }
}

const addStatus = (vendor, connector, statusFlag, callback) => {
    Status.find({
        vendorId: vendor._id,
        connectorId: connector._id
    }, (err, statuses) => {
        if (err) {
            callback(err);
        } else {
            if (statuses.length == 0) {
                var status = new Status();
                status.vendorId = vendor._id;
                status.vendorName = vendor.api.apiShop;
                status.connectorId = connector._id;
                status.connectorType = connector.kwiLocation;
                status.success = 0;
                status.pending = 0;
                status.error = 0;
                switch (statusFlag) {
                    case 0:
                        status.error = 1;
                        break;
                    case 1:
                        status.pending = 1;
                        break;
                    default:
                        status.success = 1;
                }
                status.save().then(() => {
                    addHistory(vendor, connector, statusFlag, (historyErr) => {
                        if(historyErr) {
                            callback(historyErr);
                        } else {
                            callback(null);
                        }
                    });
                });
            } else {
                var status = statuses[0];
                let statusQuery = '';
                switch (statusFlag) {
                    case 0:
                        statusQuery = {error: 1};
                        break;
                    case 1:
                        statusQuery = {pending: 1};
                        break;
                    default:
                        statusQuery = {success: 1};
                }
                status.updateOne({ $inc: statusQuery},() => {
                    addHistory(vendor, connector, statusFlag, (historyErr) => {
                        if(historyErr) {
                            callback(historyErr);
                        } else {
                            callback(null);
                        }
                    });
                });
            }
        }
    });
};

const addHistory = (vendor, connector, flag, callback) => {
    var history = new History();
    history.vendorId = vendor._id;
    history.vendorName = vendor.api.apiShop;
    history.connectorId = connector._id;
    history.connectorType = connector.kwiLocation;
    history.status = flag;

    history.save().then(() => {
        callback(null);
    }).catch(err => {
        callback(err);
    });
};
