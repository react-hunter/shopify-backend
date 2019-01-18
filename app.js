/**
 * Module dependencies.
 */
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const bodyParser = require('body-parser');
const logger = require('morgan');
const chalk = require('chalk');
const errorHandler = require('errorhandler');
const lusca = require('lusca');
const dotenv = require('dotenv');
const MongoStore = require('connect-mongo')(session);
const flash = require('express-flash');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');
const expressValidator = require('express-validator');
const expressStatusMonitor = require('express-status-monitor');
const sass = require('node-sass-middleware');
const Promise = require('bluebird');
const multer = require('multer');
const User = require('./models/User');
const Color = require('./models/Color');
const upload = multer({ dest: path.join(__dirname, 'uploads') });

Promise.promisifyAll(mongoose);
/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.load({ path: '.env' });

/**
 * Controllers (route handlers).
 */
const homeController = require('./controllers/home');
const userController = require('./controllers/user');
const contactController = require('./controllers/contact');

const systemstatusController = require('./controllers/systemstatus');
const reportsController = require('./controllers/reports');
const vendorsController = require('./controllers/vendors');
const usersController = require('./controllers/users');
const connectorsController = require('./controllers/connectors');

const productController = require('./controllers/feeds/product');
const inventoryController = require('./controllers/feeds/inventory');
const orderController = require('./controllers/feeds/order');
const refundController = require('./controllers/feeds/refund');

const webhookController = require('./controllers/feeds/webhook');

const testcodeController = require('./controllers/testcode');

/**
 * API keys and Passport configuration.
 */
const passportConfig = require('./config/passport');

/**
 * Create Express server.
 */
const app = express();

/**
 * Connect to MongoDB.
 */
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useNewUrlParser', true);
mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.on('error', (err) => {
  console.error(err);
  console.log('%s MongoDB connection error. Please make sure MongoDB is running.', chalk.red('✗'));
  process.exit();
});

/**
 * Express configuration.
 */
app.set('host', process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0');
app.set('port', process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(expressStatusMonitor());
app.use(compression());
app.use(sass({
  src: path.join(__dirname, 'public'),
  dest: path.join(__dirname, 'public')
}));
app.use(logger('dev'));
// app.use(
//   bodyParser.json({
//     type:'*/*',
//     limit: '50mb',
//     verify: function(req, res, buf) {
//       if (req.url.startsWith('/webhook/')) {
//         req.rawBody = buf;
//       }
//     }
//   })
// );
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: process.env.SESSION_SECRET,
  cookie: { maxAge: 1209600000 }, // two weeks in milliseconds
  store: new MongoStore({
    url: process.env.MONGODB_URI,
    autoReconnect: true,
  })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use((req, res, next) => {
  if ( req.path === '/api/upload' || req.path.indexOf('/webhook') > -1 ) {
    next();
  } else {
    lusca.csrf()(req, res, next);
  }
});
app.use(lusca.xframe('SAMEORIGIN'));
app.use(lusca.xssProtection(true));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});
app.use((req, res, next) => {
  // After successful login, redirect back to the intended page
  if (!req.user
    && req.path !== '/login'
    && req.path !== '/signup'
    && !req.path.match(/^\/auth/)
    && !req.path.match(/\./)) {
    req.session.returnTo = req.originalUrl;
  } else if (req.user
    && (req.path === '/account' || req.path.match(/^\/api/))) {
    req.session.returnTo = req.originalUrl;
  }
  next();
});

