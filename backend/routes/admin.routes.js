const r = require('express').Router();

const c = require('../controllers/adminController');

const w = require('../controllers/withdrawalController');

const {
  requireAuth,
  requireRole
} = require('../middleware/auth');



/*
=========================================================
ADMIN AUTHORIZATION
=========================================================
*/

r.use(
  requireAuth,
  requireRole('admin')
);



/*
=========================================================
DASHBOARD
=========================================================
*/

r.get(
  '/dashboard',
  c.dashboard
);



/*
=========================================================
USER MANAGEMENT
=========================================================
*/

r.get(
  '/users',
  c.users
);


r.patch(
  '/users/:id/status',
  c.setUserStatus
);



/*
=========================================================
DRIVER MANAGEMENT
=========================================================
*/

r.get(
  '/drivers',
  c.drivers
);


r.patch(
  '/drivers/:id/verify',
  c.verifyDriver
);



/*
=========================================================
TRIP MANAGEMENT
=========================================================
*/

r.get(
  '/trips',
  c.trips
);


r.get(
  '/trips/:id',
  c.getTrip
);


r.patch(
  '/trips/:id/cancel',
  c.cancelTrip
);



/*
=========================================================
FINANCE
=========================================================
*/

r.get(
  '/payments',
  c.payments
);


r.get(
  '/wallets',
  c.wallets
);



/*
=========================================================
PRICING MANAGEMENT
=========================================================
*/

r.get(
  '/pricing',
  c.pricing
);


r.patch(
  '/pricing',
  c.updatePricing
);



/*
=========================================================
WITHDRAWAL MANAGEMENT
=========================================================
*/

r.get(
  '/withdrawals',
  w.adminList
);


r.patch(
  '/withdrawals/:id/approve',
  w.approve
);


r.patch(
  '/withdrawals/:id/paid',
  w.markPaid
);


r.patch(
  '/withdrawals/:id/reject',
  w.reject
);



/*
=========================================================
STAFF OPERATIONS
=========================================================
*/

r.get(
  '/staff',
  c.staff
);


r.patch(
  '/staff/:id/status',
  c.setStaffStatus
);


r.post(
'/staff',
c.createStaff
);



module.exports = r;