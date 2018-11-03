const Shopify = require('shopify-api-node');
const fs = require('fs');
const request = require('request');
const Client = require('ssh2-sftp-client');
const isset = require('isset');
const TaxCodeList = require('../../config/constants').TaxCodeList;
const ProductTypeList = require('../../config/constants').ProductTypeList;
const ThreeColorList = require('../../config/constants').ThreeColorList;
const TaxonomyList = require('../../config/constants').TaxonomyList;
const delay = require('delay');
const TSV = require('tsv');
const eachSeries = require('async/eachSeries');

var threeColorKeys = Object.keys(ThreeColorList);

/**
 * GET /
 * Product page.
 */
exports.index = (req, res) => {

    const shopify = new Shopify({
        shopName: process.env.SHOPIFY_STORE_NAME,
        apiKey: process.env.SHOPIFY_APP_KEY,
        password: process.env.SHOPIFY_APP_PASSWORD
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
    deleteAndInitialize('uploads/product.txt');

    shopify.collectionListing.list({
        "sort_order": "best-selling"
    }).then((collectionListing) => {
        if (collectionListing.length > 0) {
            bestSellCollectionId = collectionListing[0].collection_id;
        } else {
            bestSellCollectionId = null;
        }
    }).catch(err => console.log(err));

    shopify.shop.get().then((shop) => {
        shopData = shop;
    }).catch(err => console.log(err));

    shopify.collect.list()
        .then(collects => {
            collects.forEach(collect => {
                var productCategory = '';
                shopify.customCollection.get(collect.collection_id)
                    .then(collection => {
                        productCategory = collection.title;
                    })
                    .then(() => {
                        shopify.product.get(collect.product_id)
                            .then(product => {
                                shopify.metafield.list({
                                    metafield: {
                                        owner_resource: 'product',
                                        owner_id: collect.product_id
                                    }
                                }).then(
                                    metafields => {
                                        var isFirstVariant = true;
                                        var firstVariantColor = '';
                                        var firstVariantSku = '';
                                        product.variants.forEach((variant) => {
                                            var productData = {};
                                            var productView = {};
                                            productData.Brand = product.vendor;
                                            productData.Category = productCategory;

                                            productData.ProductCode = '';
                                            productData.ParentCode = '';
                                            productData.ProductName = product.title;
                                            productView.title = product.title;
                                            productData.ProductDescription = product.body_html.replace(/(<([^>]+)>)/ig, "");
                                            productData.ProductDescription = productData.ProductDescription.replace(/\r?\n|\r/g, '');
                                            productView.description = productData.ProductDescription;

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
                                            var today = new Date();
                                            var daysDifference = daysBetween(product.published_at, today);
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
                                                        ColorName = variant['option' + keyIndex];
                                                        ColorName = jsUcfirst(ColorName).replace(' ', '');
                                                        if (isFirstVariant) {
                                                            firstVariantColor = ColorName;
                                                            firstVariantSku = variant.sku;
                                                            isFirstVariant = false;
                                                        }
                                                    }
                                                    if (option.name.toLowerCase() == 'productcode' || option.name.toLowerCase() == 'product code') {
                                                        ProductCodeOption = 'option' + keyIndex;
                                                    }

                                                    keyIndex++;
                                                });
                                            }
                                            if (ProductCodeOption == '') {
                                                productData.ProductCode = variant.sku + '_' + getShortenColorName(ColorName);
                                                productData.ParentCode = firstVariantSku + '_' + getShortenColorName(firstVariantColor);
                                            } else {
                                                productData.ProductCode = variant[ProductCodeOption] + '_' + getShortenColorName(ColorName);
                                                productData.ParentCode = variant[ProductCodeOption] + '_' + getShortenColorName(firstVariantColor);
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
                                            var MaxQty = 10;
                                            var UPC = variant.id;
                                            var MoreInfo = '';
                                            var WarehouseCode = "001".toString();
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
                                            if (metafields.length > 0) {
                                                productData.ProductDescription2 = ProductDescription2;
                                                productData.ProductOverview = ProductOverview;
                                                productData.ProductType = ProductType;
                                                productData.MaterialContent = MaterialContent;
                                                productData.CountryOfOrigin = shopData.country;
                                                productData.VendorModelNumber = VendorModelNumber;
                                                productData.Vendor = product.vendor;
                                                productData.Season = publishSeason + ' ' + publishYear;
                                                productData.ColorName = ColorName;
                                                productData.Size = Size;
                                                productData.DateAvailable = product.published_at.substr(5, 2) + '/' + product.published_at.substr(8, 2) + '/' + publishYear;
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
                                                productData.Cost = variant.price;
                                                productData.Price = variant.price;
                                                productData.MSRP = MSRP;
                                                productData.Title = product.title;
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
                                                // if(!variant.compare_at_price || variant.price >= variant.compare_at_price) {
                                                //     productData.IsSale = false;
                                                // } else {
                                                //     productData.IsSale = true;
                                                // }
                                                productData.IsSale = false;
                                                productData.SizeGroup = '';
                                                productData.ColorGroup = '';

                                                productData.ZoomImage1 = 'http://www.imagestore.com/productimages/product' + variant.id.toString() + '_1.jpg';
                                                productData.ZoomImage2 = 'http://www.imagestore.com/productimages/product' + variant.id.toString() + '_2.jpg';
                                                productData.ZoomImage3 = 'http://www.imagestore.com/productimages/product' + variant.id.toString() + '_3.jpg';
                                                productData.ZoomImage4 = 'http://www.imagestore.com/productimages/product' + variant.id.toString() + '_4.jpg';
                                                productData.ZoomImage5 = 'http://www.imagestore.com/productimages/product' + variant.id.toString() + '_5.jpg';
                                                productData.ProductVideo = ProductVideo;
                                                if (variant.sku != '') {
                                                    // productData.SKU = variant.sku + getShortenColorName(ColorName) + Size;
                                                    productData.SKU = variant.id;
                                                } else {
                                                    // productData.SKU = productData.ProductCode;
                                                    productData.SKU = variant.id;
                                                }
                                                productData.SkuPrice = variant.price;
                                                productData.UPC = UPC;
                                                productData.QtyOnHand = variant.inventory_quantity > 0 ? variant.inventory_quantity : 0;
                                                productData.MoreInfo = MoreInfo;
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
                                                /*try{
                                                    taxCodeKeys.forEach( (key) => {
                                                        if(product.product_type != '' && TaxCodeList[key].indexOf(product.product_type) !== -1) {
                                                            productData.TaxCode = key;
                                                            throw BreakException;
                                                        }
                                                    });
                                                } catch(e) {
                                                    if( e !== BreakException ) throw e;
                                                }*/
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
                                                productData.Season = publishSeason + ' ' + publishYear;
                                                productData.ColorName = ColorName;
                                                productData.Size = Size;
                                                productData.DateAvailable = product.published_at.substr(5, 2) + '/' + product.published_at.substr(8, 2) + '/' + publishYear;
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
                                                productData.Cost = variant.price;
                                                productData.Price = variant.price;
                                                productData.MSRP = variant.price;
                                                productData.Title = product.title;
                                                productData.MinQty = '';
                                                productData.MaxQty = '';
                                                productData.IsBestSeller = collect.collection_id == bestSellCollectionId ? true : false;
                                                if (daysDifference > 30) {
                                                    productData.IsNew = false;
                                                } else {
                                                    productData.IsNew = true;
                                                }
                                                productData.IsExclusive = false;
                                                if (!variant.compare_at_price || variant.price >= variant.compare_at_price) {
                                                    productData.IsSale = false;
                                                } else {
                                                    productData.IsSale = true;
                                                }
                                                productData.SizeGroup = '';
                                                productData.ColorGroup = '';

                                                productData.ZoomImage1 = 'http://www.imagestore.com/productimages/product' + variant.id.toString() + '_1.jpg';
                                                productData.ZoomImage2 = 'http://www.imagestore.com/productimages/product' + variant.id.toString() + '_2.jpg';
                                                productData.ZoomImage3 = 'http://www.imagestore.com/productimages/product' + variant.id.toString() + '_3.jpg';
                                                productData.ZoomImage4 = 'http://www.imagestore.com/productimages/product' + variant.id.toString() + '_4.jpg';
                                                productData.ZoomImage5 = 'http://www.imagestore.com/productimages/product' + variant.id.toString() + '_5.jpg';
                                                productData.ProductVideo = '';
                                                if (variant.sku != '') {
                                                    // productData.SKU = variant.sku + getShortenColorName(ColorName) + Size;
                                                    productData.SKU = variant.id;
                                                } else {
                                                    // productData.SKU = productData.ProductCode;
                                                    productData.SKU = variant.id;
                                                }
                                                productData.SkuPrice = variant.price;
                                                productData.UPC = UPC;
                                                productData.QtyOnHand = variant.inventory_quantity > 0 ? variant.inventory_quantity : 0;
                                                productData.MoreInfo = '';
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
                                                // try{
                                                //     taxCodeKeys.forEach( (key) => {
                                                //         if(product.product_type != '' && TaxCodeList[key].indexOf(product.product_type) !== -1) {
                                                //             productData.TaxCode = key;
                                                //             throw BreakException;
                                                //         }
                                                //     });
                                                // } catch(e) {
                                                //     if( e !== BreakException ) throw e;
                                                // }
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
                                                productView.img1 = temp1[0] + '_180x' + lastBlock;
                                                productView.img2 = temp1[0] + '_360x' + lastBlock;
                                                productView.img3 = temp1[0] + '_540x' + lastBlock;
                                                productView.img4 = temp1[0] + '_720x' + lastBlock;
                                                productView.img5 = temp1[0] + '_900x' + lastBlock;
                                            } else {
                                                if (product.image) {
                                                    var temp0 = product.image.src.split('.');
                                                    var lastBlock = '.' + temp0[temp0.length - 1];
                                                    var temp1 = product.image.src.split(lastBlock);
                                                    productView.img1 = temp1[0] + '_180x' + lastBlock;
                                                    productView.img2 = temp1[0] + '_360x' + lastBlock;
                                                    productView.img3 = temp1[0] + '_540x' + lastBlock;
                                                    productView.img4 = temp1[0] + '_720x' + lastBlock;
                                                    productView.img5 = temp1[0] + '_900x' + lastBlock;
                                                }
                                            }
                                            productData.FreeShip = true;
                                            productData.Action = 'Activate';

                                            productView.handle = product.handle;
                                            productView.variantId = variant.id.toString();
                                            productDataList.push(productData);
                                            productViewList.push(productView);
                                            /*if(isFirstVariant) {
                                                writeProductFile(JSON.stringify(productData), 1, (writeError, writeResponse) => {
                                                    isFirstVariant = false;
                                                    if(writeError){
                                                        console.log('writeError: ', writeError);
                                                    }
                                                    if(writeResponse == 'success') {
                                                        console.log('Writing ...');
                                                    }
                                                });
                                            } else {
                                                writeProductFile(JSON.stringify(productData), 0, (writeError, writeResponse) => {
                                                    if(writeError){
                                                        console.log('writeError: ', writeError);
                                                    }
                                                    if(writeResponse == 'success') {
                                                        console.log('Writing ...');
                                                    }
                                                });
                                            }*/
                                        });
                                    },
                                    err => console.error(err)
                                )
                            })
                            .catch(productError => console.log('productError: ', productError));
                    })
                    .catch((collectionError) => console.log('collection error: ', collectionError));
            });
        })
        .then(() => {
            sftp.connect({
                    host: process.env.SFTP_HOST,
                    port: process.env.SFTP_PORT,
                    username: process.env.SFTP_USERNAME,
                    password: process.env.SFTP_PASSWORD
                })
                .then(async () => {
                    await delay(1000);
                    fs.writeFile("uploads/product.txt", TSV.stringify(productDataList), function (err) {
                        console.log('writing');
                        if (err) {
                            console.log(err);
                        } else {
                            sftp.put('uploads/product.txt', '/incoming/products/products01.txt')
                                .then(response => {
                                    res.render('feeds/product', {
                                        title: 'Product',
                                        products: productViewList
                                    });
                                })
                                .then(() => {
                                    var kkk = 0;
                                    eachSeries(productViewList, (pro, callbackProduct) => {
                                        [1, 2, 3, 4, 5].forEach(i => {
                                            var remotePath = '/productimages/product' + pro.variantId + '_' + i + '.jpg';
                                            var localPath = 'uploads/temp' + kkk + '.jpg';
                                            kkk++;
                                            downloadImage(pro['img' + i], localPath, () => {
                                                sftp.put(localPath, remotePath)
                                                    .then(response => {
                                                        // callbackProduct(null);
                                                        // console.log('image ' + i + ' uploaded');
                                                    })
                                                    .catch(error => {
                                                        console.log('upload error: ', error);
                                                    });
                                            });
                                        });
                                        callbackProduct(null);
                                    }, (errorList) => {
                                        if (errorList) {
                                            console.log('errorList: ', errorList);
                                        } else {
                                            console.log('images have been uploaded just before');
                                        }
                                    });
                                })
                                .catch(error => console.log('upload error: ', error));
                        }
                    });

                })
                .catch(error => console.log('connect error: ', error));
        })
        .catch(err => console.log('collectError: ', err));

};

