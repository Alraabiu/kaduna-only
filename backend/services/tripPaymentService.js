const Wallet = require('../models/Wallet');
const PlatformRevenue = require('../models/PlatformRevenue');

const {
  commissionForFare,
  collectCashCommission
} = require('./platformCommissionService');

const reserveReference = trip =>
  `RIDE-RESERVE-${trip.tripId}`;

const rollbackReference = trip =>
  `RIDE-ROLLBACK-${trip.tripId}`;

const refundReference = trip =>
  `RIDE-REFUND-${trip.tripId}`;

const earningReference = trip =>
  `RIDE-EARNING-${trip.tripId}`;

const revenueReference = trip =>
  `PLATFORM-REV-${trip.tripId}`;


/*
 * ---------------------------------------------------------
 * RESERVE RIDER WALLET
 * ---------------------------------------------------------
 */

async function reserveRiderWallet({
  userId,
  fare,
  tripId,
  tripMongoId
}) {

  const reference = `RIDE-RESERVE-${tripId}`;

  const wallet =
    await Wallet.findOneAndUpdate(

      {
        user: userId,

        balance: {
          $gte: fare
        },

        'transactions.reference': {
          $ne: reference
        }
      },

      {
        $inc: {
          balance: -fare
        },

        $push: {
          transactions: {
            type: 'debit',
            amount: fare,
            description:
              `Ride payment reserved ${tripId}`,
            trip: tripMongoId,
            reference,
            provider: 'wallet',
            status: 'reserved'
          }
        }
      },

      {
        returnDocument: 'after'
      }
    );


  if (!wallet) {

    const error =
      new Error(
        `Insufficient wallet balance. This ride costs ₦${Number(
          fare
        ).toLocaleString('en-NG')}.`
      );

    error.statusCode = 402;

    throw error;
  }


  return {
    wallet,
    reference
  };
}


/*
 * ---------------------------------------------------------
 * ROLLBACK WALLET RESERVATION
 * ---------------------------------------------------------
 */

async function rollbackReservation({
  userId,
  fare,
  tripId,
  tripMongoId
}) {

  const reference =
    `RIDE-ROLLBACK-${tripId}`;

  return Wallet.findOneAndUpdate(

    {
      user: userId,

      'transactions.reference': {
        $ne: reference
      }
    },

    {
      $inc: {
        balance: fare
      },

      $push: {
        transactions: {
          type: 'credit',
          amount: fare,
          description:
            `Ride reservation rollback ${tripId}`,
          trip: tripMongoId,
          reference,
          provider: 'wallet',
          status: 'refunded'
        }
      }
    },

    {
      returnDocument: 'after'
    }
  );
}


/*
 * ---------------------------------------------------------
 * REFUND RIDER WALLET
 * ---------------------------------------------------------
 */

async function refundRiderWallet(trip) {

  if (
    trip.paymentMethod !== 'wallet' ||
    !trip.walletReservedAt ||
    trip.walletRefundedAt
  ) {

    return {
      refunded: false
    };
  }


  const reference =
    refundReference(trip);


  const wallet =
    await Wallet.findOneAndUpdate(

      {
        user:
          trip.rider?._id ||
          trip.rider,

        'transactions.reference': {
          $ne: reference
        }
      },

      {
        $inc: {
          balance: trip.fare
        },

        $push: {
          transactions: {
            type: 'credit',
            amount: trip.fare,
            description:
              `Refund ${trip.tripId}`,
            trip: trip._id,
            reference,
            provider: 'wallet',
            status: 'refunded'
          }
        }
      },

      {
        returnDocument: 'after'
      }
    );


  return {
    refunded: !!wallet,
    wallet,
    reference
  };
}


/*
 * ---------------------------------------------------------
 * PLATFORM REVENUE
 * ---------------------------------------------------------
 */

async function recordPlatformRevenue({
  trip,
  amount,
  paymentMethod,
  status = 'collected'
}) {

  if (!trip) {
    throw new Error(
      'Trip is required to record platform revenue'
    );
  }


  const reference =
    revenueReference(trip);


  const existing =
    await PlatformRevenue.findOne({
      reference
    });


  if (existing) {

    return {
      created: false,
      revenue: existing
    };
  }


  const revenue =
    await PlatformRevenue.create({

      trip: trip._id,

      driver:
        trip.driver?._id ||
        trip.driver,

      rider:
        trip.rider?._id ||
        trip.rider,

      amount,

      currency: 'NGN',

      paymentMethod,

      reference,

      status,

      description:
        `Kaduna Only platform commission for ${trip.tripId}`,

      ...(status === 'collected'
        ? {
            collectedAt: new Date()
          }
        : {})
    });


  return {
    created: true,
    revenue
  };
}


