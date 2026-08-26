const express = require('express');

const router = express.Router();


const {
  getDevices,
  removeDevice,
  trustDevice,
  untrustDevice,
  logoutAllDevices,
  getLoginHistory

} = require('../controllers/securityController');



const {
  requireAuth

} = require('../middleware/auth');





/*
=========================================================
DEVICE MANAGEMENT
=========================================================
*/


/*
GET ALL USER DEVICES

Returns all logged-in devices
*/

router.get(
  '/devices',
  requireAuth,
  getDevices
);





/*
REMOVE DEVICE

Force remove a device session
*/

router.delete(
  '/devices/:deviceId',
  requireAuth,
  removeDevice
);






/*
TRUST DEVICE

Mark device as trusted
*/

router.patch(
  '/devices/:deviceId/trust',
  requireAuth,
  trustDevice
);






/*
UNTRUST DEVICE

Remove trusted status
*/

router.patch(
  '/devices/:deviceId/untrust',
  requireAuth,
  untrustDevice
);







/*
LOGOUT ALL DEVICES

Invalidate all trusted sessions
*/

router.post(
  '/logout-all',
  requireAuth,
  logoutAllDevices
);






/*
=========================================================
LOGIN HISTORY
=========================================================

Shows:

- Login time
- Device used
- Platform
- IP address
- User agent
- Login status

*/


router.get(
  '/login-history',
  requireAuth,
  getLoginHistory
);





module.exports = router;