const Trip = require('../models/Trip');
const DriverProfile = require('../models/DriverProfile');
const Wallet = require('../models/Wallet');

const {
  reserveRiderWallet,
  rollbackReservation,
  refundRiderWallet,
  settleDriverEarning,
  legacyWalletDebit
} = require('../services/tripPaymentService');

const {
  quoteFromRoute,
  normalizeKekeRideType
} = require('../utils/pricing');

const {
  getRoute,
  validatePoint
} = require('../utils/maps');

const {
  emitTrip,
  emitNewTrip,
  emitTripTaken
} = require('../realtime');

const {
  sendToUser,
  sendToMatchingDrivers
} = require('../services/pushService');

const {
  processDriverLocation,
  confirmRiderArrival,
  disputeRiderArrival,
  requestDriverCompletion
} = require('../services/destinationArrivalService');


/*
 * ---------------------------------------------------------
 * TRIP ID
 * ---------------------------------------------------------
 */

const tripId = () =>
  `TRP-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 90 + 10)}`;


/*
 * ---------------------------------------------------------
 * ACTIVE STATUSES
 * ---------------------------------------------------------
 */

const activeStatuses = [
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'TRIP_STARTED'
];


/*
 * ---------------------------------------------------------
 * NORMALISE VEHICLE TYPE
 * ---------------------------------------------------------
 */

function normalizeVehicleType(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}


/*
 * ---------------------------------------------------------
 * NORMALISE KEKE RIDE TYPE
 * ---------------------------------------------------------
 *
 * single_seat = ₦500
 * private     = ₦2,000
 */

function getKekeRideType(value) {
  return normalizeKekeRideType(
    value || 'single_seat'
  );
}


/*
 * ---------------------------------------------------------
 * VALIDATE KEKE RIDE TYPE
 * ---------------------------------------------------------
 */

function validateKekeRideType(
  vehicleType,
  kekeRideType
) {

  if (vehicleType !== 'keke') {
    return true;
  }

  return [
    'single_seat',
    'private'
  ].includes(
    getKekeRideType(kekeRideType)
  );
}


/*
 * ---------------------------------------------------------
 * QUOTE
 * ---------------------------------------------------------
 */