/*
 * ---------------------------------------------------------
 * SETTLE DRIVER EARNING
 * ---------------------------------------------------------
 */

async function settleDriverEarning(trip) {

  if (!trip.driver) {

    return {
      credited: false
    };
  }


  const userId =
    trip.driver?._id ||
    trip.driver;


  const fare =
    Number(trip.fare || 0);


  const commission =
    Number(
      commissionForFare(fare)
    );


  const net =
    Math.max(
      0,
      fare - commission
    );


  trip.platformCommission =
    commission;

  trip.driverNetEarning =
    net;


  /*
   * -------------------------------------------------------
   * CASH PAYMENT
   * -------------------------------------------------------
   */

  if (trip.paymentMethod === 'cash') {

    const fee =
      await collectCashCommission(trip);


    const collected =
      !!fee.collected;


    trip.commissionStatus =
      collected
        ? 'collected'
        : 'due';


    if (collected) {

      trip.commissionCollectedAt =
        new Date();
    }


    await recordPlatformRevenue({

      trip,

      amount:
        commission,

      paymentMethod:
        'cash',

      status:
        collected
          ? 'collected'
          : 'due'
    });


    await trip.save();


    return {

      credited: false,

      cashCollected: true,

      commission,

      commissionCollected:
        collected,

      driverNetEarning:
        net
    };
  }


  /*
   * -------------------------------------------------------
   * WALLET PAYMENT
   * -------------------------------------------------------
   */

  const reference =
    earningReference(trip);


  let wallet =
    await Wallet.findOne({
      user: userId
    });


  if (!wallet) {

    wallet =
      await Wallet.create({

        user: userId,

        balance: 0,

        transactions: []
      });
  }


  /*
   * Idempotency check.
   */

  const existingTransaction =
    wallet.transactions?.some(
      transaction =>
        transaction.reference ===
        reference
    );


  if (existingTransaction) {

    const existingRevenue =
      await PlatformRevenue.findOne({
        reference:
          revenueReference(trip)
      });


    trip.commissionStatus =
      'collected';


    if (!trip.commissionCollectedAt) {

      trip.commissionCollectedAt =
        new Date();
    }


    await trip.save();


    return {

      credited: false,

      wallet,

      reference,

      commission,

      driverNetEarning:
        net,

      revenue:
        existingRevenue
    };
  }


  /*
   * Credit driver's net earning.
   */

  wallet =
    await Wallet.findOneAndUpdate(

      {
        user: userId,

        'transactions.reference': {
          $ne: reference
        }
      },

      {
        $inc: {
          balance: net
        },

        $push: {

          transactions: {

            type: 'credit',

            amount: net,

            description:
              `Wallet ride earnings ${trip.tripId} after ₦${commission.toLocaleString('en-NG')} Kaduna Only fee`,

            trip:
              trip._id,

            reference,

            provider:
              'ride',

            status:
              'paid'
          }
        }
      },

      {
        returnDocument: 'after'
      }
    );


  /*
   * Record platform commission.
   */

  const revenue =
    await recordPlatformRevenue({

      trip,

      amount:
        commission,

      paymentMethod:
        'wallet',

      status:
        'collected'
    });


  trip.commissionStatus =
    'collected';


  trip.commissionCollectedAt =
    new Date();


  await trip.save();


  return {

    credited:
      !!wallet,

    wallet,

    reference,

    commission,

    driverNetEarning:
      net,

    revenue:
      revenue.revenue
  };
}


/*
 * ---------------------------------------------------------
 * LEGACY WALLET DEBIT
 * ---------------------------------------------------------
 */

async function legacyWalletDebit(trip) {

  const reference =
    reserveReference(trip);


  const wallet =
    await Wallet.findOneAndUpdate(

      {
        user:
          trip.rider?._id ||
          trip.rider,

        balance: {
          $gte: trip.fare
        },

        'transactions.reference': {
          $ne: reference
        }
      },

      {

        $inc: {
          balance: -trip.fare
        },

        $push: {

          transactions: {

            type: 'debit',

            amount:
              trip.fare,

            description:
              `Ride payment ${trip.tripId}`,

            trip:
              trip._id,

            reference,

            provider:
              'wallet',

            status:
              'reserved'
          }
        }
      },

      {
        returnDocument: 'after'
      }
    );


  if (!wallet) {

    const error =
      new Error(
        'Rider wallet no longer has enough balance to complete this payment'
      );

    error.statusCode =
      402;

    throw error;
  }


  return {
    wallet,
    reference
  };
}


module.exports = {

  reserveRiderWallet,

  rollbackReservation,

  refundRiderWallet,

  settleDriverEarning,

  legacyWalletDebit,

  recordPlatformRevenue
};