const Trip = require('../models/Trip');
const { emitTrip } = require('../realtime');

/*
 * Arrival detection configuration.
 *
 * GPS arrival detection is an assistance mechanism.
 * It is NOT a requirement for rider confirmation.
 */

const ARRIVAL_RADIUS_METERS = 100;
const APPROACHING_RADIUS_METERS = 500;

/*
 * Haversine distance.
 *
 * Returns the straight-line distance between two
 * latitude/longitude coordinates in metres.
 */

function distanceBetweenMeters(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {
  const toRadians = value =>
    (Number(value) * Math.PI) / 180;

  const earthRadius = 6371000;

  const lat1 = toRadians(latitude1);
  const lat2 = toRadians(latitude2);

  const deltaLat =
    toRadians(latitude2 - latitude1);

  const deltaLng =
    toRadians(longitude2 - longitude1);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}

/*
 * Validate a GPS coordinate.
 */

function validCoordinate(
  latitude,
  longitude
) {
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/*
 * Determine the driver's distance from
 * the trip destination.
 */

function getDestinationDistance(
  trip,
  latitude,
  longitude
) {
  if (
    !trip?.destination ||
    !validCoordinate(
      latitude,
      longitude
    )
  ) {
    return null;
  }

  return distanceBetweenMeters(
    latitude,
    longitude,
    trip.destination.lat,
    trip.destination.lng
  );
}

/*
 * Process a driver's latest GPS position.
 *
 * GPS detection assists the trip but does NOT
 * automatically complete the trip.
 */

async function processDriverLocation({
  trip,
  latitude,
  longitude,
  accuracy
}) {
  if (!trip) {
    return {
      processed: false,
      reason: 'No active trip'
    };
  }

  if (
    !validCoordinate(
      latitude,
      longitude
    )
  ) {
    return {
      processed: false,
      reason: 'Invalid driver coordinates'
    };
  }

  if (
    ![
      'DRIVER_ASSIGNED',
      'DRIVER_ARRIVING',
      'DRIVER_ARRIVED',
      'TRIP_STARTED'
    ].includes(trip.status)
  ) {
    return {
      processed: false,
      reason: 'Trip is not active'
    };
  }

  /*
   * Do not repeatedly process a trip that the rider
   * has already confirmed.
   */
  if (
    trip.arrivalStatus === 'rider_confirmed' ||
    trip.status === 'TRIP_COMPLETED'
  ) {
    return {
      processed: false,
      reason: 'Destination already confirmed'
    };
  }

  const distanceMeters =
    getDestinationDistance(
      trip,
      latitude,
      longitude
    );

  if (distanceMeters === null) {
    return {
      processed: false,
      reason: 'Destination coordinates unavailable'
    };
  }

  const now = new Date();

  const location = {
    latitude,
    longitude,
    ...(Number.isFinite(Number(accuracy))
      ? {
          accuracy: Number(accuracy)
        }
      : {}),
    recordedAt: now
  };

  /*
   * DESTINATION REACHED
   */

  if (
    distanceMeters <=
    ARRIVAL_RADIUS_METERS
  ) {
    const alreadyDetected =
      trip.arrivalStatus === 'detected' ||
      trip.arrivalStatus === 'rider_disputed';

    trip.arrivalStatus = 'detected';

    trip.destinationArrivalAt =
      trip.destinationArrivalAt || now;

    trip.destinationArrivalLocation =
      trip.destinationArrivalLocation ||
      location;

    trip.destinationArrivalDistanceMeters =
      Math.round(distanceMeters);

    await trip.save();

    if (!alreadyDetected) {
      emitTrip(
        'destination:arrived',
        trip
      );
    }

    return {
      processed: true,
      state: 'arrived',
      distanceMeters:
        Math.round(distanceMeters),
      trip
    };
  }

  /*
   * DESTINATION APPROACHING
   */

  if (
    distanceMeters <=
    APPROACHING_RADIUS_METERS
  ) {
    if (
      trip.arrivalStatus ===
      'not_detected'
    ) {
      trip.arrivalStatus =
        'approaching';

      await trip.save();

      emitTrip(
        'destination:approaching',
        trip
      );
    }

    return {
      processed: true,
      state: 'approaching',
      distanceMeters:
        Math.round(distanceMeters),
      trip
    };
  }

  /*
   * DRIVER STILL EN ROUTE
   */

  return {
    processed: true,
    state: 'en_route',
    distanceMeters:
      Math.round(distanceMeters),
    trip
  };
}

/*
 * Rider manually confirms that they have
 * reached the destination.
 *
 * IMPORTANT:
 *
 * GPS arrival detection is NOT required.
 *
 * The rider's explicit confirmation is the
 * authority for unlocking driver completion.
 */

async function confirmRiderArrival(
  tripId,
  riderId
) {
  const trip =
    await Trip.findOne({
      _id: tripId,
      rider: riderId
    });

  if (!trip) {
    const error =
      new Error(
        'Trip not found'
      );

    error.statusCode = 404;

    throw error;
  }

  if (
    trip.status ===
    'TRIP_COMPLETED'
  ) {
    return trip;
  }

  /*
   * Rider confirmation is only meaningful
   * while the trip is actually in progress.
   */

  if (
    trip.status !==
    'TRIP_STARTED'
  ) {
    const error =
      new Error(
        'You can only confirm arrival while the trip is in progress'
      );

    error.statusCode = 409;

    throw error;
  }

  /*
   * Prevent duplicate confirmation.
   */

  if (
    trip.riderArrivalConfirmed === true ||
    trip.arrivalStatus ===
      'rider_confirmed'
  ) {
    return trip;
  }

  const now = new Date();

  /*
   * Manual rider confirmation is authoritative.
   *
   * We deliberately do NOT require:
   *
   * arrivalStatus === 'detected'
   *
   * because GPS may be inaccurate, unavailable,
   * delayed, or unavailable in certain locations.
   */

  trip.arrivalStatus =
    'rider_confirmed';

  trip.riderArrivalConfirmed =
    true;

  trip.riderArrivalConfirmedAt =
    now;

  /*
   * If GPS has already detected arrival,
   * preserve the original GPS evidence.
   *
   * If it has not, we simply record that the
   * rider explicitly confirmed arrival.
   */

  if (
    !trip.destinationArrivalAt
  ) {
    trip.destinationArrivalAt =
      now;
  }

  await trip.save();

  /*
   * Notify the rider's and driver's realtime
   * connections.
   */

  emitTrip(
    'destination:confirmed',
    trip
  );

  return trip;
}

/*
 * Rider disputes an automatic arrival detection.
 */

async function disputeRiderArrival(
  tripId,
  riderId,
  reason = ''
) {
  const trip =
    await Trip.findOne({
      _id: tripId,
      rider: riderId
    });

  if (!trip) {
    const error =
      new Error(
        'Trip not found'
      );

    error.statusCode = 404;

    throw error;
  }

  if (
    trip.status ===
    'TRIP_COMPLETED'
  ) {
    const error =
      new Error(
        'Trip has already been completed'
      );

    error.statusCode = 409;

    throw error;
  }

  trip.arrivalStatus =
    'rider_disputed';

  trip.riderArrivalConfirmed =
    false;

  trip.riderArrivalDisputedAt =
    new Date();

  trip.riderArrivalDisputeReason =
    String(reason || '')
      .trim()
      .slice(0, 500);

  await trip.save();

  emitTrip(
    'destination:disputed',
    trip
  );

  return trip;
}

/*
 * Driver requests completion.
 *
 * This records the driver's completion request.
 * It does NOT itself complete the trip.
 */

async function requestDriverCompletion({
  tripId,
  driverId,
  latitude,
  longitude,
  accuracy
}) {
  const trip =
    await Trip.findOne({
      _id: tripId,
      driver: driverId
    });

  if (!trip) {
    const error =
      new Error(
        'Active trip not found'
      );

    error.statusCode = 404;

    throw error;
  }

  if (
    trip.status ===
    'TRIP_COMPLETED'
  ) {
    return {
      completed: true,
      trip
    };
  }

  if (
    trip.status !==
      'TRIP_STARTED' &&
    trip.status !==
      'DRIVER_ARRIVED'
  ) {
    const error =
      new Error(
        'Trip is not ready for completion'
      );

    error.statusCode = 409;

    throw error;
  }

  if (
    !validCoordinate(
      latitude,
      longitude
    )
  ) {
    const error =
      new Error(
        'Valid driver location is required'
      );

    error.statusCode = 400;

    throw error;
  }

  const distanceMeters =
    getDestinationDistance(
      trip,
      latitude,
      longitude
    );

  if (distanceMeters === null) {
    const error =
      new Error(
        'Destination coordinates unavailable'
      );

    error.statusCode = 409;

    throw error;
  }

  const now = new Date();

  trip.driverCompletionRequestedAt =
    now;

  trip.driverCompletionLocation = {
    latitude,
    longitude,
    ...(Number.isFinite(Number(accuracy))
      ? {
          accuracy: Number(accuracy)
        }
      : {}),
    recordedAt: now
  };

  /*
   * GPS can automatically record that the driver
   * has reached the destination.
   */

  if (
    distanceMeters <=
    ARRIVAL_RADIUS_METERS
  ) {
    trip.arrivalStatus =
      trip.riderArrivalConfirmed
        ? 'rider_confirmed'
        : 'detected';

    trip.destinationArrivalAt =
      trip.destinationArrivalAt ||
      now;

    trip.destinationArrivalLocation =
      trip.destinationArrivalLocation ||
      trip.driverCompletionLocation;

    trip.destinationArrivalDistanceMeters =
      Math.round(distanceMeters);
  }

  await trip.save();

  /*
   * NEVER complete here.
   *
   * Rider confirmation remains the required
   * confirmation before final completion.
   */

  emitTrip(
    'destination:completion_requested',
    trip
  );

  return {
    completed: false,
    requiresRiderConfirmation:
      !trip.riderArrivalConfirmed,
    riderArrivalConfirmed:
      Boolean(
        trip.riderArrivalConfirmed
      ),
    distanceMeters:
      Math.round(distanceMeters),
    trip
  };
}

module.exports = {
  ARRIVAL_RADIUS_METERS,
  APPROACHING_RADIUS_METERS,
  distanceBetweenMeters,
  getDestinationDistance,
  processDriverLocation,
  confirmRiderArrival,
  disputeRiderArrival,
  requestDriverCompletion
};