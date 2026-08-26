const express = require('express');

const router = express.Router();


const {
  getDevices,
  removeDevice,
  trustDevice,
  untrustDevice,
  logoutAllDevices
} = require('../controllers/securityController');


const {
  requireAuth
} = require('../middleware/auth');



/*
=========================================================
GET ALL USER DEVICES
=========================================================
*/

router.get(
  '/devices',
  requireAuth,
  getDevices
);




/*
=========================================================
REMOVE DEVICE
=========================================================
*/

router.delete(
  '/devices/:deviceId',
  requireAuth,
  removeDevice
);




/*
=========================================================
TRUST DEVICE
=========================================================
*/

router.patch(
  '/devices/:deviceId/trust',
  requireAuth,
  trustDevice
);




/*
=========================================================
UNTRUST DEVICE
=========================================================
*/

router.patch(
  '/devices/:deviceId/untrust',
  requireAuth,
  untrustDevice
);




/*
=========================================================
LOGOUT ALL DEVICES
=========================================================
*/

router.post(
  '/logout-all',
  requireAuth,
  logoutAllDevices
);



module.exports = router;