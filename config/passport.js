const passport = require('passport')
const { Strategy: LocalStrategy } = require('passport-local')
var crypto = require('crypto')

const User = require('../models/User')

passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user)
  })
})

/**
 * Sign in using Email and Password.
 */
passport.use(new LocalStrategy({
  usernameField: 'email'
}, (email, password, done) => {
  User.findOne({
    email: email.toLowerCase()
  }, (err, user) => {
    if (err) {
      return done(err)
    }
    if (!user) {
      return done(null, false, {
        msg: `Email ${email} not found.`
      })
    }
    user.comparePassword(password, (err, isMatch) => {
      if (err) {
        return done(err)
      }
      if (isMatch) {
        return done(null, user)
      }
      return done(null, false, {
        msg: 'Invalid email or password.'
      })
    })
  })
}))

/**
 * Login Required middleware.
 */
exports.isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next()
  } else {
    res.redirect('/login')
  }
}

exports.isSuper = (req, res, next) => {
  if (req.isAuthenticated()) {

    if (req.user.type == 'superadmin') {
      return next()
    } else {
      req.flash('info', {
        msg: 'Only Super Admin can access this page.'
      })
      res.redirect('/')
    }
  } else {
    res.redirect('/login')
  }
}
exports.isAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user.active == 'yes') {

    if (req.user.type == 'superadmin' || req.user.type == 'admin') {
      return next()
    } else {
      req.flash('info', {
        msg: 'Only Super Administrator and Admin User can access this page.'
      })
      res.redirect('/')
    }
  } else {
    res.redirect('/login')
  }
}

exports.isUser = (req, res, next) => {
  if (req.isAuthenticated() && req.user.active == 'yes') {
    return next()
  } else {
    req.flash('info', {
      msg: 'Only registered Users can access this page.'
    })
    res.redirect('/login')
  }
}

/**
 * Authorization Required middleware.
 */
exports.isAuthorized = (req, res, next) => {
  const provider = req.path.split('/').slice(-1)[0]
  const token = req.user.tokens.find(token => token.kind === provider)
  if (token) {
    next()
  } else {
    res.redirect(`/auth/${provider}`)
  }
}

exports.verifyWebHook = (req, res, next) => {
  res.status(200).send()
  var shopifyHmac = req.headers['x-shopify-hmac-sha256']
  req.hasher = crypto.createHmac('sha256', 'bc922453766881cb718d11582bce5f2e8cc542cc2bb6824cc55ebc11a7f6e0ff')

  req.on('data', function (chunk) {
      req.hasher.write(chunk)
  })

  req.on('end', function() {
    req.hasher.end()

    var hash = req.hasher.read()
    hash = new Buffer(hash).toString('base64')

    if (hash === shopifyHmac) {
      console.log('verified')
      next()
    } else {
      console.log('no')
      return false
    }
  })
}

// exports.verifyWebHook = (req, res, next) => {
//   res.status(200).send()
//   const sharedSecretKey = '2c0518f1758c93a67aab653c3d9baa62'
//   const signature = 'bc922453766881cb718d11582bce5f2e8cc542cc2bb6824cc55ebc11a7f6e0ff'
//   var generated_hash = crypto.createHmac('sha256', signature)
//                           .update(req.rawBody)
//                           .digest('base64')

//   if (generated_hash == req.headers['x-shopify-hmac-sha256']) {
//     console.log('verified')
//     next()
//   } else {
//     console.log('no')
//     res.sendStatus(403)
//   }
// }