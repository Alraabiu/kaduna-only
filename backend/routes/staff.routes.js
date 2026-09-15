const router = require('express').Router();


/*
=========================================================
CONTROLLERS
=========================================================
*/

const c =
  require('../controllers/staffController');

const withdrawal =
  require('../controllers/withdrawalController');

const admin =
  require('../controllers/adminController');


/*
=========================================================
AUTHORIZATION MIDDLEWARE
=========================================================
*/

const {
  requireAuth,
  requireRole
} = require('../middleware/auth');

const requirePermission =
  require('../middleware/permission');


/*
=========================================================
ALL STAFF ROUTES REQUIRE AUTHENTICATION
=========================================================
*/

router.use(requireAuth);



/*
=========================================================
STAFF DASHBOARD
=========================================================
*/

router.get(

  '/dashboard',

  requireRole(
    'admin',
    'staff_operations',
    'customer_support',
    'dispatcher',
    'finance'
  ),

  c.dashboard

);



/*
=========================================================
TRIP OPERATIONS
=========================================================
*/


/*
---------------------------------------------------------
VIEW ACTIVE TRIPS
---------------------------------------------------------
*/

router.get(

  '/trips',

  requireRole(
    'admin',
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
---------------------------------------------------------
VIEW SINGLE TRIP
---------------------------------------------------------
*/

router.get(

  '/trips/:id',

  requireRole(
    'admin',
    'staff_operations',
    'customer_support',
    'dispatcher'
  ),

  requirePermission(
    'view_trips'
  ),

  c.tripDetails

);



/*
---------------------------------------------------------
CANCEL TRIP

Uses the existing administrative cancellation controller.

This preserves:
- Active-status validation
- Wallet refund handling
- walletRefundedAt
- paymentStatus
- cancelledAt
---------------------------------------------------------
*/

router.patch(

  '/trips/:id/cancel',

  requireRole(
    'admin',
    'staff_operations',
    'dispatcher'
  ),

  requirePermission(
    'manage_trips'
  ),

  admin.cancelTrip

);



/*
=========================================================
DRIVER OPERATIONS
=========================================================
*/


/*
---------------------------------------------------------
VIEW DRIVERS
---------------------------------------------------------
*/

router.get(

  '/drivers',

  requireRole(
    'admin',
    'staff_operations',
    'dispatcher'
  ),

  requirePermission(
    'view_drivers'
  ),

  c.drivers

);



/*
---------------------------------------------------------
VIEW DRIVER DETAILS
---------------------------------------------------------
*/

router.get(

  '/drivers/:id',

  requireRole(
    'admin',
    'staff_operations',
    'dispatcher'
  ),

  requirePermission(
    'view_drivers'
  ),

  c.driverDetails

);



/*
---------------------------------------------------------
SUSPEND DRIVER
---------------------------------------------------------
*/

router.patch(

  '/drivers/:id/suspend',

  requireRole(
    'admin',
    'staff_operations'
  ),

  requirePermission(
    'manage_drivers'
  ),

  c.suspendDriver

);



/*
---------------------------------------------------------
ACTIVATE DRIVER
---------------------------------------------------------
*/

router.patch(

  '/drivers/:id/activate',

  requireRole(
    'admin',
    'staff_operations'
  ),

  requirePermission(
    'manage_drivers'
  ),

  c.activateDriver

);



/*
=========================================================
FINANCE OPERATIONS
=========================================================
*/


/*
---------------------------------------------------------
VIEW WITHDRAWALS
---------------------------------------------------------
*/

router.get(

  '/withdrawals',

  requireRole(
    'admin',
    'finance',
    'staff_operations'
  ),

  requirePermission(
    'view_withdrawals'
  ),

  withdrawal.adminList

);



/*
---------------------------------------------------------
APPROVE WITHDRAWAL
---------------------------------------------------------
*/

router.patch(

  '/withdrawals/:id/approve',

  requireRole(
    'admin',
    'finance',
    'staff_operations'
  ),

  requirePermission(
    'approve_withdrawals'
  ),

  withdrawal.approve

);



/*
---------------------------------------------------------
MARK WITHDRAWAL AS PAID
---------------------------------------------------------
*/

router.patch(

  '/withdrawals/:id/paid',

  requireRole(
    'admin',
    'finance',
    'staff_operations'
  ),

  requirePermission(
    'approve_withdrawals'
  ),

  withdrawal.markPaid

);



/*
---------------------------------------------------------
REJECT WITHDRAWAL AND REFUND FUNDS
---------------------------------------------------------
*/

router.patch(

  '/withdrawals/:id/reject',

  requireRole(
    'admin',
    'finance',
    'staff_operations'
  ),

  requirePermission(
    'approve_withdrawals'
  ),

  withdrawal.reject

);



/*
=========================================================
CUSTOMER SUPPORT OPERATIONS
=========================================================
*/


/*
---------------------------------------------------------
SEARCH USERS
---------------------------------------------------------
*/

router.get(

  '/users/search',

  requireRole(
    'admin',
    'customer_support',
    'staff_operations'
  ),

  requirePermission(
    'search_users'
  ),

  c.searchUsers

);



/*
---------------------------------------------------------
VIEW USER DETAILS
---------------------------------------------------------
*/

router.get(

  '/users/:id',

  requireRole(
    'admin',
    'customer_support',
    'staff_operations'
  ),

  requirePermission(
    'view_users'
  ),

  c.userDetails

);



/*
---------------------------------------------------------
UPDATE USER STATUS

The controller must protect privileged accounts:
- admin
- staff_operations
- customer_support
- dispatcher
- finance
---------------------------------------------------------
*/

router.patch(

  '/users/:id/status',

  requireRole(
    'admin',
    'customer_support',
    'staff_operations'
  ),

  requirePermission(
    'manage_users'
  ),

  c.updateUserStatus

);



/*
---------------------------------------------------------
VIEW USER TRIP HISTORY
---------------------------------------------------------
*/

router.get(

  '/users/:id/trips',

  requireRole(
    'admin',
    'customer_support',
    'staff_operations'
  ),

  requirePermission(
    'view_trip_history'
  ),

  c.userTrips

);



/*
=========================================================
EXPORT ROUTER
=========================================================
*/

module.exports = router;