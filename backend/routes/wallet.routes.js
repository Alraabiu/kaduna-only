const r = require('express').Router();

const c =
  require('../controllers/walletController');

const withdrawal =
  require('../controllers/withdrawalController');

const {
  requireAuth,
} = require('../middleware/auth');


r.use(requireAuth);


/*
=========================================================
WALLET
=========================================================
*/

r.get(
  '/',
  c.me
);

r.get(
  '/transactions',
  c.transactions
);

r.get(
  '/payments',
  c.paymentHistory
);


/*
=========================================================
PAYSTACK WALLET FUNDING
=========================================================
*/

r.post(
  '/paystack/initialize',
  c.initializePaystack
);

r.post(
  '/paystack/verify',
  c.verifyPaystack
);


/*
=========================================================
WALLET PIN
=========================================================
*/

r.post(
  '/pin',
  c.setPin
);


/*
=========================================================
USER TO USER WALLET TRANSFER
=========================================================
*/

r.post(
  '/transfer/verify-recipient',
  c.verifyRecipient
);

r.post(
  '/transfer',
  c.transfer
);


/*
=========================================================
BANK WITHDRAWAL
=========================================================
*/

/*
Get Nigerian banks
*/
r.get(
  '/banks',
  withdrawal.listBanks
);


/*
Verify account number
*/
r.post(
  '/banks/verify',
  withdrawal.verifyAccount
);


/*
Get saved withdrawal bank
*/
r.get(
  '/withdrawal/bank',
  withdrawal.getBankAccount
);


/*
Verify and prepare withdrawal bank
*/
r.post(
  '/withdrawal/bank',
  withdrawal.saveBankAccount
);


/*
Withdrawal history
*/
r.get(
  '/withdrawals',
  withdrawal.userList
);


/*
Withdraw wallet balance to Nigerian bank
*/
r.post(
  '/withdrawals',
  withdrawal.requestWalletWithdrawal
);


module.exports = r;