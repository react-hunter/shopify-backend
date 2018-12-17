const Shopify = require('shopify-api-node');
const fs = require('fs');
// const request = require('request');
const Client = require('ssh2-sftp-client');
const TaxCodeList = require('../../config/constants').TaxCodeList;
const ProductTypeList = require('../../config/constants').ProductTypeList;
const TaxonomyList = require('../../config/constants').TaxonomyList;
const delay = require('delay');
const TSV = require('tsv');
// const eachSeries = require('async/eachSeries');
// const eachOfSeries = require('async/eachOfSeries');
// const async = require('async');

const Vendor = require('../../models/Vendor');
const Connector = require('../../models/Connector');
const Color = require('../../models/Color');
const History = require('../../models/History');
const Status = require('../../models/Status');

var colorList = [];

/**
 * GET /
 * Product page.
 */
exports.index = async (req, res, next) => {

    var vendorInfo;
    var connectorInfo;
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
    
    Vendor.findOne({
        _id: req.user.vendorId
    }, (vendorError, vendor) => {
        if (vendorError) {
            return next(vendorError);
        }
        vendorInfo = vendor;
        productFileName = 'uploads/product-' + vendor.api.apiShop + '.txt';

        if (vendorInfo.api.apiShop == '' || vendorInfo.api.apiKey == '' || vendorInfo.api.apiPassword == '') {
            req.flash('errors', {
                msg: 'You should have API information to manage product feed. Please contact with Administrator.'
            });
            errorExist = true;
            res.redirect('/');
            return next();
        }
        if (vendorInfo.sftp.sftpHost == '' || vendorInfo.sftp.sftpPassword == '' || vendorInfo.sftp.sftpUsername == '') {
            req.flash('errors', {
                msg: 'You should have SFTP information to manage product feed. Please contact with Administrator.'
            });
            errorExist = true;
            res.redirect('/');
            return next();
        }
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
        }
        // Check vendor availability. If vendor's status is inactive, it should redirect to homepage without any action.
        if (vendorInfo.active == 'no') {
            req.flash('errors', {
                msg: 'Your vendor should be active to manage feed. Please contact with Administrator.'
            });
            errorExist = true;
            res.redirect('/');
            return next();
        }

        // Check product connector
        Connector.find({
            vendorId: vendorInfo._id,
            kwiLocation: 'product',
            active: 'yes'
        }, (err, connectors) => {
            if (err) {
                return next(err);
            }
            if (connectors.length == 0) {
                req.flash('errors', {
                    msg: 'Your vendor does not include product connector or it is inactive. Please contact with Administrator or Admin User.'
                });
                errorExist = true;
                res.redirect('/');
                return next();
            }
            connectorInfo = connectors[0];
        });
    });

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

    // Check user's active/inactive status.
    if (req.user.active !== 'yes') {
        req.flash('errors', {
            msg: 'Your account is inactive now. Please contact with Administrator.'
        });
        errorExist = true;
        res.redirect('/');
        return next();
    }

    await delay(2000);
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
            // Code to make a file with raw data. Should delete after finishing this feed.
            /*products.forEach(product => {
                var temp = product;
                temp.body_html = 'product description';
                writeProductFile(JSON.stringify(temp), 0, (writeError, writeResponse) => {
                    isFirstVariant = false;
                    if(writeError){
                        console.log('writeError: ', writeError);
                    }
                    if(writeResponse == 'success') {
                        console.log('Writing ...');
                    }
                });
            });
            tempProducts = [];
            products.forEach(product => {
                var temp = product;
                temp.body_html = 'product description';
                tempProducts.push(temp);
            });
            fs.writeFile("uploads/backup/product-raw-hedge.tsv", TSV.stringify(tempProducts));*/
            products.forEach(product => {
                const metafields = metaList[product.id];
                var productCategory = '';
                var isFirstVariant = true;
                var firstVariantColor = '';
                // var firstVariantSku = '';
                // var firstVariantId = '';
                product.variants.forEach((variant) => {
                    var productData = {};
                    var productView = {};
                    // productData.Brand = product.vendor;
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
                    // var today = new Date();
                    // var daysDifference = daysBetween(product.published_at, today);
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

                    // Regenerate the `Category` field by `ProductType`
                    try {
                        taxonomyKeys.forEach(taxoKey => {
                            var temp = TaxonomyList[taxoKey].toLowerCase();
                            var temp1 = temp.split(' > ');
                            var taxoItem = temp1[temp1.length - 1];
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
                        // if(daysDifference > 30) {
                        //     productData.IsNew = false;
                        // } else {
                        //     productData.IsNew = true;
                        // }
                        productData.IsNew = false;
                        productData.IsExclusive = false;
                        productData.IsSale = false;
                        productData.SizeGroup = '';
                        productData.ColorGroup = '';

                        productData.ZoomImage1 = '';
                        productData.ProductVideo = ProductVideo;
                        if (variant.sku != '') {
                            // productData.SKU = variant.sku + getShortenColorName(ColorName) + Size;
                            productData.SKU = variant.id;
                        } else {
                            // productData.SKU = productData.ProductCode;
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
                        // productData.IsBestSeller = collect.collection_id == bestSellCollectionId ? true : false;
                        productData.IsBestSeller = false;
                        // if (daysDifference > 30) {
                        //     productData.IsNew = false;
                        // } else {
                        //     productData.IsNew = true;
                        // }
                        productData.IsNew = false;
                        productData.IsExclusive = false;
                        productData.IsSale = false;
                        productData.SizeGroup = '';
                        productData.ColorGroup = '';

                        productData.ZoomImage1 = '';
                        productData.ProductVideo = '';
                        if (variant.sku != '') {
                            // productData.SKU = variant.sku + getShortenColorName(ColorName) + Size;
                            productData.SKU = variant.id;
                        } else {
                            // productData.SKU = productData.ProductCode;
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

                    // productData.ColorSwatchImage = "";
                    if (variant.image_id) {
                        var variant_image = getVariantImage(product.images, variant.image_id);
                        var temp0 = variant_image.split('.');
                        var lastBlock = '.' + temp0[temp0.length - 1];
                        var temp1 = variant_image.split(lastBlock);
                        productView.img1 = temp1[0] + '_1024x' + lastBlock;
                    } else {
                        if (product.image) {
                            var temp0 = product.image.src.split('.');
                            var lastBlock = '.' + temp0[temp0.length - 1];
                            var temp1 = product.image.src.split(lastBlock);
                            productView.img1 = temp1[0] + '_1024x' + lastBlock;
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
                var vendorUrl = 'https://' + vendorInfo.api.apiShop + '.myshopify.com';
                fs.writeFile(productFileName, TSV.stringify(productDataList), (err) => {
                    if (err) {
                        console.log(err);
                    } else {
                        sftp.put(productFileName, '/incoming/products/products01.txt')
                        .then(response => {
                            addStatus(vendorInfo, connectorInfo, 2, (statusErr) => {
                                if (statusErr) {
                                    return next(statusErr);
                                } else {
                                    res.render('feeds/product', {
                                        title: 'Product',
                                        products: productViewList,
                                        vendorUrl: vendorUrl
                                    });
                                }
                            });
                            
                            sftp.end();
                        })
                        .catch(error => {
                            addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                                if (statusErr) {
                                    return next(statusErr);
                                } else {
                                    req.flash('errors', {
                                        msg: 'There are problems when trying upload file. Please check your internet connection.'
                                    });
                                    res.redirect('/');
                                }
                            });
                        });
                    }
                });

            })
            .catch(error => {
                addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                    if (statusErr) {
                        return next(statusErr);
                    } else {
                        req.flash('errors', {
                            msg: 'There are problems when trying to connect into sftp. Please make sure that sftp infomation of this vendor is correct.'
                        });
                        res.redirect('/');
                    }
                });
            });
        })
        .catch(err => {
            addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                if (statusErr) {
                    return next(statusErr);
                } else {
                    req.flash('errors', {
                        msg: 'There are problems when trying to get product list from store. Please check your internet connection.'
                    });
                    res.redirect('/');
                }
            });
        });
    }
};

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

/*
const writeProductFile = function (data, isFirst, callback) {
    if (isFirst == 1) {
        fs.appendFile("uploads/product-original-hedge.txt", data, function (err) {
            if (err) {
                callback(err);
            }
        });
        callback(null, 'success');
    } else {
        fs.appendFile("uploads/product-original.txt", ', ' + data, function (err) {
            if (err) {
                callback(err);
            }
        });
        callback(null, 'success');
    }
}
const daysBetween = function (date1, date2) {
    var one_day = 1000 * 60 * 60 * 24;
    var temp = new Date(date1);
    var date1_ms = temp.getTime();
    var date2_ms = date2;

    var difference_ms = date2_ms - date1_ms;

    return Math.round(difference_ms / one_day);
}
const downloadImage = function (uri, filename, callback) {
    request.head(uri, function (err, res, body) {
        request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
    });
};
const deleteImageList = function (fileList, callback) {
    if (fileList.length > 0) {
        fileList.forEach(file => {
            if (fs.existsSync(file[1])) {
                fs.unlink(file[1], (err) => {
                    if (err) throw err;
                });
            }
        })
    }
    callback(null);
}
*/