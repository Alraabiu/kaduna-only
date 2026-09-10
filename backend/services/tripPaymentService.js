const Wallet = require('../models/Wallet');

const reference = (prefix, tripId) => `${prefix}-${tripId}`;

async function ensureWallet(userId) {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId, balance: 0, transactions: [] });
  return wallet;
}

async function reserveRiderWallet({ userId, fare, tripId, tripMongoId }) {
  const amount = Math.max(0, Number(fare) || 0);
  const ref = reference('RIDE-RESERVE', tripId);
  const wallet = await Wallet.findOneAndUpdate(
    { user: userId, balance: { $gte: amount }, 'transactions.reference': { $ne: ref } },
    { $inc: { balance: -amount }, $push: { transactions: {
      type: 'debit', amount, description: `Ride payment reserved ${tripId}`,
      trip: tripMongoId, reference: ref, provider: 'wallet', status: 'reserved'
    }}},
    { returnDocument: 'after' }
  );
  if (!wallet) {
    const err = new Error(`Insufficient wallet balance. This ride costs ₦${amount.toLocaleString('en-NG')}.`);
    err.statusCode = 402;
    throw err;
  }
  return { wallet, reference: ref };
}

async function rollbackReservation({ userId, fare, tripId, tripMongoId }) {
  const amount = Math.max(0, Number(fare) || 0);
  const ref = reference('RIDE-ROLLBACK', tripId);
  return Wallet.findOneAndUpdate(
    { user: userId, 'transactions.reference': { $ne: ref } },
    { $inc: { balance: amount }, $push: { transactions: {
      type: 'credit', amount, description: `Ride reservation rollback ${tripId}`,
      trip: tripMongoId, reference: ref, provider: 'wallet', status: 'refunded'
    }}},
    { returnDocument: 'after' }
  );
}

async function refundRiderWallet(trip) {
  if (trip.paymentMethod !== 'wallet' || !trip.walletReservedAt || trip.walletRefundedAt) return { refunded: false };
  const ref = reference('RIDE-REFUND', trip.tripId);
  const wallet = await Wallet.findOneAndUpdate(
    { user: trip.rider?._id || trip.rider, 'transactions.reference': { $ne: ref } },
    { $inc: { balance: trip.fare }, $push: { transactions: {
      type: 'credit', amount: trip.fare, description: `Refund ${trip.tripId}`,
      trip: trip._id, reference: ref, provider: 'wallet', status: 'refunded'
    }}},
    { returnDocument: 'after' }
  );
  return { refunded: !!wallet, wallet, reference: ref };
}

async function settleDriverEarning(trip) {
  if (!trip.driver || trip.paymentMethod !== 'wallet' || trip.paymentStatus !== 'paid') return { credited: false };
  const amount = Math.max(0, Number(trip.fare) || 0);
  const ref = reference('RIDE-EARNING', trip.tripId);
  const wallet = await Wallet.findOneAndUpdate(
    { user: trip.driver, 'transactions.reference': { $ne: ref } },
    { $inc: { balance: amount }, $push: { transactions: {
      type: 'credit', amount, description: `Ride payment received ${trip.tripId}`,
      trip: trip._id, reference: ref, provider: 'wallet', status: 'success'
    }}},
    { returnDocument: 'after' }
  );
  if (!wallet) return { credited: false };
  return { credited: true, amount, wallet, reference: ref };
}

async function legacyWalletDebit(trip) {
  return reserveRiderWallet({
    userId: trip.rider?._id || trip.rider,
    fare: trip.fare,
    tripId: trip.tripId,
    tripMongoId: trip._id
  });
}

module.exports = {
  ensureWallet,
  reserveRiderWallet,
  rollbackReservation,
  refundRiderWallet,
  settleDriverEarning,
  legacyWalletDebit
};
