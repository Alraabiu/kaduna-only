const r = require('express').Router();

const c = require('../controllers/adminController');
const w = require('../controllers/withdrawalController');
const pw = require('../controllers/platformWithdrawalController');

const {
  requireAuth,
  requireRole
} = require('../middleware/auth');


// =========================================================
// ADMIN AUTHENTICATION
// =========================================================

r.use(
  requireAuth,
  requireRole('admin')
);


// =========================================================
// DASHBOARD
// =========================================================

r.get(
  '/dashboard',
  c.dashboard
);


// =========================================================
// USERS
// =========================================================

r.get(
  '/users',
  c.users
);

r.patch(
  '/users/:id/status',
  c.setUserStatus
);


// =========================================================
// DRIVERS
// =========================================================

r.get(
  '/drivers',
  c.drivers
);

r.patch(
  '/drivers/:id/verify',
  c.verifyDriver
);


// =========================================================
// TRIPS
// =========================================================

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


// =========================================================
// PAYMENTS
// =========================================================

r.get(
  '/payments',
  c.payments
);


// =========================================================
// WALLETS
// =========================================================

r.get(
  '/wallets',
  c.wallets
);


// =========================================================
// PRICING
// =========================================================

r.get(
  '/pricing',
  c.pricing
);

r.patch(
  '/pricing',
  c.updatePricing
);


// =========================================================
// DRIVER WITHDRAWALS
// =========================================================

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


// =========================================================
// PLATFORM COMMISSION
// =========================================================

// Commission summary
r.get(
  '/platform-revenue',
  pw.summary
);


// Commission transaction history
r.get(
  '/platform-revenue/history',
  pw.revenueHistory
);


// Saved platform bank account
r.get(
  '/platform-revenue/bank-account',
  pw.getBankAccount
);


// Verify a Nigerian bank account
r.post(
  '/platform-revenue/bank-account/verify',
  pw.verifyBankAccount
);


// Save verified bank account
r.post(
  '/platform-revenue/bank-account',
  pw.saveBankAccount
);


// Platform commission withdrawal history
r.get(
  '/platform-revenue/withdrawals',
  pw.withdrawals
);


// Withdraw commission to local bank
r.post(
  '/platform-revenue/withdraw',
  pw.requestWithdrawal
);


// Verify/update Paystack transfer status
r.get(
  '/platform-revenue/withdrawals/:id/verify',
  pw.verifyWithdrawal
);


module.exports = r;