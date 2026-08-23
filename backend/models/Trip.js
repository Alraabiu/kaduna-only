const mongoose = require('mongoose');

/* =========================================================
   LOCATION / POINT
========================================================= */

const pointSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true
    },

    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90
    },

    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   DRIVER / RIDER ARRIVAL LOCATION
========================================================= */

const locationSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90
    },

    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180
    },

    accuracy: {
      type: Number,
      min: 0
    },

    recordedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   TRIP SCHEMA
========================================================= */

const schema = new mongoose.Schema(
  {
    /* =====================================================
       IDENTITY
    ===================================================== */

    tripId: {
      type: String,
      unique: true,
      index: true
    },

    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },

    /* =====================================================
       VEHICLE
    ===================================================== */

    vehicleType: {
      type: String,
      enum: [
        'bike',
        'keke',
        'car',
        'suv'
      ],
      required: true
    },

    /* =====================================================
       RIDE TYPE
       
       private:
       Rider has the vehicle exclusively.

       single_seat:
       Rider occupies one seat and may share
       the vehicle with compatible passengers.
    ===================================================== */

    rideType: {
      type: String,
      enum: [
        'private',
        'single_seat'
      ],
      default: 'private',
      index: true
    },

    seatsRequested: {
      type: Number,
      default: 1,
      min: 1
    },

    seatsOccupied: {
      type: Number,
      default: 1,
      min: 1
    },

    /* =====================================================
       SHARED RIDE
       
       These fields allow multiple independent Trip
       records to belong to the same physical vehicle journey.
    ===================================================== */

    sharedGroupId: {
      type: String,
      default: null,
      index: true
    },

    sharedParentTrip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      default: null,
      index: true
    },

    /* =====================================================
       ROUTE
    ===================================================== */

    pickup: {
      type: pointSchema,
      required: true
    },

    destination: {
      type: pointSchema,
      required: true
    },

    distanceKm: {
      type: Number,
      default: 0,
      min: 0
    },

    estimatedMinutes: {
      type: Number,
      default: 0,
      min: 0
    },

    /* =====================================================
       FARE / COMMISSION
    ===================================================== */

    fare: {
      type: Number,
      default: 0,
      min: 0
    },

    platformCommission: {
      type: Number,
      default: 0,
      min: 0
    },

    driverNetEarning: {
      type: Number,
      default: 0,
      min: 0
    },

    commissionStatus: {
      type: String,
      enum: [
        'not_applicable',
        'collected',
        'due'
      ],
      default: 'not_applicable',
      index: true
    },

    commissionCollectedAt: Date,

    /* =====================================================
       ROUTING
    ===================================================== */

    routingSource: {
      type: String,
      enum: [
        'osrm',
        'estimate'
      ],
      default: 'osrm'
    },

    /* =====================================================
       PAYMENT
    ===================================================== */

    paymentMethod: {
      type: String,
      enum: [
        'cash',
        'wallet'
      ],
      default: 'cash'
    },

    paymentStatus: {
      type: String,
      enum: [
        'cash_pending',
        'reserved',
        'paid',
        'refunded'
      ],
      default: 'cash_pending',
      index: true
    },

    walletReservationReference: String,

    walletReservedAt: Date,

    walletSettledAt: Date,

    walletRefundedAt: Date,

    /* =====================================================
       TRIP STATUS
    ===================================================== */

    status: {
      type: String,
      enum: [
        'REQUESTED',
        'SEARCHING_DRIVER',
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'TRIP_STARTED',
        'TRIP_COMPLETED',
        'CANCELLED'
      ],
      default: 'SEARCHING_DRIVER',
      index: true
    },

    /* =====================================================
       NORMAL TRIP TIMELINE
    ===================================================== */

    acceptedAt: Date,

    arrivingAt: Date,

    arrivedAt: Date,

    startedAt: Date,

    completedAt: Date,

    cancelledAt: Date,

    /* =====================================================
       DESTINATION ARRIVAL SYSTEM
       
       The platform independently determines whether
       the driver has reached the destination.
    ===================================================== */

    arrivalStatus: {
      type: String,
      enum: [
        'not_detected',
        'approaching',
        'detected',
        'rider_confirmed',
        'rider_disputed'
      ],
      default: 'not_detected',
      index: true
    },

    /* =====================================================
       GPS DESTINATION DETECTION
    ===================================================== */

    destinationArrivalAt: {
      type: Date,
      default: null
    },

    destinationArrivalLocation: {
      type: locationSchema,
      default: null
    },

    destinationArrivalDistanceMeters: {
      type: Number,
      default: null,
      min: 0
    },

    /* =====================================================
       RIDER CONFIRMATION
    ===================================================== */

    riderArrivalConfirmed: {
      type: Boolean,
      default: false
    },

    riderArrivalConfirmedAt: {
      type: Date,
      default: null
    },

    /* =====================================================
       DRIVER COMPLETION REQUEST
       
       Driver may request completion, but the backend
       remains the authority that validates the request.
    ===================================================== */

    driverCompletionRequestedAt: {
      type: Date,
      default: null
    },

    driverCompletionLocation: {
      type: locationSchema,
      default: null
    },

    /* =====================================================
       DESTINATION DISPUTE
    ===================================================== */

    riderArrivalDisputedAt: {
      type: Date,
      default: null
    },

    riderArrivalDisputeReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500
    }
  },
  {
    timestamps: true
  }
);

/* =========================================================
   INDEXES
========================================================= */

/*
 * Useful for finding active shared rides.
 */
schema.index({
  driver: 1,
  status: 1
});

/*
 * Useful for finding all trips belonging to
 * the same shared vehicle journey.
 */
schema.index({
  sharedGroupId: 1,
  status: 1
});

/*
 * Useful for destination-arrival processing.
 */
schema.index({
  status: 1,
  arrivalStatus: 1
});

/* =========================================================
   MODEL
========================================================= */

module.exports =
  mongoose.model(
    'Trip',
    schema
  );