async function quote(req, res, next) {

  try {

    const {
      vehicleType,
      kekeRideType = 'single_seat',
      pickup,
      destination
    } = req.body;


    const normalizedVehicleType =
      normalizeVehicleType(
        vehicleType
      );


    /*
     * -----------------------------------------------------
     * REQUIRED FIELDS
     * -----------------------------------------------------
     */

    if (
      !normalizedVehicleType ||
      !pickup ||
      !destination
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Vehicle type, pickup and destination are required'
      });

    }


    /*
     * -----------------------------------------------------
     * KEKE RIDE TYPE
     * -----------------------------------------------------
     */

    const normalizedKekeRideType =
      getKekeRideType(
        kekeRideType
      );


    if (
      !validateKekeRideType(
        normalizedVehicleType,
        normalizedKekeRideType
      )
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Invalid Keke ride type'
      });

    }


    /*
     * -----------------------------------------------------
     * VALIDATE LOCATIONS
     * -----------------------------------------------------
     */

    const a =
      validatePoint(
        pickup,
        'Pickup'
      );

    const b =
      validatePoint(
        destination,
        'Destination'
      );


    /*
     * -----------------------------------------------------
     * SAME LOCATION CHECK
     * -----------------------------------------------------
     */

    if (
      Math.abs(a.lat - b.lat) < 0.00001 &&
      Math.abs(a.lng - b.lng) < 0.00001
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Pickup and destination cannot be the same'
      });

    }


    /*
     * -----------------------------------------------------
     * GET REAL ROAD ROUTE
     * -----------------------------------------------------
     *
     * Route distance is still used for:
     *
     * - map display
     * - ETA
     * - navigation
     *
     * It does NOT determine Keke fare.
     */

    const route =
      await getRoute(
        a,
        b
      );


    /*
     * -----------------------------------------------------
     * AUTHORITATIVE FARE CALCULATION
     * -----------------------------------------------------
     */

    const q =
      quoteFromRoute({
        distanceKm:
          route.distanceKm,

        durationMinutes:
          route.durationMinutes,

        vehicleType:
          normalizedVehicleType,

        kekeRideType:
          normalizedKekeRideType,

        source:
          route.source
      });


    /*
     * -----------------------------------------------------
     * RESPONSE
     * -----------------------------------------------------
     */

    return res.json({
      success: true,

      data: {

        quote: {

          ...q,

          routeGeometry:
            route.geometry

        }

      }

    });

  } catch (e) {

    if (e.statusCode) {

      return res
        .status(e.statusCode)
        .json({
          success: false,
          message: e.message
        });

    }

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * CREATE TRIP
 * ---------------------------------------------------------
 */

async function create(req, res, next) {

  let reserved = null;
  let tripDoc = null;

  try {

    const {
      vehicleType,
      kekeRideType = 'single_seat',
      pickup,
      destination,
      paymentMethod = 'cash'
    } = req.body;


    const normalizedVehicleType =
      normalizeVehicleType(
        vehicleType
      );


    const normalizedKekeRideType =
      getKekeRideType(
        kekeRideType
      );


    /*
     * -----------------------------------------------------
     * REQUIRED FIELDS
     * -----------------------------------------------------
     */

    if (
      !normalizedVehicleType ||
      !pickup ||
      !destination
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Vehicle type, pickup and destination are required'
      });

    }


    /*
     * -----------------------------------------------------
     * PAYMENT METHOD
     * -----------------------------------------------------
     */

    if (
      ![
        'cash',
        'wallet'
      ].includes(
        paymentMethod
      )
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Unsupported payment method'
      });

    }


    /*
     * -----------------------------------------------------
     * KEKE RIDE TYPE
     * -----------------------------------------------------
     */

    if (
      !validateKekeRideType(
        normalizedVehicleType,
        normalizedKekeRideType
      )
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Invalid Keke ride type'
      });

    }


    /*
     * -----------------------------------------------------
     * PREVENT MULTIPLE ACTIVE TRIPS
     * -----------------------------------------------------
     */

    const existing =
      await Trip.findOne({
        rider: req.user._id,

        status: {
          $in: activeStatuses
        }
      });


    if (existing) {

      return res.status(409).json({
        success: false,
        message:
          'You already have an active trip. Complete or cancel it before booking another.'
      });

    }


    /*
     * -----------------------------------------------------
     * VALIDATE LOCATIONS
     * -----------------------------------------------------
     */

    const a =
      validatePoint(
        pickup,
        'Pickup'
      );

    const b =
      validatePoint(
        destination,
        'Destination'
      );


    /*
     * -----------------------------------------------------
     * SAME LOCATION CHECK
     * -----------------------------------------------------
 */

    if (
      Math.abs(a.lat - b.lat) < 0.00001 &&
      Math.abs(a.lng - b.lng) < 0.00001
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Pickup and destination cannot be the same'
      });

    }


    /*
     * -----------------------------------------------------
     * REAL ROAD ROUTE
     * -----------------------------------------------------
     */

    const route =
      await getRoute(
        a,
        b
      );


    /*
     * -----------------------------------------------------
     * AUTHORITATIVE QUOTE
     * -----------------------------------------------------
     */

    const q =
      quoteFromRoute({
        distanceKm:
          route.distanceKm,

        durationMinutes:
          route.durationMinutes,

        vehicleType:
          normalizedVehicleType,

        kekeRideType:
          normalizedKekeRideType,

        source:
          route.source
      });


    /*
     * -----------------------------------------------------
     * DETERMINE KEKE SEAT INFORMATION
     * -----------------------------------------------------
     */

    const isKeke =
      normalizedVehicleType === 'keke';


    const isPrivateKeke =
      isKeke &&
      normalizedKekeRideType === 'private';


    const seatsRequested =
      isKeke
        ? (
            isPrivateKeke
              ? 4
              : 1
          )
        : 1;


    const seatsOccupied =
      seatsRequested;


    /*
     * -----------------------------------------------------
     * CREATE TRIP DOCUMENT
     * -----------------------------------------------------
     */

    const newTripId =
      tripId();


    tripDoc =
      new Trip({

        tripId:
          newTripId,

        rider:
          req.user._id,

        vehicleType:
          normalizedVehicleType,

        /*
         * Keke-specific commercial information.
         *
         * These fields are also included in q when
         * supported by the Trip schema.
         */

        kekeRideType:
          isKeke
            ? normalizedKekeRideType
            : null,

        pickup:
          a,

        destination:
          b,

        ...q,

        paymentMethod,

        status:
          'SEARCHING_DRIVER',

        paymentStatus:
          paymentMethod === 'wallet'
            ? 'reserved'
            : 'cash_pending',

        arrivalStatus:
          'not_detected',

        seatsRequested,

        seatsOccupied,

        /*
         * Explicit pricing basis makes the transaction
         * easier to audit later.
         */

        pricingBasis:
          isKeke
            ? 'fixed_per_passenger'
            : 'distance_based',

        passengerCapacity:
          isKeke
            ? 4
            : null,

        farePerPassenger:
          isKeke
            ? 500
            : null
      });


    /*
     * -----------------------------------------------------
     * WALLET RESERVATION
     * -----------------------------------------------------
     */

    if (
      paymentMethod === 'wallet'
    ) {

      reserved =
        await reserveRiderWallet({
          userId:
            req.user._id,

          fare:
            q.fare,

          tripId:
            newTripId,

          tripMongoId:
            tripDoc._id
        });


      tripDoc.walletReservationReference =
        reserved.reference;


      tripDoc.walletReservedAt =
        new Date();

    }


    /*
     * -----------------------------------------------------
     * SAVE
     * -----------------------------------------------------
     */

    await tripDoc.save();


    /*
     * -----------------------------------------------------
     * LIVE TRIP
     * -----------------------------------------------------
 */

    const live =
      await Trip.findById(
        tripDoc._id
      )
      .populate(
        'rider',
        'fullName phone'
      );


    /*
     * -----------------------------------------------------
     * REALTIME
     * -----------------------------------------------------
     */

    emitNewTrip(
      live
    );


    /*
     * -----------------------------------------------------
     * DRIVER PUSH
     * -----------------------------------------------------
 */

    sendToMatchingDrivers(
      live.vehicleType,
      {

        title:
          'New ride request',

        body:
          `${live.pickup?.label || 'Pickup'} → ` +
          `${live.destination?.label || 'Destination'} · ` +
          `₦${Number(
            live.fare || 0
          ).toLocaleString('en-NG')}`,

        url:
          '/driver',

        tag:
          `ride-${live._id}`,

        data: {

          type:
            'NEW_RIDE',

          tripId:
            live._id

        }

      }

    ).catch(e =>
      console.error(
        'Push new ride failed:',
        e.message
      )
    );


    /*
     * -----------------------------------------------------
     * RESPONSE
     * -----------------------------------------------------
     */

    return res.status(201).json({

      success: true,

      message:
        paymentMethod === 'wallet'
          ? 'Ride requested and fare reserved from wallet'
          : 'Ride requested',

      data: {

        trip:
          live

      }

    });

  } catch (e) {

    /*
     * -----------------------------------------------------
     * WALLET ROLLBACK
     * -----------------------------------------------------
     */

    if (
      reserved &&
      tripDoc
    ) {

      try {

        await rollbackReservation({
          userId:
            req.user._id,

          fare:
            tripDoc.fare,

          tripId:
            tripDoc.tripId,

          tripMongoId:
            tripDoc._id
        });

      } catch (
        rollbackError
      ) {

        console.error(
          'Wallet reservation rollback failed:',
          rollbackError.message
        );

      }

    }


    if (e.statusCode) {

      return res
        .status(e.statusCode)
        .json({
          success: false,
          message: e.message
        });

    }

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * LIST
 * ---------------------------------------------------------
 */

async function list(req, res, next) {

  try {

    const page =
      Math.max(
        1,
        Number(req.query.page) || 1
      );


    const limit =
      Math.min(
        50,
        Math.max(
          1,
          Number(req.query.limit) || 20
        )
      );


    let q =
      req.user.role === 'rider'
        ? {
            rider:
              req.user._id
          }

        : req.user.role === 'driver'
          ? {
              driver:
                req.user._id
            }

          : {};


    if (
      req.query.status
    ) {

      q.status =
        req.query.status;

    }


    const [
      trips,
      total
    ] =
      await Promise.all([

        Trip.find(q)

          .populate(
            'rider',
            'fullName phone'
          )

          .populate(
            'driver',
            'fullName phone'
          )

          .sort({
            createdAt:
              -1
          })

          .skip(
            (page - 1) *
            limit
          )

          .limit(
            limit
          ),

        Trip.countDocuments(q)

      ]);


    return res.json({

      success: true,

      data: {

        trips,

        pagination: {

          page,

          limit,

          total,

          pages:
            Math.ceil(
              total / limit
            )

        }

      }

    });

  } catch (e) {

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * GET ONE
 * ---------------------------------------------------------
 */

async function getOne(
  req,
  res,
  next
) {

  try {

    const ownership =
      req.user.role === 'rider'
        ? {
            rider:
              req.user._id
          }

        : req.user.role === 'driver'
          ? {
              driver:
                req.user._id
            }

          : {};


    const t =
      await Trip.findOne({

        _id:
          req.params.id,

        ...ownership

      })

      .populate(
        'rider',
        'fullName phone'
      )

      .populate(
        'driver',
        'fullName phone'
      );


    if (!t) {

      return res.status(404).json({
        success: false,
        message:
          'Trip not found'
      });

    }


    let driverLocation = null;


    if (
      t.driver
    ) {

      const dp =
        await DriverProfile.findOne({

          user:
            t.driver._id ||
            t.driver

        }).select(
          'location'
        );


      if (
        dp?.location?.latitude != null &&
        dp?.location?.longitude != null
      ) {

        driverLocation =
          dp.location;

      }

    }


    return res.json({

      success: true,

      data: {

        trip:
          t,

        driverLocation

      }

    });

  } catch (e) {

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * ACTIVE
 * ---------------------------------------------------------
 */

async function active(
  req,
  res,
  next
) {

  try {

    const q =
      req.user.role === 'rider'
        ? {
            rider:
              req.user._id
          }

        : req.user.role === 'driver'
          ? {
              driver:
                req.user._id
            }

          : {};


    const t =
      await Trip.findOne({

        ...q,

        status: {
          $in:
            activeStatuses
        }

      })

      .populate(
        'rider',
        'fullName phone'
      )

      .populate(
        'driver',
        'fullName phone'
      )

      .sort({
        createdAt:
          -1
      });


    return res.json({

      success: true,

      data: {

        trip:
          t || null

      }

    });

  } catch (e) {

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * AVAILABLE TRIPS
 * ---------------------------------------------------------
 */

async function available(
  req,
  res,
  next
) {

  try {

    const p =
      await DriverProfile.findOne({

        user:
          req.user._id,

        verificationStatus:
          'approved',

        online:
          true

      });


    if (!p) {

      return res.status(403).json({

        success: false,

        message:
          'Driver must be approved and online'

      });

    }


    const active =
      await Trip.exists({

        driver:
          req.user._id,

        status: {
          $in: [

            'DRIVER_ASSIGNED',

            'DRIVER_ARRIVING',

            'DRIVER_ARRIVED',

            'TRIP_STARTED'

          ]
        }

      });


    if (active) {

      return res.json({

        success: true,

        data: {

          trips: []

        },

        message:
          'Complete your active trip before accepting another'

      });

    }


    const t =
      await Trip.find({

        status:
          'SEARCHING_DRIVER',

        vehicleType:
          p.vehicleType

      })

      .populate(
        'rider',
        'fullName phone'
      )

      .sort({
        createdAt:
          1
      })

      .limit(
        30
      );


    return res.json({

      success: true,

      data: {

        trips:
          t

      }

    });

  } catch (e) {

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * ACCEPT
 * ---------------------------------------------------------
 */

async function accept(
  req,
  res,
  next
) {

  try {

    const d =
      await DriverProfile.findOne({

        user:
          req.user._id,

        verificationStatus:
          'approved',

        online:
          true

      });


    if (!d) {

      return res.status(403).json({

        success: false,

        message:
          'Driver must be approved and online'

      });

    }


    const already =
      await Trip.exists({

        driver:
          req.user._id,

        status: {
          $in: [

            'DRIVER_ASSIGNED',

            'DRIVER_ARRIVING',

            'DRIVER_ARRIVED',

            'TRIP_STARTED'

          ]
        }

      });


    if (already) {

      return res.status(409).json({

        success: false,

        message:
          'Complete your current trip before accepting another'

      });

    }


    const t =
      await Trip.findOneAndUpdate(

        {

          _id:
            req.params.id,

          status:
            'SEARCHING_DRIVER',

          driver: {
            $exists:
              false
          },

          vehicleType:
            d.vehicleType

        },

        {

          $set: {

            driver:
              req.user._id,

            status:
              'DRIVER_ASSIGNED',

            acceptedAt:
              new Date()

          }

        },

        {

          returnDocument:
            'after'

        }

      )

      .populate(
        'rider',
        'fullName phone'
      )

      .populate(
        'driver',
        'fullName phone'
      );


    if (!t) {

      return res.status(409).json({

        success: false,

        message:
          'Trip is no longer available or does not match your vehicle'

      });

    }


    emitTripTaken(
      t
    );


    emitTrip(
      'trip:updated',
      t
    );


    sendToUser(

      t.rider?._id ||
      t.rider,

      {

        title:
          'Driver is on the way',

        body:
          `${t.driver?.fullName || 'Your driver'} accepted your ride and is heading to your pickup.`,

        url:
          `/trip/${t._id}`,

        tag:
          `accepted-${t._id}`,

        data: {

          type:
            'DRIVER_ACCEPTED',

          tripId:
            t._id,

          status:
            t.status

        }

      }

    ).catch(e =>
      console.error(
        'Push acceptance failed:',
        e.message
      )
    );


    return res.json({

      success: true,

      message:
        'Trip accepted',

      data: {

        trip:
          t

      }

    });

  } catch (e) {

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * FINALIZE CONFIRMED TRIP
 * ---------------------------------------------------------
 */

async function finalizeConfirmedTrip(
  tripId,
  driverId
) {

  const current =
    await Trip.findOne({

      _id:
        tripId,

      driver:
        driverId,

      status:
        'TRIP_STARTED',

      riderArrivalConfirmed:
        true,

      arrivalStatus:
        'rider_confirmed'

    });


  if (!current) {

    const error =
      new Error(
        'Trip cannot be completed until the rider confirms the destination'
      );

    error.statusCode =
      409;

    throw error;

  }


  /*
   * Legacy wallet compatibility.
   */

  if (
    current.paymentMethod === 'wallet' &&
    !current.walletReservedAt
  ) {

    const debit =
      await legacyWalletDebit(
        current
      );


    current.walletReservationReference =
      debit.reference;


    current.walletReservedAt =
      new Date();


    await current.save();

  }


  /*
   * Atomic completion.
   */

  const t =
    await Trip.findOneAndUpdate(

      {

        _id:
          tripId,

        driver:
          driverId,

        status:
          'TRIP_STARTED',

        riderArrivalConfirmed:
          true,

        arrivalStatus:
          'rider_confirmed'

      },

      {

        $set: {

          status:
            'TRIP_COMPLETED',

          completedAt:
            new Date(),

          paymentStatus:
            'paid',

          ...(current.paymentMethod === 'wallet'
            ? {
                walletSettledAt:
                  new Date()
              }
            : {})

        }

      },

      {

        returnDocument:
          'after'

      }

    )

    .populate(
      'rider',
      'fullName phone'
    )

    .populate(
      'driver',
      'fullName phone'
    );


  if (!t) {

    const error =
      new Error(
        'Trip was already completed or its state changed'
      );

    error.statusCode =
      409;

    throw error;

  }


  /*
   * Driver statistics.
   */

  if (t.driver) {

    await DriverProfile.findOneAndUpdate(

      {
        user:
          t.driver._id ||
          t.driver
      },

      {

        $inc: {

          totalTrips:
            1

        }

      }

    );


    await settleDriverEarning(
      t
    );

  }


  /*
   * Realtime update.
   */

  emitTrip(
    'trip:updated',
    t
  );


  emitTrip(
    'destination:confirmed',
    t
  );


  /*
   * Driver notification.
   */

  if (t.driver) {

    sendToUser(

      t.driver._id ||
      t.driver,

      {

        title:
          'Trip completed',

        body:
          'The rider confirmed the destination. Trip payment has been settled.',

        url:
          '/driver',

        tag:
          `completed-${t._id}`,

        data: {

          type:
            'TRIP_COMPLETED',

          tripId:
            t._id,

          status:
            'TRIP_COMPLETED'

        }

      }

    ).catch(e =>
      console.error(
        'Push completion failed:',
        e.message
      )
    );

  }


  /*
   * Rider notification.
   */

  if (t.rider) {

    sendToUser(

      t.rider._id ||
      t.rider,

      {

        title:
          'Trip completed',

        body:
          'Your trip has been completed successfully. Thank you for riding with Kaduna Only.',

        url:
          `/trip/${t._id}`,

        tag:
          `completed-rider-${t._id}`,

        data: {

          type:
            'TRIP_COMPLETED',

          tripId:
            t._id,

          status:
            'TRIP_COMPLETED'

        }

      }

    ).catch(e =>
      console.error(
        'Push rider completion failed:',
        e.message
      )
    );

  }


  return t;
}


/*
 * ---------------------------------------------------------
 * DRIVER ADVANCE
 * ---------------------------------------------------------
 */

async function advance(
  req,
  res,
  next
) {

  try {

    const {
      from
    } = req.body;


    /*
     * TRIP_STARTED cannot be completed
     * through /advance.
     */

    if (
      from === 'TRIP_STARTED'
    ) {

      return res.status(409).json({

        success: false,

        code:
          'DESTINATION_CONFIRMATION_REQUIRED',

        message:
          'The driver cannot complete this trip directly. Reach the destination, then request completion and wait for rider confirmation.'

      });

    }


    const map = {

      DRIVER_ASSIGNED:
        'DRIVER_ARRIVING',

      DRIVER_ARRIVING:
        'DRIVER_ARRIVED',

      DRIVER_ARRIVED:
        'TRIP_STARTED'

    };


    const timeField = {

      DRIVER_ARRIVING:
        'arrivingAt',

      DRIVER_ARRIVED:
        'arrivedAt',

      TRIP_STARTED:
        'startedAt'

    };


    const nextStatus =
      map[from];


    if (!nextStatus) {

      return res.status(400).json({

        success: false,

        message:
          'Invalid trip transition'

      });

    }


    const current =
      await Trip.findOne({

        _id:
          req.params.id,

        driver:
          req.user._id,

        status:
          from

      });


    if (!current) {

      return res.status(409).json({

        success: false,

        message:
          'Trip state changed or trip not found'

      });

    }


    const set = {

      status:
        nextStatus,

      [timeField[nextStatus]]:
        new Date()

    };


    const t =
      await Trip.findOneAndUpdate(

        {

          _id:
            req.params.id,

          driver:
            req.user._id,

          status:
            from

        },

        {

          $set:
            set

        },

        {

          returnDocument:
            'after'

        }

      )

      .populate(
        'rider',
        'fullName phone'
      )

      .populate(
        'driver',
        'fullName phone'
      );


    if (!t) {

      return res.status(409).json({

        success: false,

        message:
          'Trip state changed before update completed'

      });

    }


    emitTrip(
      'trip:updated',
      t
    );


    const pushByStatus = {

      DRIVER_ARRIVING: {

        title:
          'Driver is on the way',

        body:
          'Your driver is travelling to your pickup point.',

        type:
          'DRIVER_ARRIVING'

      },

      DRIVER_ARRIVED: {

        title:
          'Your driver has arrived',

        body:
          'Your Kaduna Only driver is waiting at the pickup point.',

        type:
          'DRIVER_ARRIVED'

      },

      TRIP_STARTED: {

        title:
          'Trip started',

        body:
          'Your Kaduna Only trip is now in progress.',

        type:
          'TRIP_STARTED'

      }

    };


    const push =
      pushByStatus[
        nextStatus
      ];


    if (push) {

      sendToUser(

        t.rider?._id ||
        t.rider,

        {

          title:
            push.title,

          body:
            push.body,

          url:
            `/trip/${t._id}`,

          tag:
            `${push.type}-${t._id}`,

          data: {

            type:
              push.type,

            tripId:
              t._id,

            status:
              nextStatus

          }

        }

      ).catch(e =>
        console.error(
          'Push trip update failed:',
          e.message
        )
      );

    }


    return res.json({

      success: true,

      message:
        'Trip status updated',

      data: {

        trip:
          t

      }

    });

  } catch (e) {

    if (e.statusCode) {

      return res
        .status(e.statusCode)
        .json({
          success: false,
          message: e.message
        });

    }

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * DRIVER REQUESTS COMPLETION
 * ---------------------------------------------------------
 */

async function requestCompletion(
  req,
  res,
  next
) {

  try {

    const {
      latitude,
      longitude,
      accuracy
    } = req.body || {};


    /*
     * Driver must own the active trip.
     */

    const current =
      await Trip.findOne({

        _id:
          req.params.id,

        driver:
          req.user._id,

        status:
          'TRIP_STARTED'

      });


    if (!current) {

      return res.status(409).json({

        success: false,

        message:
          'Trip is not active or does not belong to this driver'

      });

    }


    /*
     * -----------------------------------------------------
     * RIDER HAS NOT CONFIRMED YET
     * -----------------------------------------------------
     */

    if (
      !current.riderArrivalConfirmed ||
      current.arrivalStatus !== 'rider_confirmed'
    ) {

      const result =
        await requestDriverCompletion({

          tripId:
            req.params.id,

          driverId:
            req.user._id,

          latitude,

          longitude,

          accuracy

        });


      /*
       * Ask rider to confirm.
       */

      if (
        result.trip?.rider
      ) {

        sendToUser(

          result.trip.rider._id ||
          result.trip.rider,

          {

            title:
              'Have you reached your destination?',

            body:
              result.trip.arrivalStatus === 'detected'
                ? 'GPS shows that you are at your destination. Please confirm that you have arrived.'
                : 'Your driver has requested trip completion. Please confirm your destination.',

            url:
              `/trip/${result.trip._id}`,

            tag:
              `completion-request-${result.trip._id}`,

            data: {

              type:
                'DESTINATION_CONFIRMATION_REQUIRED',

              tripId:
                result.trip._id,

              distanceMeters:
                result.distanceMeters,

              arrivalStatus:
                result.trip.arrivalStatus

            }

          }

        ).catch(e =>
          console.error(
            'Push completion request failed:',
            e.message
          )
        );

      }


      return res.json({

        success: true,

        message:
          'Completion request sent. Waiting for rider confirmation.',

        data: {

          trip:
            result.trip,

          distanceMeters:
            result.distanceMeters,

          requiresRiderConfirmation:
            true,

          canComplete:
            false

        }

      });

    }


    /*
     * -----------------------------------------------------
     * RIDER ALREADY CONFIRMED
     * -----------------------------------------------------
     *
     * CRITICAL:
     *
     * Use DRIVER ID here.
     *
     * The previous implementation risked looking up
     * the Trip with an undefined or incorrect owner.
     */

    const completed =
      await finalizeConfirmedTrip(

        current._id,

        req.user._id

      );


    return res.json({

      success: true,

      message:
        'Rider confirmed arrival. Trip completed successfully.',

      data: {

        trip:
          completed,

        requiresRiderConfirmation:
          false,

        canComplete:
          false

      }

    });

  } catch (e) {

    if (e.statusCode) {

      return res
        .status(e.statusCode)
        .json({
          success: false,
          message: e.message
        });

    }

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * RIDER CONFIRMS DESTINATION
 * ---------------------------------------------------------
 */

async function confirmDestination(
  req,
  res,
  next
) {

  try {

    const trip =
      await confirmRiderArrival(

        req.params.id,

        req.user._id

      );


    /*
     * Rider confirmation does NOT itself complete
     * the trip.
     *
     * It unlocks the driver's completion action.
     */

    if (
      trip.driver
    ) {

      sendToUser(

        trip.driver._id ||
        trip.driver,

        {

          title:
            'Rider confirmed arrival',

          body:
            'The rider confirmed that the destination has been reached. You can now complete the trip.',

          url:
            `/driver/trip/${trip._id}`,

          tag:
            `rider-confirmed-${trip._id}`,

          data: {

            type:
              'RIDER_ARRIVAL_CONFIRMED',

            tripId:
              trip._id,

            status:
              trip.status,

            riderArrivalConfirmed:
              true

          }

        }

      ).catch(e =>
        console.error(
          'Push rider confirmation failed:',
          e.message
        )
      );

    }


    emitTrip(
      'trip:updated',
      trip
    );


    return res.json({

      success: true,

      message:
        'Arrival confirmed. The driver can now complete the trip.',

      data: {

        trip,

        riderArrivalConfirmed:
          true,

        canDriverComplete:
          true

      }

    });

  } catch (e) {

    if (e.statusCode) {

      return res
        .status(e.statusCode)
        .json({
          success: false,
          message: e.message
        });

    }

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * RIDER DISPUTES DESTINATION
 * ---------------------------------------------------------
 */

async function disputeDestination(
  req,
  res,
  next
) {

  try {

    const {
      reason = ''
    } = req.body || {};


    const trip =
      await disputeRiderArrival(

        req.params.id,

        req.user._id,

        reason

      );


    /*
     * Notify driver.
     */

    if (
      trip.driver
    ) {

      sendToUser(

        trip.driver._id ||
        trip.driver,

        {

          title:
            'Rider has not confirmed the destination',

          body:
            'The rider indicated that the destination has not yet been reached. Please continue the trip.',

          url:
            '/driver',

          tag:
            `destination-dispute-${trip._id}`,

          data: {

            type:
              'DESTINATION_DISPUTED',

            tripId:
              trip._id,

            status:
              trip.status

          }

        }

      ).catch(e =>
        console.error(
          'Push destination dispute failed:',
          e.message
        )
      );

    }


    emitTrip(
      'trip:updated',
      trip
    );


    return res.json({

      success: true,

      message:
        'Destination dispute recorded. The trip remains active.',

      data: {

        trip

      }

    });

  } catch (e) {

    if (e.statusCode) {

      return res
        .status(e.statusCode)
        .json({
          success: false,
          message: e.message
        });

    }

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * CANCEL
 * ---------------------------------------------------------
 */

async function cancel(
  req,
  res,
  next
) {

  try {

    const t =
      await Trip.findOne({

        _id:
          req.params.id,

        rider:
          req.user._id,

        status: {
          $in: [

            'SEARCHING_DRIVER',

            'DRIVER_ASSIGNED',

            'DRIVER_ARRIVING'

          ]
        }

      });


    if (!t) {

      return res.status(409).json({

        success: false,

        message:
          'Trip cannot be cancelled at its current stage'

      });

    }


    let refunded =
      false;


    if (
      t.paymentMethod === 'wallet' &&
      t.walletReservedAt &&
      !t.walletRefundedAt
    ) {

      const r =
        await refundRiderWallet(
          t
        );


      refunded =
        r.refunded;

    }


    t.status =
      'CANCELLED';


    t.cancelledAt =
      new Date();


    if (refunded) {

      t.walletRefundedAt =
        new Date();

      t.paymentStatus =
        'refunded';

    }


    await t.save();


    const live =
      await Trip.findById(
        t._id
      )

      .populate(
        'rider',
        'fullName phone'
      )

      .populate(
        'driver',
        'fullName phone'
      );


    emitTripTaken(
      live
    );


    emitTrip(
      'trip:updated',
      live
    );


    if (
      live.driver
    ) {

      sendToUser(

        live.driver?._id ||
        live.driver,

        {

          title:
            'Ride cancelled',

          body:
            'The rider cancelled this trip.',

          url:
            '/driver',

          tag:
            `cancelled-${live._id}`,

          data: {

            type:
              'TRIP_CANCELLED',

            tripId:
              live._id

          }

        }

      ).catch(() => {});

    }


    return res.json({

      success: true,

      message:
        refunded
          ? 'Trip cancelled and wallet fare refunded'
          : 'Trip cancelled',

      data: {

        trip:
          live,

        refunded

      }

    });

  } catch (e) {

    return next(e);
  }
}


/*
 * ---------------------------------------------------------
 * EXPORTS
 * ---------------------------------------------------------
 */

module.exports = {

  quote,

  create,

  list,

  getOne,

  active,

  available,

  accept,

  advance,

  requestCompletion,

  confirmDestination,

  disputeDestination,

  cancel

};