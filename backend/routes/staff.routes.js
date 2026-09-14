const router = require('express').Router();

const c = require('../controllers/staffController');

const {
  requireAuth,
  requireRole
} = require('../middleware/auth');

const requirePermission =
  require('../middleware/permission');


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

  requirePermission(
    'view_trips'
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


requirePermission(
  'view_drivers'
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

requirePermission(
  'view_withdrawals'
),


  c.withdrawals

);

/*
==========================================
STAFF CUSTOMER SUPPORT
==========================================
*/

router.get(

  '/users/search',

  requireRole(
    'customer_support',
    'staff_operations'
  ),

requirePermission(
  'search_users'
),

  c.searchUsers

);

/*
==========================================
STAFF USER TRIP HISTORY
==========================================
*/

router.get(

  '/users/:id/trips',

  requireRole(
    'customer_support',
    'staff_operations'
  ),

requirePermission(
  'view_trip_history'
),

  c.userTrips

);



module.exports = router;