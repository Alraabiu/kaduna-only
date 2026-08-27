const express = require('express');

const router = express.Router();



const {

  getDevices,

  removeDevice,

  trustDevice,

  untrustDevice,

  logoutAllDevices,

  getLoginHistory,

  getSecurityAlerts,

  getUnreadAlertCount,

  markAlertRead,

  markAllAlertsRead,

  resolveAlert


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

Returns:

- Device name
- Platform
- IP
- Trusted status
- Last active time

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

Invalidate all sessions

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
*/


/*
GET LOGIN HISTORY

Returns:

- Login time
- Device
- Platform
- IP address
- User agent
- Status

*/

router.get(

  '/login-history',

  requireAuth,

  getLoginHistory

);









/*
=========================================================
SECURITY ALERTS
=========================================================
*/



/*
GET ALL SECURITY ALERTS

Returns:

- New device alerts
- New IP alerts
- Suspicious activity

*/

router.get(

  '/alerts',

  requireAuth,

  getSecurityAlerts

);







/*
GET UNREAD ALERT COUNT

Used for notification badge

Example:

Security 🔴 3

*/

router.get(

  '/alerts/unread-count',

  requireAuth,

  getUnreadAlertCount

);







/*
MARK SINGLE ALERT AS READ

*/

router.patch(

  '/alerts/:id/read',

  requireAuth,

  markAlertRead

);







/*
MARK ALL ALERTS AS READ

*/

router.post(

  '/alerts/read-all',

  requireAuth,

  markAllAlertsRead

);







/*
RESOLVE SECURITY ALERT

Example:

User confirms new login

*/

router.patch(

  '/alerts/:id/resolve',

  requireAuth,

  resolveAlert

);







module.exports = router;