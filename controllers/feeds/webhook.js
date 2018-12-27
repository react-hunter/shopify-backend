const Shopify = require('shopify-api-node');
const fs = require('fs');
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
exports.productCreate = (req, res, next) => {
    res.status(200).send();
    var hookHeaders = req.headers;
    var hookBody = req.body;

    var splittedDomainByDot = hookHeaders['x-shopify-shop-domain'].split('.');
    var vendorName = splittedDomainByDot[0];
    
    var hmac = hookHeaders['x-shopify-hmac-sha256'];
    const createdProductIndex = hookHeaders['x-shopify-product-id'];
    console.log('create hmac : ', hmac);
    // return next();
    /*
    verifyWebhook(hmac, hookHeaders, (err, result) => {
        if (err) {
            console.log('failed in verifying webhook');
        } else {
            console.log('result: ', result);
        }
    });
    */
};

exports.productUpdate = (req, res, next) => {
    res.status(200).send();
    console.log('update hmac : ', req.headers['x-shopify-hmac-sha256']);
    // return next();
};

exports.productDelete = (req, res, next) => {
    res.status(200).send();
    console.log('Delete hmac : ', req.headers['x-shopify-hmac-sha256']);
    // return next();
};

exports.kwiOrderCreate = (req, res) => {
    console.log('data from kwi: ', req.body);
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

// check if this request is from shopify store.
const verifyWebhook = (hmac, headers, callback) => {

};

// get information of vendor and connector by using vendorName
const getInfo = (vendorName, callback) => {
    Vendor.findOne({
        'api.apiShop': vendorName,
        active: 'yes',
        colorSynched: 'yes'
    }, (vendorError, vendor) => {
        if (vendorError) {
            callback(vendorError);
        } else {
            callback(null, vendor);
        }
    });
};

// make product feed
const processProductFeed = async (vendorInfo, connectorInfo, callback) => {
    var productFileName = '';
    var shopify = null;
    var metaList;
    var errorExist = false;
    // Get color list from db
    Color.findOne({}, (colorError, color) => {
        if (colorError) {
            return next(colorError);
        } else {
            colorList = color.colorList;
        }
    });
    
    productFileName = 'uploads/product-' + vendor.api.apiShop + '.txt';

    if (vendorInfo.active == 'yes') {
        shopify = new Shopify({
            shopName: vendorInfo.api.apiShop,
            apiKey: vendorInfo.api.apiKey,
            password: vendorInfo.api.apiPassword,
            timeout: 50000,
            autoLimit: {
                calls: 2,
                interval: 1000,
                bucketSize: 35
            }
        });
    } else {
        if (vendorInfo.active == 'no') {
            callback({error: 'Your vendor should be active to manage feed. Please contact with Administrator.'});
        }
    }
    
    const sftp = new Client(); // sftp client
    var taxCodeKeys = Object.keys(TaxCodeList);
    var taxonomyKeys = Object.keys(TaxonomyList);

    var productDataList = new Array();
    var productViewList = new Array();
    var bestSellCollectionId;
    var shopData;
    var BreakException = {};

    // Initialize product feed file with empty
    deleteAndInitialize(productFileName);

    if (!errorExist) {
        shopify.metafield.list().then(async metas => {
            metaList = metas.reduce((r, a) => {
                r[a.owner_id] = r[a.owner_id] || [];
                r[a.owner_id].push(a);
                return r;
            }, Object.create(null));
        }).catch((e) => {
            console.log(e);
        });

        shopify.shop.get().then((shop) => {
            shopData = shop;
        }).catch(err => console.log(err));

        await delay(2000);

        shopify.product.list({
            limit: 250,
            published_status: 'published'
        }).then(products => {
            products.forEach(product => {
                const metafields = metaList[product.id];
                var productCategory = '';
                var isFirstVariant = true;
                var firstVariantColor = '';
                product.variants.forEach((variant) => {
                    var productData = {};
                    var productView = {};
                    productData.Brand = vendorInfo.brandName;
                    productData.Category = productCategory;

                    productData.ProductCode = '';
                    productData.ParentCode = '';
                    productData.ProductName = '"' + product.title.replace(/\r?\n|\r/g, '').replace(/\"/g, '""') + '"';
                    productView.title = '"' + product.title.replace(/\r?\n|\r/g, '').replace(/\"/g, '""') + '"';
                    productData.ProductDescription = '';
                    if (product.body_html) {
                        productData.ProductDescription = product.body_html.replace(/(<([^>]+)>)/ig, "");
                        productData.ProductDescription = '"' + productData.ProductDescription.replace(/\r?\n|\r/g, '').replace(/\"/g, '""') + '"';
                    }
                    productView.description = productData.ProductDescription;

                    if (product.published_at) {
                        var publishYear = product.published_at.substr(0, 4);
                        var publishMonth = parseInt(product.published_at.substr(5, 2));
                        var publishSeason = '';
                        if (publishMonth < 6 && publishMonth > 2) {
                            publishSeason = 'Spring';
                        } else if (publishMonth > 5 && publishMonth < 9) {
                            publishSeason = 'Summer';
                        } else if (publishMonth > 8 && publishMonth < 12) {
                            publishSeason = 'Fall';
                        } else {
                            publishSeason = 'Winter';
                        }
                    }
                    var ColorName = '';
                    var Size = '';
                    var ProductCodeOption = '';
                    if (product.options.length > 0) {
                        var keyIndex = 1;
                        product.options.forEach(option => {
                            if (option.name.toLowerCase() == 'size') {
                                Size = variant['option' + keyIndex];
                            }
                            if (option.name.toLowerCase() == 'color') {
                                var color = variant['option' + keyIndex];
                                ColorName = jsUcfirst(color);
                                if (isFirstVariant) {
                                    firstVariantColor = color;
                                    firstVariantSku = variant.sku;
                                    firstVariantId = variant.id;
                                    isFirstVariant = false;
                                }
                            }
                            if (option.name.toLowerCase() == 'productcode' || option.name.toLowerCase() == 'product code') {
                                ProductCodeOption = 'option' + keyIndex;
                            }

                            keyIndex++;
                        });
                    }
                    if (firstVariantColor == '' && isFirstVariant) {
                        firstVariantId = variant.id;
                        isFirstVariant = false;
                    }
                    var shortColorName = getShortenColorName(ColorName);
                    var shortFirstColorName = getShortenColorName(firstVariantColor);
                    if (ProductCodeOption == '') {
                        productData.ProductCode = shortColorName==''?variant.product_id.toString() : variant.product_id.toString() + '_' + shortColorName;
                        productData.ParentCode = shortFirstColorName==''?variant.product_id.toString() : variant.product_id.toString() + '_' + shortFirstColorName;
                    } else {
                        productData.ProductCode = shortColorName==''?variant[ProductCodeOption] : variant[ProductCodeOption] + '_' + shortColorName;
                        productData.ParentCode = shortFirstColorName==''?variant[ProductCodeOption] : variant[ProductCodeOption] + '_' + shortFirstColorName;
                    }

                    var ProductDescription2 = '';
                    var ProductOverview = '';
                    var ProductType = 'Apparel';

                    try {
                        ProductTypeList.forEach(ProductTypeItem => {
                            if (ProductTypeItem.toLowerCase() == product.product_type.toLowerCase()) {
                                ProductType = ProductTypeItem;
                                throw BreakException;
                            }
                        })
                    } catch (e) {
                        if (e !== BreakException) throw e;
                    }

                    try {
                        taxonomyKeys.forEach(taxoKey => {
                            var lowercaseTaxonomy = TaxonomyList[taxoKey].toLowerCase();
                            var splittedTaxonomyByGreater = lowercaseTaxonomy.split(' > ');
                            var taxoItem = splittedTaxonomyByGreater[splittedTaxonomyByGreater.length - 1];
                            if (taxoItem.indexOf(ProductType.toLowerCase()) != -1) {
                                productData.Category = TaxonomyList[taxoKey];
                                throw BreakException;
                            }
                        });
                    } catch (e) {
                        if (e !== BreakException) throw e;
                    }

                    var ProductVideo = '';
                    var MaterialContent = '';
                    var VendorModelNumber = '';
                    var MSRP = variant.price;
                    var MinQty = 1;
                    var MaxQty = variant.inventory_quantity > 0 ? variant.inventory_quantity:1;
                    var UPC = variant.id;
                    var MoreInfo = '';
                    var WarehouseCode = "001".toString();
                    if (metafields) {
                        metafields.forEach(meta => {
                            if (meta.key == 'productDescription2') {
                                ProductDescription2 = meta.value;
                            }
                            if (meta.key == 'overview') {
                                ProductOverview = meta.value;
                            }
                            if (meta.key == 'productVideo') {
                                ProductVideo = meta.value;
                            }
                            if (meta.key == 'materialContent') {
                                MaterialContent = meta.value;
                            }
                            if (meta.key == 'vendorModelNumber') {
                                VendorModelNumber = meta.value;
                            }
                            if (meta.key == 'msrp') {
                                MSRP = meta.value;
                            }
                            if (meta.key == 'minQty') {
                                MinQty = meta.value;
                            }
                            if (meta.key == 'maxQty') {
                                MaxQty = meta.value;
                            }
                            if (meta.key == 'upc' && meta.value != '') {
                                UPC = meta.value;
                            }
                            if (meta.key == 'moreInfo') {
                                MoreInfo = meta.value;
                            }
                            if (meta.key == 'warehouseCode') {
                                WarehouseCode = meta.value;
                            }
                        });
                    }
                    if (metafields && metafields.length > 0) {
                        productData.ProductDescription2 = ProductDescription2;
                        productData.ProductOverview = ProductOverview;
                        productData.ProductType = ProductType;
                        productData.MaterialContent = MaterialContent;
                        productData.CountryOfOrigin = shopData.country;
                        productData.VendorModelNumber = VendorModelNumber;
                        productData.Vendor = product.vendor;
                        if (product.published_at) {
                            productData.Season = publishSeason + ' ' + publishYear;
                        } else {
                            productData.Season = '';
                        }
                        productData.ColorName = ColorName.replace(' ', '');
                        productData.Size = Size;
                        productData.DateAvailable = '';
                        if (product.published_at) {
                            productData.DateAvailable = product.published_at.substr(5, 2) + '/' + product.published_at.substr(8, 2) + '/' + publishYear;
                        }
                        productData.Gender = 'Mens';
                        if (product.gender) {
                            productData.Gender = product.gender;
                        }
                        productData.Weight = 0;
                        if (product.weight) {
                            productData.Weight = product.weight;
                        } else {
                            productData.Weight = variant.weight;
                        }
                        if (variant.weight_unit == 'g') {
                            productData.Weight = parseFloat(productData.Weight / 453.59237).toFixed(2);
                        } else if (variant.weight_unit == 'kg') {
                            productData.Weight = parseFloat(productData.Weight / 0.45359237).toFixed(2);
                        }
                        if (productData.Weight == 0) {
                            productData.Weight = 1;
                        }
                        productData.Cost = '';
                        productData.Price = variant.price;
                        productData.MSRP = MSRP;
                        productData.Title = '"' + product.title.replace(/\r?\n|\r/g, '').replace(/\"/g, '""') + '"';
                        productData.MinQty = MinQty;
                        productData.MaxQty = MaxQty;
                        productData.IsBestSeller = collect.collection_id == bestSellCollectionId ? true : false;
                        productData.IsNew = false;
                        productData.IsExclusive = false;
                        productData.IsSale = false;
                        productData.SizeGroup = '';
                        productData.ColorGroup = '';

                        productData.ZoomImage1 = '';
                        productData.ProductVideo = ProductVideo;
                        if (variant.sku != '') {
                            productData.SKU = variant.id;
                        } else {
                            productData.SKU = variant.id;
                        }
                        productData.SkuPrice = variant.price;
                        if (variant.compare_at_price && variant.compare_at_price > 0) {
                            productData.IsSale = true;
                            productData.SkuPrice = variant.compare_at_price?variant.compare_at_price:variant.price;
                        }
                        productData.UPC = UPC;
                        productData.QtyOnHand = variant.inventory_quantity > 0 ? variant.inventory_quantity : 0;
                        productData.MoreInfo = MoreInfo;
                        productData.TaxCode = 'PC040100';
                        try {
                            taxCodeKeys.forEach((key) => {
                                TaxCodeList[key].forEach((taxType) => {
                                    if (product.product_type != '' && taxType.indexOf(product.product_type) !== -1) {
                                        productData.TaxCode = key;
                                        throw BreakException;
                                    }
                                })
                            });
                        } catch (e) {
                            if (e !== BreakException) throw e;
                        }
                        
                        if (!productData.TaxCode) {
                            productData.TaxCode = '';
                        }
                        productData.FinalSale = false;
                        productData.CurrencyCode = shopData.currency;
                        productData.WarehouseCode = WarehouseCode;

                    } else {
                        productData.ProductDescription2 = '';
                        productData.ProductOverview = '';
                        productData.ProductType = ProductType;
                        productData.MaterialContent = '';
                        productData.CountryOfOrigin = shopData.country;
                        productData.VendorModelNumber = variant.sku;
                        productData.Vendor = product.vendor;
                        if (product.published_at) {
                            productData.Season = publishSeason + ' ' + publishYear;
                        } else {
                            productData.Season = '';
                        }
                        productData.ColorName = ColorName.replace(' ', '');
                        productData.Size = Size;
                        productData.DateAvailable = '';
                        if (product.published_at) {
                            productData.DateAvailable = product.published_at.substr(5, 2) + '/' + product.published_at.substr(8, 2) + '/' + publishYear;
                        }
                        if (product.gender) {
                            productData.Gender = product.gender;
                        } else {
                            productData.Gender = 'Mens';
                        }
                        if (product.weight) {
                            productData.Weight = product.weight;
                        } else {
                            productData.Weight = variant.weight;
                        }
                        if (variant.weight_unit == 'g') {
                            productData.Weight = parseFloat(productData.Weight / 453.59237).toFixed(2);
                        } else if (variant.weight_unit == 'kg') {
                            productData.Weight = parseFloat(productData.Weight / 0.45359237).toFixed(2);
                        }
                        if (productData.Weight == 0) {
                            productData.Weight = 1;
                        }
                        productData.Cost = '';
                        productData.Price = variant.price;
                        productData.MSRP = variant.price;
                        productData.Title = '"' + product.title.replace(/\r?\n|\r/g, '').replace(/\"/g, '""') + '"';
                        productData.MinQty = MinQty;
                        productData.MaxQty = MaxQty;
                        productData.IsBestSeller = false;
                        productData.IsNew = false;
                        productData.IsExclusive = false;
                        productData.IsSale = false;
                        productData.SizeGroup = '';
                        productData.ColorGroup = '';

                        productData.ZoomImage1 = '';
                        productData.ProductVideo = '';
                        if (variant.sku != '') {
                            productData.SKU = variant.id;
                        } else {
                            productData.SKU = variant.id;
                        }
                        productData.SkuPrice = variant.price;
                        if (variant.compare_at_price && variant.compare_at_price > 0) {
                            productData.IsSale = true;
                            productData.SkuPrice = variant.compare_at_price?variant.compare_at_price:variant.price;
                        }
                        productData.UPC = UPC;
                        productData.QtyOnHand = variant.inventory_quantity > 0 ? variant.inventory_quantity : 0;
                        productData.MoreInfo = MoreInfo;
                        productData.TaxCode = 'PC040100';
                        try {
                            taxCodeKeys.forEach((key) => {
                                TaxCodeList[key].forEach((taxType) => {
                                    if (product.product_type != '' && taxType.indexOf(product.product_type) !== -1) {
                                        productData.TaxCode = key;
                                        throw BreakException;
                                    }
                                })
                            });
                        } catch (e) {
                            if (e !== BreakException) throw e;
                        }
                        
                        if (!productData.TaxCode) {
                            productData.TaxCode = '';
                        }
                        productData.FinalSale = false;
                        productData.CurrencyCode = shopData.currency;
                        productData.WarehouseCode = "001".toString();
                    }

                    if (variant.image_id) {
                        var variant_image = getVariantImage(product.images, variant.image_id);
                        var splittedByDot = variant_image.split('.');
                        var extendOfFile = '.' + splittedByDot[splittedByDot.length - 1];
                        var splittedByExtend = variant_image.split(extendOfFile);
                        productView.img1 = splittedByExtend[0] + '_1024x' + extendOfFile;
                    } else {
                        if (product.image) {
                            var splittedByDot = product.image.src.split('.');
                            var extendOfFile = '.' + splittedByDot[splittedByDot.length - 1];
                            var splittedByExtend = product.image.src.split(extendOfFile);
                            productView.img1 = splittedByExtend[0] + '_1024x' + extendOfFile;
                        }
                    }

                    productData.ZoomImage1 = productView.img1;
                    productData.FreeShip = true;
                    productData.Action = 'Activate';

                    productView.handle = product.handle;
                    productView.variantId = variant.id.toString();
                    productDataList.push(productData);
                    productViewList.push(productView);
                });
            });
        })
        .then(() => {
            sftp.connect({
                host: vendorInfo.sftp.sftpHost,
                port: process.env.SFTP_PORT,
                username: vendorInfo.sftp.sftpUsername,
                password: vendorInfo.sftp.sftpPassword
            })
            .then(async () => {
                await delay(2000);
                fs.writeFile(productFileName, TSV.stringify(productDataList), (err) => {
                    if (err) {
                        console.log(err);
                    } else {
                        sftp.put(productFileName, '/incoming/products/products01.txt')
                        .then(response => {
                            addStatus(vendorInfo, connectorInfo, 2, (statusErr) => {
                                if (statusErr) {
                                    callback(statusErr);
                                } else {
                                    res.status(200).send();
                                }
                            });
                            
                            sftp.end();
                        })
                        .catch(error => {
                            addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                                if (statusErr) {
                                    callback(statusErr);
                                } else {
                                    callback({error: 'There are problems when trying upload file. Please check your internet connection.'});
                                }
                            });
                        });
                    }
                });

            })
            .catch(error => {
                addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                    if (statusErr) {
                        callback(statusErr);
                    } else {
                        callback({error: 'There are problems when trying to connect into sftp. Please make sure that sftp infomation of this vendor is correct.'});
                    }
                });
            });
        })
        .catch(err => {
            addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                if (statusErr) {
                    callback(statusErr);
                } else {
                    callback({error: 'There are problems when trying to get product list from store. Please check your internet connection.'});
                }
            });
        });
    }
};