app.use('/', express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 }));
app.use('/js/lib', express.static(path.join(__dirname, 'node_modules/popper.js/dist/umd'), { maxAge: 31557600000 }));
app.use('/js/lib', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js'), { maxAge: 31557600000 }));
app.use('/js/lib', express.static(path.join(__dirname, 'node_modules/jquery/dist'), { maxAge: 31557600000 }));
app.use('/webfonts', express.static(path.join(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts'), { maxAge: 31557600000 }));
app.use('/productimages', express.static(path.join(__dirname, 'uploads'), { maxAge: 31557600000 }));

/**
 * Primary app routes.
 */
app.get('/', homeController.index);
app.get('/login', userController.getLogin);
app.post('/login', userController.postLogin);
app.get('/logout', userController.logout);
app.get('/forgot', userController.getForgot);
app.post('/forgot', userController.postForgot);
app.get('/reset/:token', userController.getReset);
app.post('/reset/:token', userController.postReset);
app.get('/signup', userController.getSignup);
app.post('/signup', userController.postSignup);
app.get('/contact', contactController.getContact);
app.post('/contact', contactController.postContact);

app.get('/account', passportConfig.isAuthenticated, userController.getAccount);
app.post('/account/profile', passportConfig.isAuthenticated, userController.postUpdateProfile);
app.post('/account/password', passportConfig.isAuthenticated, userController.postUpdatePassword);
app.post('/account/delete', passportConfig.isAuthenticated, userController.postDeleteAccount);
app.get('/account/unlink/:provider', passportConfig.isAuthenticated, userController.getOauthUnlink);
app.get('/systemstatus', passportConfig.isAuthenticated, systemstatusController.index);
app.get('/reports', passportConfig.isAuthenticated, reportsController.index);

// User management
app.get('/users', passportConfig.isSuper, usersController.index);
app.get('/users/add', passportConfig.isSuper, usersController.addUser);
app.post('/users/add', passportConfig.isSuper, usersController.saveUser);
app.get('/users/:userId', passportConfig.isSuper, usersController.getUser);
app.post('/users/update', passportConfig.isSuper, usersController.updateUser);
app.get('/users/delete/:userId', passportConfig.isSuper, usersController.deleteUser);
app.get('/users/activate/:userId', passportConfig.isSuper, usersController.activateUser);
app.get('/users/deactivate/:userId', passportConfig.isSuper, usersController.deactivateUser);
// Vendor management
app.get('/vendors', passportConfig.isSuper, vendorsController.index);
app.get('/vendors/add', passportConfig.isSuper, vendorsController.addVendor);
app.post('/vendors/add', passportConfig.isSuper, vendorsController.saveVendor);
app.get('/vendors/:vendorId', passportConfig.isAuthenticated, vendorsController.getVendor);
app.post('/vendors/update', passportConfig.isAdmin, vendorsController.updateVendor);
app.get('/vendors/delete/:vendorId', passportConfig.isSuper, vendorsController.deleteVendor);
app.get('/vendors/enable/:vendorId', passportConfig.isSuper, vendorsController.enableVendor);
app.get('/vendors/disable/:vendorId', passportConfig.isSuper, vendorsController.disableVendor);
// Connector management. Connectors belongs a vendor.
app.get('/vendors/:vendorId/connectors', passportConfig.isAuthenticated, connectorsController.listConnector);
app.get('/vendors/:vendorId/connectors/add', passportConfig.isAdmin, connectorsController.addConnector);
app.post('/vendors/:vendorId/connectors/add', passportConfig.isAdmin, connectorsController.saveConnector);
app.get('/vendors/:vendorId/connectors/:connectorId', passportConfig.isAuthenticated, connectorsController.getConnector);
app.post('/vendors/:vendorId/connectors/update', passportConfig.isAdmin, connectorsController.updateConnector);
app.get('/vendors/:vendorId/connectors/delete/:connectorId', passportConfig.isSuper, connectorsController.deleteConnector);
app.get('/vendors/:vendorId/connectors/activate/:connectorId', passportConfig.isSuper, connectorsController.activateConnector);
app.get('/vendors/:vendorId/connectors/inactivate/:connectorId', passportConfig.isSuper, connectorsController.inactivateConnector);
// Call to feeds
app.get('/product', passportConfig.isAuthenticated, productController.index);
app.get('/inventory', passportConfig.isAuthenticated, inventoryController.index);
app.get('/shipment', passportConfig.isAuthenticated, orderController.shipment);
app.get('/order', passportConfig.isAuthenticated, orderController.index);
app.get('/refund', passportConfig.isAuthenticated, refundController.index);
// Utilities
app.get('/vendors/synchronizeColors/:vendorId', passportConfig.isSuper, vendorsController.synchronizeColors);

// Test for webhook


app.post('/webhook/productChange', /*passportConfig.verifyWebHook, */webhookController.productChange);
app.post('/webhook/fulfill', webhookController.orderFulfill);
app.post('/webhook/refund', webhookController.refundCreate);

// From KWI
app.post('/kwi/orderCreate', webhookController.kwiOrderCreate);
app.post('/kwi/refundCreate', webhookController.kwiRefundCreate)

// To test some code.
app.get('/testcode', testcodeController.index);

if (process.env.NODE_ENV === 'development') {
  app.use(errorHandler());
} else {
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Server Error');
  });
}

/**
 * Start Express server.
 */
app.listen(app.get('port'), () => {
  console.log('%s App is running at http://localhost:%d in %s mode', chalk.green('✓'), app.get('port'), app.get('env'));
  console.log('  Press CTRL-C to stop\n');
  // Create Timer for product webhook
  const productTimer = setInterval(webhookController.productTimer, 86400000);
  // const productTimer = setInterval(webhookController.productTimer, 30000);
});
User.find({type: 'superadmin'}, (err, superusers) => {
  if (err) {
    console.log(err);
  }
  // console.log('user at first : ', user[0]);
  if (superusers.length == 0) {
    var initSuperUser = new User();
    initSuperUser.email = 'admin@admin.com';
    initSuperUser.active = 'yes';
    initSuperUser.password = 'admin';
    initSuperUser.profile.name = 'admin';
    initSuperUser.type = 'superadmin';

    initSuperUser.save(saveErr => {
      if (saveErr) {
        console.log(saveErr);
      }
    });
  }
});
Color.find({}, (err, colors) => {
  if (err) {
    console.log(err);
  }

  if (colors.length === 0) {
    var initColor = new Color();
    let initColorList = [
      {colorName: 'clear', shortName: 'CLR'},
      {colorName: 'black', shortName: 'BLK'},
      {colorName: 'brown', shortName: 'BRN'},
      {colorName: 'red', shortName: 'RED'},
      {colorName: 'orange', shortName: 'ORN'},
      {colorName: 'yellow', shortName: 'YEL'},
      {colorName: 'green', shortName: 'GRN'},
      {colorName: 'blue', shortName: 'BLU'},
      {colorName: 'violet', shortName: 'VIO'},
      {colorName: 'grey', shortName: 'GRY'},
      {colorName: 'gray', shortName: 'GRY'},
      {colorName: 'white', shortName: 'WHT'},
      {colorName: 'pink', shortName: 'PNK'}
    ]
    initColor.colorList = initColorList;
    initColor.save();
  }
});
module.exports = app;
