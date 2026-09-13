const router = require('express').Router();

const c = require('../controllers/staffController');

const {
  requireAuth,
  requireRole
} = require('../middleware/auth');


router.use(requireAuth);



/*
==========================================
STAFF DASHBOARD
==========================================
*/


router.get(

  '/dashboard',

  requireRole(
    'staff_operations',
    'customer_support',
    'dispatcher',
    'finance'
  ),

  c.dashboard

);


/*
==========================================
STAFF ACTIVE TRIPS
==========================================
*/

router.get(

  '/trips',

  requireRole(
    'staff_operations',
    'customer_support',
    'dispatcher'
  ),

  c.trips

);

module.exports = router;