const commonHelper = require('./common')
const Shopify = require('shopify-api-node')
const fs = require('fs')
const Client = require('ssh2-sftp-client')
const TaxCodeList = require('../config/constants').TaxCodeList
const ProductTypeList = require('../config/constants').ProductTypeList
const TaxonomyList = require('../config/constants').TaxonomyList
const delay = require('delay')
const TSV = require('tsv')
const Color = require('../models/Color')

module.exports = {
    createFeed: async (vendorInfo, connectorInfo, callback) => {
        var metaList
        const sftp = new Client()
        var taxCodeKeys = Object.keys(TaxCodeList)
        var taxonomyKeys = Object.keys(TaxonomyList)
        var productDataList = new Array()
        var bestSellCollectionId
        var shopData
        var BreakException = {}
        
        const productFileName = 'uploads/product-' + vendorInfo.api.apiShop + '.txt'
        const shopify = new Shopify({
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
        // Get color list from db
        Color.findOne({}, (colorError, color) => {
            if (colorError) {
                return next(colorError)
            } else {
                colorList = color.colorList
            }
        });
        
        // Initialize product feed file with empty
        commonHelper.deleteAndInitialize(productFileName)

        // Check user's active/inactive status.
        shopify.metafield.list().then(async metas => {
            metaList = metas.reduce((r, a) => {
                r[a.owner_id] = r[a.owner_id] || []
                r[a.owner_id].push(a)
                return r
            }, Object.create(null))
        }).catch((e) => {
            console.log(e)
            callback({error: 'meta'})
        });

        shopify.shop.get().then((shop) => {
            shopData = shop
        }).catch(err => {
            console.log('Error in getting shop information', err)
            callback({error: 'shop'})
        });

        await delay(2000)

        shopify.product.list({
            limit: 250,
            published_status: 'published'
        }).then(products => {
            products.forEach(product => {
                const metafields = metaList[product.id]
                var productCategory = ''
                var isFirstVariant = true;
                var firstVariantColor = ''
                product.variants.forEach((variant) => {
                    var productData = {}
                    productData.Brand = vendorInfo.brandName
                    productData.Category = productCategory

                    productData.ProductCode = ''
                    productData.ParentCode = ''
                    productData.ProductName = '"' + product.title.replace(/\r?\n|\r/g, '').replace(/\"/g, '""') + '"'
                    productData.ProductDescription = ''
                    if (product.body_html) {
                        productData.ProductDescription = product.body_html.replace(/(<([^>]+)>)/ig, "")
                        productData.ProductDescription = '"' + productData.ProductDescription.replace(/\r?\n|\r/g, '').replace(/\"/g, '""') + '"'
                    }

                    if (product.published_at) {
                        var publishYear = product.published_at.substr(0, 4)
                        var publishMonth = parseInt(product.published_at.substr(5, 2))
                        var publishSeason = ''
                        if (publishMonth < 6 && publishMonth > 2) {
                            publishSeason = 'Spring'
                        } else if (publishMonth > 5 && publishMonth < 9) {
                            publishSeason = 'Summer'
                        } else if (publishMonth > 8 && publishMonth < 12) {
                            publishSeason = 'Fall'
                        } else {
                            publishSeason = 'Winter'
                        }
                    }
                    
                    var ColorName = ''
                    var Size = ''
                    var ProductCodeOption = ''
                    if (product.options.length > 0) {
                        var keyIndex = 1
                        product.options.forEach(option => {
                            if (option.name.toLowerCase() == 'size') {
                                Size = variant['option' + keyIndex]
                            }
                            if (option.name.toLowerCase() == 'color') {
                                var color = variant['option' + keyIndex]
                                ColorName = commonHelper.jsUcfirst(color)
                                if (isFirstVariant) {
                                    firstVariantColor = color
                                    firstVariantSku = variant.sku
                                    firstVariantId = variant.id
                                    isFirstVariant = false
                                }
                            }
                            if (option.name.toLowerCase() == 'productcode' || option.name.toLowerCase() == 'product code') {
                                ProductCodeOption = 'option' + keyIndex
                            }

                            keyIndex++
                        });
                    }
                    if (firstVariantColor == '' && isFirstVariant) {
                        firstVariantId = variant.id
                        isFirstVariant = false
                    }
                    var shortColorName = commonHelper.getShortenColorName(ColorName)
                    var shortFirstColorName = commonHelper.getShortenColorName(firstVariantColor)
                    if (ProductCodeOption == '') {
                        productData.ProductCode = shortColorName==''?variant.product_id.toString() : variant.product_id.toString() + '_' + shortColorName
                        productData.ParentCode = shortFirstColorName==''?variant.product_id.toString() : variant.product_id.toString() + '_' + shortFirstColorName
                    } else {
                        productData.ProductCode = shortColorName==''?variant[ProductCodeOption] : variant[ProductCodeOption] + '_' + shortColorName
                        productData.ParentCode = shortFirstColorName==''?variant[ProductCodeOption] : variant[ProductCodeOption] + '_' + shortFirstColorName
                    }

                    var ProductDescription2 = ''
                    var ProductOverview = ''
                    var ProductType = 'Apparel'

                    try {
                        ProductTypeList.forEach(ProductTypeItem => {
                            if (ProductTypeItem.toLowerCase() == product.product_type.toLowerCase()) {
                                ProductType = ProductTypeItem
                                throw BreakException
                            }
                        })
                    } catch (e) {
                        if (e !== BreakException) throw e
                    }

                    // Regenerate the `Category` field by `ProductType`
                    try {
                        taxonomyKeys.forEach(taxoKey => {
                            var lowercaseTaxonomy = TaxonomyList[taxoKey].toLowerCase()
                            var splittedTaxonomyByGreater = lowercaseTaxonomy.split(' > ')
                            var taxoItem = splittedTaxonomyByGreater[splittedTaxonomyByGreater.length - 1]
                            if (taxoItem.indexOf(ProductType.toLowerCase()) != -1) {
                                productData.Category = TaxonomyList[taxoKey]
                                throw BreakException
                            }
                        });
                    } catch (e) {
                        if (e !== BreakException) throw e
                    }

                    var ProductVideo = ''
                    var MaterialContent = ''
                    var VendorModelNumber = ''
                    var MSRP = variant.price
                    var MinQty = 1
                    var MaxQty = variant.inventory_quantity > 0 ? variant.inventory_quantity:1
                    var UPC = variant.id
                    var MoreInfo = ''
                    var WarehouseCode = "001".toString()
                    if (metafields) {
                        metafields.forEach(meta => {
                            if (meta.key == 'productDescription2') {
                                ProductDescription2 = meta.value
                            }
                            if (meta.key == 'overview') {
                                ProductOverview = meta.value
                            }
                            if (meta.key == 'productVideo') {
                                ProductVideo = meta.value
                            }
                            if (meta.key == 'materialContent') {
                                MaterialContent = meta.value
                            }
                            if (meta.key == 'vendorModelNumber') {
                                VendorModelNumber = meta.value
                            }
                            if (meta.key == 'msrp') {
                                MSRP = meta.value
                            }
                            if (meta.key == 'minQty') {
                                MinQty = meta.value
                            }
                            if (meta.key == 'maxQty') {
                                MaxQty = meta.value
                            }
                            if (meta.key == 'upc' && meta.value != '') {
                                UPC = meta.value
                            }
                            if (meta.key == 'moreInfo') {
                                MoreInfo = meta.value
                            }
                            if (meta.key == 'warehouseCode') {
                                WarehouseCode = meta.value
                            }
                        });
                    }
                    if (metafields && metafields.length > 0) {
                        productData.ProductDescription2 = ProductDescription2
                        productData.ProductOverview = ProductOverview
                        productData.ProductType = ProductType
                        productData.MaterialContent = MaterialContent
                        productData.CountryOfOrigin = shopData.country
                        productData.VendorModelNumber = VendorModelNumber
                        productData.Vendor = product.vendor
                        if (product.published_at) {
                            productData.Season = publishSeason + ' ' + publishYear
                        } else {
                            productData.Season = ''
                        }
                        productData.ColorName = ColorName.replace(' ', '')
                        productData.Size = Size
                        productData.DateAvailable = ''
                        if (product.published_at) {
                            productData.DateAvailable = product.published_at.substr(5, 2) + '/' + product.published_at.substr(8, 2) + '/' + publishYear
                        }
                        productData.Gender = 'Mens'
                        if (product.gender) {
                            productData.Gender = product.gender
                        }
                        productData.Weight = 0
                        if (product.weight) {
                            productData.Weight = product.weight
                        } else {
                            productData.Weight = variant.weight
                        }
                        if (variant.weight_unit == 'g') {
                            productData.Weight = parseFloat(productData.Weight / 453.59237).toFixed(2)
                        } else if (variant.weight_unit == 'kg') {
                            productData.Weight = parseFloat(productData.Weight / 0.45359237).toFixed(2)
                        }
                        if (productData.Weight == 0) {
                            productData.Weight = 1
                        }
                        productData.Cost = ''
                        productData.Price = variant.price
                        productData.MSRP = MSRP
                        productData.Title = '"' + product.title.replace(/\r?\n|\r/g, '').replace(/\"/g, '""') + '"'
                        productData.MinQty = MinQty
                        productData.MaxQty = MaxQty
                        productData.IsBestSeller = collect.collection_id == bestSellCollectionId ? true : false
                        productData.IsNew = false
                        productData.IsExclusive = false
                        productData.IsSale = false
                        productData.SizeGroup = ''
                        productData.ColorGroup = ''

                        productData.ZoomImage1 = ''
                        productData.ProductVideo = ProductVideo
                        if (variant.sku != '') {
                            // productData.SKU = variant.sku + commonHelper.getShortenColorName(ColorName) + Size
                            productData.SKU = variant.id
                        } else {
                            // productData.SKU = productData.ProductCode
                            productData.SKU = variant.id
                        }
                        productData.SkuPrice = variant.price
                        if (variant.compare_at_price && variant.compare_at_price > 0) {
                            productData.IsSale = true
                            productData.SkuPrice = variant.compare_at_price?variant.compare_at_price:variant.price
                        }
                        productData.UPC = UPC
                        productData.QtyOnHand = variant.inventory_quantity > 0 ? variant.inventory_quantity : 0
                        productData.MoreInfo = MoreInfo
                        productData.TaxCode = 'PC040100'
                        try {
                            taxCodeKeys.forEach(key => {
                                TaxCodeList[key].forEach(taxType => {
                                    if (product.product_type != '' && taxType.indexOf(product.product_type) !== -1) {
                                        productData.TaxCode = key
                                        throw BreakException
                                    }
                                })
                            });
                        } catch (e) {
                            if (e !== BreakException) throw e
                        }
                        
                        if (!productData.TaxCode) {
                            productData.TaxCode = ''
                        }
                        productData.FinalSale = false
                        productData.CurrencyCode = shopData.currency
                        productData.WarehouseCode = WarehouseCode

                    } else {
                        productData.ProductDescription2 = ''
                        productData.ProductOverview = ''
                        productData.ProductType = ProductType
                        productData.MaterialContent = ''
                        productData.CountryOfOrigin = shopData.country
                        productData.VendorModelNumber = variant.sku
                        productData.Vendor = product.vendor
                        if (product.published_at) {
                            productData.Season = publishSeason + ' ' + publishYear
                        } else {
                            productData.Season = ''
                        }
                        productData.ColorName = ColorName.replace(' ', '')
                        productData.Size = Size
                        productData.DateAvailable = ''
                        if (product.published_at) {
                            productData.DateAvailable = product.published_at.substr(5, 2) + '/' + product.published_at.substr(8, 2) + '/' + publishYear
                        }
                        if (product.gender) {
                            productData.Gender = product.gender
                        } else {
                            productData.Gender = 'Mens'
                        }
                        if (product.weight) {
                            productData.Weight = product.weight
                        } else {
                            productData.Weight = variant.weight
                        }
                        if (variant.weight_unit == 'g') {
                            productData.Weight = parseFloat(productData.Weight / 453.59237).toFixed(2)
                        } else if (variant.weight_unit == 'kg') {
                            productData.Weight = parseFloat(productData.Weight / 0.45359237).toFixed(2)
                        }
                        if (productData.Weight == 0) {
                            productData.Weight = 1
                        }
                        productData.Cost = ''
                        productData.Price = variant.price
                        productData.MSRP = variant.price
                        productData.Title = '"' + product.title.replace(/\r?\n|\r/g, '').replace(/\"/g, '""') + '"'
                        productData.MinQty = MinQty
                        productData.MaxQty = MaxQty
                        // productData.IsBestSeller = collect.collection_id == bestSellCollectionId ? true : false
                        productData.IsBestSeller = false
                        productData.IsNew = false
                        productData.IsExclusive = false
                        productData.IsSale = false
                        productData.SizeGroup = ''
                        productData.ColorGroup = ''

                        productData.ZoomImage1 = ''
                        productData.ProductVideo = ''
                        if (variant.sku != '') {
                            // productData.SKU = variant.sku + commonHelper.getShortenColorName(ColorName) + Size
                            productData.SKU = variant.id
                        } else {
                            // productData.SKU = productData.ProductCode
                            productData.SKU = variant.id
                        }
                        productData.SkuPrice = variant.price
                        if (variant.compare_at_price && variant.compare_at_price > 0) {
                            productData.IsSale = true
                            productData.SkuPrice = variant.compare_at_price?variant.compare_at_price:variant.price
                        }
                        productData.UPC = UPC
                        productData.QtyOnHand = variant.inventory_quantity > 0 ? variant.inventory_quantity : 0
                        productData.MoreInfo = MoreInfo
                        productData.TaxCode = 'PC040100'
                        try {
                            taxCodeKeys.forEach((key) => {
                                TaxCodeList[key].forEach((taxType) => {
                                    if (product.product_type != '' && taxType.indexOf(product.product_type) !== -1) {
                                        productData.TaxCode = key
                                        throw BreakException
                                    }
                                })
                            });
                        } catch (e) {
                            if (e !== BreakException) throw e
                        }
                        
                        if (!productData.TaxCode) {
                            productData.TaxCode = ''
                        }
                        productData.FinalSale = false
                        productData.CurrencyCode = shopData.currency
                        productData.WarehouseCode = "001".toString()
                    }

                    if (variant.image_id) {
                        var variant_image = commonHelper.getVariantImage(product.images, variant.image_id)
                        var splittedByDot = variant_image.split('.')
                        var lastBlock = '.' + splittedByDot[splittedByDot.length - 1]
                        var splittedByExtend = variant_image.split(lastBlock)
                        productData.ZoomImage1 = splittedByExtend[0] + '_1024x' + lastBlock
                    } else {
                        if (product.image) {
                            var splittedByDot = product.image.src.split('.')
                            var extendOfFile = '.' + splittedByDot[splittedByDot.length - 1]
                            var splittedByExtend = product.image.src.split(extendOfFile)
                            productData.ZoomImage1 = splittedByExtend[0] + '_1024x' + extendOfFile
                        }
                    }

                    productData.FreeShip = true
                    productData.Action = 'Activate'

                    productDataList.push(productData);
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
                        callback({error: 'file'})
                    } else {
                        sftp.put(productFileName, '/incoming/products/products01.txt')
                        .then(response => {
                            commonHelper.addStatus(vendorInfo, connectorInfo, 2, (statusErr) => {
                                if (statusErr) {
                                    callback({error: 'db'})
                                } else {
                                    callback(null)
                                }
                            });
                            
                            sftp.end()
                        })
                        .catch(error => {
                            commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                                if (statusErr) {
                                    callback({error: 'upload and db'})
                                } else {
                                    callback({error: 'upload'})
                                }
                            });
                        });
                    }
                });

            })
            .catch(error => {
                commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                    if (statusErr) {
                        callback({error: 'connect and db'})
                    } else {
                        callback({error: 'connect'})
                    }
                });
            });
        })
        .catch(err => {
            commonHelper.addStatus(vendorInfo, connectorInfo, 0, (statusErr) => {
                if (statusErr) {
                    callback({error: 'store and db'})
                } else {
                    callback({error: 'store'})
                }
            });
        });
    },
    
    bar: () => {
        console.log('arrive bar')
    }
}