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
const multer = require('multer');

const upload = multer({ dest: path.join(__dirname, 'uploads') });

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
  if (req.path === '/api/upload') {
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
app.get('/users', passportConfig.isAdmin, usersController.index);
app.get('/users/add', passportConfig.isAdmin, usersController.addUser);
app.post('/users/add', passportConfig.isAdmin, usersController.saveUser);
app.get('/users/:userId', passportConfig.isAdmin, usersController.getUser);
app.post('/users/update', passportConfig.isAdmin, usersController.updateUser);
app.get('/users/delete/:userId', passportConfig.isAdmin, usersController.deleteUser);
app.get('/users/activate/:userId', passportConfig.isAdmin, usersController.activateUser);
app.get('/users/deactivate/:userId', passportConfig.isAdmin, usersController.deactivateUser);
// Vendor management
app.get('/vendors', passportConfig.isAdmin, vendorsController.index);
app.get('/vendors/add', passportConfig.isAdmin, vendorsController.addVendor);
app.post('/vendors/add', passportConfig.isAdmin, vendorsController.saveVendor);
app.get('/vendors/:vendorId', passportConfig.isAdmin, vendorsController.getVendor);
app.post('/vendors/update', passportConfig.isAdmin, vendorsController.updateVendor);
app.get('/vendors/delete/:vendorId', passportConfig.isAdmin, vendorsController.deleteVendor);
app.get('/vendors/enable/:vendorId', passportConfig.isAdmin, vendorsController.enableVendor);
app.get('/vendors/disable/:vendorId', passportConfig.isAdmin, vendorsController.disableVendor);
// Connector management. Connectors belongs a vendor.
app.get('/vendors/:vendorId/connectors', passportConfig.isAdmin, connectorsController.listConnector);
app.get('/vendors/:vendorId/connectors/add', passportConfig.isAdmin, connectorsController.addConnector);
app.post('/vendors/:vendorId/connectors/add', passportConfig.isAdmin, connectorsController.saveConnector);
app.get('/vendors/:vendorId/connectors/:connectorId', passportConfig.isAdmin, connectorsController.getConnector);
app.post('/vendors/:vendorId/connectors/update', passportConfig.isAdmin, connectorsController.updateConnector);
app.get('/vendors/:vendorId/connectors/delete/:connectorId', passportConfig.isAdmin, connectorsController.deleteConnector);
app.get('/vendors/:vendorId/connectors/activate/:connectorId', passportConfig.isAdmin, connectorsController.activateConnector);
app.get('/vendors/:vendorId/connectors/inactivate/:connectorId', passportConfig.isAdmin, connectorsController.inactivateConnector);

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
});

module.exports = app;
