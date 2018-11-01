const Client = require('ssh2-sftp-client');
const request = require('request');
const fs = require('fs');
/**
 * GET /
 * Inventory page.
 */
exports.index = (req, res) => {
    
    var sftp = new Client();
    sftp.connect({
        host: process.env.SFTP_HOST,
        port: process.env.SFTP_PORT,
        username: process.env.SFTP_USERNAME,
        password: process.env.SFTP_PASSWORD
    })
    .then( () => {
        var stream;
        download('https://cdn.shopify.com/s/files/1/0058/8706/6223/products/Ultraboost_Shoes_Black_CM8110_01_standard_360x.jpg', 'google.jpg', () => {
            sftp.put('google.jpg', '/productimages/product1.jpg')
            .then(response => {
                console.log('image uploaded');
            })
            .catch( error => console.log('upload error: ', error) );
        });
    })
    .catch( error => console.log('connect error: ', error) );
};

const download = function(uri, filename, callback){
    request.head(uri, function(err, res, body){
      console.log('content-type:', res.headers['content-type']);
      console.log('content-length:', res.headers['content-length']);
  
      request(uri).pipe(fs.createWriteStream(filename)).on('data', callback);
    });
};