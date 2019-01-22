const Client = require('ssh2-sftp-client')
const request = require('request')
const fs = require('fs')
/**
 * GET /
 * Inventory page.
 */
exports.index = (req, res) => {
    
    // var sftp = new Client()
    // sftp.connect({
    //     host: process.env.SFTP_HOST,
    //     port: process.env.SFTP_PORT,
    //     username: process.env.SFTP_USERNAME,
    //     password: process.env.SFTP_PASSWORD
    // })
    // .then( () => {
    //     var stream;
    //     download('https://cdn.shopify.com/s/files/1/0058/8706/6223/products/Ultraboost_Shoes_Black_CM8110_01_standard_360x.jpg', 'google.jpg', () => {
    //         sftp.put('google.jpg', '/productimages/product1.jpg')
    //         .then(response => {
    //             console.log('image uploaded')
    //         })
    //         .catch( error => {
    //             console.log('upload error: ', error)
    //         })
    //     })
    // })
    // .catch( error => {
    //     console.log('connect error: ', error)
    // })

    var currentDate = new Date()
    var isoDate = currentDate.toLocaleString("en-US", {
        hour12: false
    }).split(', ')
    var month = isoDate[0].split('/')[0]
    var day = isoDate[0].split('/')[1]
    var year = isoDate[0].split('/')[2]
    if (month < 10) {
        month = '0' + month
    }
    if (day < 10) {
        day = '0' + day
    }
    
    var newDateString = year + month + day + isoDate[1].replace(/\:/g, '')
    console.log('result: ', newDateString)
}

exports.uploadImages = (req, res) => {
    const productViewList = req.body.productList

    // Uploading all images of variants by 300 ones at a time.
    var kkk = 0
    var downloadImageList = []
    var tempList = []
    const imageUploadLimit = 300
    eachSeries(productViewList, (pro, callbackProduct) => {
        [1, 2, 3, 4, 5].forEach(i => {
            var remotePath = '/productimages/product_' + pro.variantId + '_' + i + '.jpg'
            var localPath = 'uploads/product_' + pro.variantId + '_' + i + '.jpg'
            kkk++
            if (pro['img' + i]) {
                var temp = [pro['img' + i], localPath, remotePath]
                tempList.push(temp)
                if(kkk % imageUploadLimit == 0) {
                    downloadImageList.push(tempList)
                    tempList = []
                }
            }
        })
        callbackProduct(null)
    }, (errorList) => {
        if (errorList) {
            console.log('errorList: ', errorList)
        } else {
            console.log('images have been uploaded just before')
            // Uploading part
            eachOfSeries(
                downloadImageList,
                (subList, key, subCallback) => {
                    async.each(
                        subList,
                        (item, itemCallback) => {
                            downloadImage(item[0], item[1], () => {
                                // upload from local to sftp
                                sftp.put(item[1], item[2])
                                .then(response => {
                                    // console.log(item[1] + ' uploaded');
                                    itemCallback()
                                })
                                .catch(error => {
                                    if (error) {
                                        console.log('sftp error: ', error);
                                        itemCallback(error)
                                    }
                                })
                            })
                        },
                        (err) => {
                            if (err) {
                                console.log('suberr')
                                subCallback(err)
                            } else {
                                console.log('processed ' + imageUploadLimit)
                                // Delete subList from local
                                deleteImageList(subList, (err) => {
                                    if (err) {
                                        console.log('Error in deleting files')
                                        throw new Error('Could not delete files successfully.')
                                    } else {
                                        console.log('deleted ' + imageUploadLimit)
                                        subCallback()
                                    }
                                })
                            }
                        }
                    )
                },
                (err) => {
                    console.log(err)
                }         
            )
        }
    })
}

const download = function(uri, filename, callback){
    request.head(uri, function(err, res, body){
      console.log('content-type:', res.headers['content-type'])
      console.log('content-length:', res.headers['content-length'])
  
      request(uri).pipe(fs.createWriteStream(filename)).on('data', callback)
    })
}

const downloadImage = function (uri, filename, callback) {
    request.head(uri, function (err, res, body) {
        request(uri).pipe(fs.createWriteStream(filename)).on('close', callback)
    })
}
const deleteImageList = function (fileList, callback) {
    if (fileList.length > 0) {
        fileList.forEach(file => {
            if (fs.existsSync(file[1])) {
                fs.unlink(file[1], (err) => {
                    if (err) throw err
                })
            }
        })
    }
    callback(null)
}