const daysBetween = function (date1, date2) {
    var one_day = 1000 * 60 * 60 * 24;
    var temp = new Date(date1);
    var date1_ms = temp.getTime();
    var date2_ms = date2;

    var difference_ms = date2_ms - date1_ms;

    return Math.round(difference_ms / one_day);
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

const downloadImage = function (uri, filename, callback) {
    request.head(uri, function (err, res, body) {
        request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
    });
};
const jsUcfirst = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
const getShortenColorName = function (str) {
    var returnColor = '';
    threeColorKeys.forEach(colorItemKey => {
        // if( colorItemKey == str.toLowerCase() ) {
        if (str.toLowerCase().indexOf(colorItemKey) != -1) {
            returnColor = ThreeColorList[colorItemKey];
        }
    });
    return returnColor;
}
const writeProductFile = function (data, isFirst, callback) {
    if (isFirst == 1) {
        fs.appendFile("uploads/product.txt", data, function (err) {
            if (err) {
                callback(err);
            }
        });
        callback(null, 'success');
    } else {
        fs.appendFile("uploads/product.txt", ', ' + data, function (err) {
            if (err) {
                callback(err);
            }
        });
        callback(null, 'success');
    }
}
const deleteAndInitialize = function (filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) throw err;
            console.log('product file was deleted');
            fs.writeFile(filePath, '', function (initErr) {
                if (initErr) {
                    console.log(initErr);
                }
                console.log('init empty');
            });
        });
    }
}