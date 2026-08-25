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


// ---------------------------------------------------------
// Commission summary
// GET /api/admin/platform-revenue
// ---------------------------------------------------------

r.get(
  '/platform-revenue',
  pw.summary
);


// ---------------------------------------------------------
// Nigerian bank directory
// GET /api/admin/platform-revenue/banks
//
// The frontend uses this to populate the bank dropdown.
// The admin does NOT manually enter a bank code.
// ---------------------------------------------------------

r.get(
  '/platform-revenue/banks',
  pw.banks
);


// ---------------------------------------------------------
// Commission transaction history
// GET /api/admin/platform-revenue/history
// ---------------------------------------------------------

r.get(
  '/platform-revenue/history',
  pw.revenueHistory
);


// ---------------------------------------------------------
// Saved platform bank account
// GET /api/admin/platform-revenue/bank-account
// ---------------------------------------------------------

r.get(
  '/platform-revenue/bank-account',
  pw.getBankAccount
);


// ---------------------------------------------------------
// Verify Nigerian bank account
// POST /api/admin/platform-revenue/bank-account/verify
//
// Frontend sends:
// {
//   accountNumber,
//   bankCode
// }
//
// bankCode comes from the selected bank in the
// Paystack bank directory.
// ---------------------------------------------------------

r.post(
  '/platform-revenue/bank-account/verify',
  pw.verifyBankAccount
);


// ---------------------------------------------------------
// Save verified platform bank account
// POST /api/admin/platform-revenue/bank-account
// ---------------------------------------------------------

r.post(
  '/platform-revenue/bank-account',
  pw.saveBankAccount
);


// ---------------------------------------------------------
// Platform commission withdrawal history
// GET /api/admin/platform-revenue/withdrawals
// ---------------------------------------------------------

r.get(
  '/platform-revenue/withdrawals',
  pw.withdrawals
);


// ---------------------------------------------------------
// Withdraw platform commission to local bank
// POST /api/admin/platform-revenue/withdraw
// ---------------------------------------------------------

r.post(
  '/platform-revenue/withdraw',
  pw.requestWithdrawal
);


// ---------------------------------------------------------
// Verify/update Paystack transfer status
// GET /api/admin/platform-revenue/withdrawals/:id/verify
// ---------------------------------------------------------

r.get(
  '/platform-revenue/withdrawals/:id/verify',
  pw.verifyWithdrawal
);


// =========================================================
// EXPORT
// =========================================================

module.exports = r;