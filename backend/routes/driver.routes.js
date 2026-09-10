const express = require('express');

const router = express.Router();


/*
=========================================================
CONTROLLERS
=========================================================
*/

const driverController =
  require('../controllers/driverController');

const withdrawalController =
  require('../controllers/withdrawalController');


/*
=========================================================
AUTHENTICATION
=========================================================
*/

const {
  requireAuth,
  requireRole
} = require('../middleware/auth');


/*
=========================================================
DRIVER ROUTES
=========================================================

All routes in this router require authentication.

Driver endpoints additionally require:

    requireRole('driver')

Admin endpoints additionally require:

    requireRole('admin')

This prevents a rider or unauthenticated user from
accessing driver identity information.
=========================================================
*/

router.use(
  requireAuth
);


/*
=========================================================
DRIVER DASHBOARD
=========================================================
*/

router.get(
  '/dashboard',
  requireRole('driver'),
  driverController.dashboard
);


/*
=========================================================
DRIVER PROFILE
=========================================================
*/

/*
GET DRIVER PROFILE
*/

router.get(
  '/me',
  requireRole('driver'),
  driverController.getMe
);


/*
UPDATE DRIVER PROFILE
*/

router.patch(
  '/me',
  requireRole('driver'),
  driverController.updateMe
);


/*
=========================================================
DRIVER ONLINE / OFFLINE
=========================================================

The controller now performs the following checks before
allowing a driver to go online:

    1. Driver account is authenticated
    2. Driver role is valid
    3. Driver profile is approved
    4. NIN has been verified
    5. Face verification has been completed

A driver cannot bypass identity verification by simply
changing the online status.
=========================================================
*/

router.patch(
  '/me/online',
  requireRole('driver'),
  driverController.setOnline
);


/*
=========================================================
DRIVER LOCATION
=========================================================
*/

router.patch(
  '/me/location',
  requireRole('driver'),
  driverController.location
);


/*
=========================================================
DRIVER IDENTITY SECURITY
=========================================================

IDENTITY FLOW:

    Driver
       |
       | Submit NIN
       v
    NIN pending
       |
       | Admin / authorized verification
       v
    NIN verified
       |
       | Submit face
       v
    Face pending
       |
       | Admin / authorized verification
       v
    Face verified
       |
       v
    Driver eligible to go online


IMPORTANT:

The mobile application does NOT receive the full NIN
after submission.

The backend stores the NIN with:

    select: false

The full NIN is therefore excluded from normal queries.

The admin identity endpoint returns a masked NIN.
=========================================================
*/


/*
---------------------------------------------------------
DRIVER SUBMITS NIN
---------------------------------------------------------

POST

/api/driver/me/identity/nin

Expected body:

{
  "nin": "12345678901"
}

The backend validates the 11-digit format and stores it
as pending verification.

It does NOT claim that the NIN has been government
verified.
---------------------------------------------------------
*/

router.post(
  '/me/identity/nin',
  requireRole('driver'),
  driverController.submitNIN
);


/*
---------------------------------------------------------
DRIVER CHECKS IDENTITY STATUS
---------------------------------------------------------

GET

/api/driver/me/identity

Returns status such as:

    ninSubmitted
    ninVerified
    faceSubmitted
    faceStatus
    faceVerified
    identityVerified

The full NIN is never returned.
---------------------------------------------------------
*/

router.get(
  '/me/identity',
  requireRole('driver'),
  driverController.getIdentityStatus
);


/*
---------------------------------------------------------
DRIVER SUBMITS FACE VERIFICATION
---------------------------------------------------------

POST

/api/driver/me/identity/face

Expected body:

{
  "imageUrl": "..."
}

The submission remains pending until the authorized
verification workflow approves it.
---------------------------------------------------------
*/

router.post(
  '/me/identity/face',
  requireRole('driver'),
  driverController.submitFaceVerification
);


/*
=========================================================
DRIVER BANK ACCOUNT
=========================================================
*/

router.get(
  '/bank-account',
  requireRole('driver'),
  withdrawalController.getBankAccount
);


router.patch(
  '/bank-account',
  requireRole('driver'),
  withdrawalController.saveBankAccount
);


/*
=========================================================
DRIVER WITHDRAWALS
=========================================================
*/

router.get(
  '/withdrawals',
  requireRole('driver'),
  withdrawalController.driverList
);


router.post(
  '/withdrawals',
  requireRole('driver'),
  withdrawalController.requestWithdrawal
);


/*
=========================================================
ADMIN DRIVER MANAGEMENT
=========================================================

These routes are admin-only.

A driver cannot access these endpoints even if the driver
knows the URL.
=========================================================
*/


/*
---------------------------------------------------------
GET ALL DRIVERS
---------------------------------------------------------

GET

/api/driver/

Used by the Kaduna Only admin dashboard.
---------------------------------------------------------
*/

router.get(
  '/',
  requireRole('admin'),
  driverController.list
);


/*
---------------------------------------------------------
UPDATE DRIVER VERIFICATION STATUS
---------------------------------------------------------

PATCH

/api/driver/:id/verify

Example body:

{
  "status": "approved"
}

Allowed:

    pending
    approved
    rejected
    suspended

The controller also checks the driver's identity
requirements before allowing approval.
---------------------------------------------------------
*/

router.patch(
  '/:id/verify',
  requireRole('admin'),
  driverController.verify
);


/*
=========================================================
ADMIN IDENTITY SECURITY
=========================================================

These endpoints are intentionally separated from the
normal driver profile endpoints.

The admin dashboard can use them to investigate a driver
when necessary.

Example:

A serious incident occurs.

Admin can identify the driver from:

    Driver account
    Full name
    Phone
    NIN verification status
    Masked NIN
    Face verification status
    Face image/reference
    Vehicle information
    Plate number
    Driver licence
    Device information
    Location/trip records

The NIN and face data are therefore part of the driver's
security identity record.
=========================================================
*/


/*
---------------------------------------------------------
GET DRIVER IDENTITY
---------------------------------------------------------

GET

/api/driver/:id/identity

Admin only.

Returns:

    masked NIN
    NIN verification status
    face verification status
    face image/reference
    verification timestamps
---------------------------------------------------------
*/

router.get(
  '/:id/identity',
  requireRole('admin'),
  driverController.adminGetIdentity
);


/*
---------------------------------------------------------
VERIFY / REJECT DRIVER NIN
---------------------------------------------------------

PATCH

/api/driver/:id/identity/nin

Example:

{
  "verified": true
}

or:

{
  "verified": false
}

Admin-only.
---------------------------------------------------------
*/

router.patch(
  '/:id/identity/nin',
  requireRole('admin'),
  driverController.verifyNIN
);


/*
---------------------------------------------------------
VERIFY / REJECT DRIVER FACE
---------------------------------------------------------

PATCH

/api/driver/:id/identity/face

Example:

{
  "status": "verified"
}

or:

{
  "status": "failed"
}

or:

{
  "status": "pending"
}

Admin-only.
---------------------------------------------------------
*/

router.patch(
  '/:id/identity/face',
  requireRole('admin'),
  driverController.verifyFace
);


/*
=========================================================
EXPORT
=========================================================
*/

module.exports =
  router;