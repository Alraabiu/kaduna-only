const jwt = require('jsonwebtoken');

const User = require('../models/User');

const {
  getActiveSession
} = require('../services/sessionService');


/*
=========================================================
AUTHENTICATION MIDDLEWARE

Flow:

Bearer Token
      |
      |
JWT Verify
      |
      |
Check UserSession
      |
      |
Check User
      |
      |
Attach req.user

=========================================================
*/


async function requireAuth(req, res, next) {

  try {

    /*
    =====================================================
    READ AUTHORIZATION HEADER
    =====================================================
    */

    const header =
      req.headers.authorization || '';


    const token =
      header.startsWith('Bearer ')
        ? header.slice(7).trim()
        : null;


    if (!token) {

      return res.status(401).json({

        success: false,

        message:
          'Authentication required'

      });

    }


    /*
    =====================================================
    VERIFY JWT
    =====================================================
    */

    const payload =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );


    /*
    =====================================================
    VALIDATE TOKEN PAYLOAD
    =====================================================
    */

    if (
      !payload ||
      !payload.sub ||
      !payload.tokenId
    ) {

      return res.status(401).json({

        success: false,

        message:
          'Invalid session token'

      });

    }


    /*
    =====================================================
    CHECK ACTIVE SESSION
    =====================================================
    */

    const session =
      await getActiveSession(
        payload.tokenId
      );


    if (!session) {

      return res.status(401).json({

        success: false,

        message:
          'Session expired or revoked'

      });

    }


    /*
    =====================================================
    CHECK SESSION EXPIRY
    =====================================================
    */

    if (
      session.expiresAt &&
      new Date(session.expiresAt).getTime() <= Date.now()
    ) {

      return res.status(401).json({

        success: false,

        message:
          'Session expired'

      });

    }


    /*
    =====================================================
    LOAD AUTHENTICATED USER
    =====================================================
    */

    const user =
      await User.findById(
        payload.sub
      );


    if (
      !user ||
      user.status !== 'active'
    ) {

      return res.status(401).json({

        success: false,

        message:
          'Account unavailable'

      });

    }


    /*
    =====================================================
    SECURITY CONTEXT
    =====================================================

    Attach authenticated identity and session
    information for downstream middleware and
    controllers.

    =====================================================
    */

    req.user =
      user;


    req.session =
      session;


    req.tokenId =
      payload.tokenId;


    return next();


  } catch (error) {

    /*
    =====================================================
    AUTHENTICATION FAILURE
    =====================================================

    JWT errors and invalid authentication state
    intentionally return the same generic response.

    =====================================================
    */

    return res.status(401).json({

      success: false,

      message:
        'Invalid or expired token'

    });

  }

}



/*
=========================================================
ROLE AUTHORIZATION MIDDLEWARE

IMPORTANT:

Roles remain strictly separated.

An administrator does NOT automatically become a
rider, driver, finance user, dispatcher or support user.

Admin access to staff functionality must therefore be
granted explicitly at the route level:

requireRole(
  'admin',
  'staff_operations'
)

This prevents admin accounts from accidentally gaining
access to rider-only or driver-only operations.

=========================================================
*/


function requireRole(...roles) {

  return (

    req,

    res,

    next

  ) => {


    /*
    =====================================================
    AUTHENTICATION CONTEXT CHECK
    =====================================================
    */

    if (!req.user) {

      return res.status(401).json({

        success: false,

        message:
          'Authentication required'

      });

    }


    /*
    =====================================================
    ROLE CONFIGURATION CHECK
    =====================================================

    Prevent accidental use of requireRole() without
    specifying any permitted roles.

    =====================================================
    */

    if (
      !Array.isArray(roles) ||
      roles.length === 0
    ) {

      return res.status(403).json({

        success: false,

        message:
          'Forbidden'

      });

    }


    /*
    =====================================================
    STRICT ROLE CHECK
    =====================================================

    No global admin bypass is used here.

    Administrators must be explicitly included in the
    route's permitted roles where admin access is
    intended.

    =====================================================
    */

    if (
      !roles.includes(
        req.user.role
      )
    ) {

      return res.status(403).json({

        success: false,

        message:
          'Forbidden'

      });

    }


    return next();

  };

}



/*
=========================================================
EXPORTS
=========================================================
*/


module.exports = {

  requireAuth,

  requireRole

};