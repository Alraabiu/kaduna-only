const r = require('express').Router();

const c = require('../controllers/adminController');
const w = require('../controllers/withdrawalController');

const { requireAuth, requireRole } = require('../middleware/auth');

r.use(requireAuth, requireRole('admin'));

// Dashboard
r.get('/dashboard', c.dashboard);

// Users
r.get('/users', c.users);
r.patch('/users/:id/status', c.setUserStatus);

// Drivers
r.get('/drivers', c.drivers);
r.patch('/drivers/:id/verify', c.verifyDriver);

// Trips
r.get('/trips', c.trips);
r.get('/trips/:id', c.getTrip);
r.patch('/trips/:id/cancel', c.cancelTrip);

// Payments
r.get('/payments', c.payments);

// Wallets
r.get('/wallets', c.wallets);

// Pricing
r.get('/pricing', c.pricing);
r.patch('/pricing', c.updatePricing);

// Withdrawals
r.get('/withdrawals', w.adminList);
r.patch('/withdrawals/:id/approve', w.approve);
r.patch('/withdrawals/:id/paid', w.markPaid);
r.patch('/withdrawals/:id/reject', w.reject);

module.exports = r;