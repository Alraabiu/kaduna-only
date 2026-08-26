const express = require('express');

const router = express.Router();

const {
  getDevices,
  removeDevice,
  logoutAllDevices
} = require('../controllers/securityController');


const {
  requireAuth
} = require('../middleware/auth');



router.get(
  '/devices',
  requireAuth,
  getDevices
);



router.delete(
  '/devices/:deviceId',
  requireAuth,
  removeDevice
);



router.post(
  '/logout-all',
  requireAuth,
  logoutAllDevices
);



module.exports = router;