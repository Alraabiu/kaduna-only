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


/*
==========================================
STAFF DRIVER MANAGEMENT
==========================================
*/

router.get(

  '/drivers',

  requireRole(
    'staff_operations',
    'dispatcher'
  ),

  c.drivers

);

/*
==========================================
STAFF FINANCE OPERATIONS
==========================================
*/

router.get(

  '/withdrawals',

  requireRole(
    'finance',
    'staff_operations'
  ),

  c.withdrawals

);


module.exports = router;