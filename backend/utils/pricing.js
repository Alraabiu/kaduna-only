/*
 * =========================================================
 * KADUNA ONLY PRICING ENGINE
 * =========================================================
 *
 * IMPORTANT BUSINESS RULE
 *
 * KEKE:
 *   - Fare is NOT calculated by kilometre.
 *   - Route distance is used only for map display and ETA.
 *   - A Keke has a maximum capacity of 4 passengers.
 *
 *   SINGLE SEAT:
 *      ₦500 per passenger/seat
 *
 *   PRIVATE KEKE:
 *      ₦2,000 for the entire Keke
 *
 * Examples:
 *
 *   Malali → Central Market
 *      Single Seat = ₦500
 *      Private      = ₦2,000
 *
 *   Kawo → Central Market
 *      Single Seat = ₦500
 *      Private      = ₦2,000
 *
 *   Central Market → Ungwan Rimi
 *      Single Seat = ₦500
 *      Private      = ₦2,000
 *
 * Distance does NOT change these Keke fares.
 *
 * OTHER VEHICLES:
 *   Bike, Car and SUV remain distance-based.
 *
 * =========================================================
 */


/*
 * ---------------------------------------------------------
 * STANDARD VEHICLE PRICING
 * ---------------------------------------------------------
 */

const PRICING = {

  bike: {

    base: 350,

    perKm: 120,

    minimum: 700,

    etaFactor: 1.08,

    avgKph: 25

  },


  /*
   * Keke pricing is intentionally different.
   *
   * Do NOT use base/perKm/minimum for Keke.
   */

  keke: {

    capacity: 4,

    singleSeatFare: 500,

    privateFare: 2000,

    etaFactor: 1.12,

    avgKph: 22

  },


  car: {

    base: 700,

    perKm: 250,

    minimum: 1400,

    etaFactor: 1,

    avgKph: 30

  },


  suv: {

    base: 1000,

    perKm: 330,

    minimum: 2000,

    etaFactor: 1.03,

    avgKph: 28

  }

};


/*
 * ---------------------------------------------------------
 * LOCATION CONFIGURATION
 * ---------------------------------------------------------
 */

const LOCATIONS = {

  kaduna: {

    name: 'Kaduna',

    enabled: true

  }

};


/*
 * ---------------------------------------------------------
 * KEKE RIDE TYPE NORMALISATION
 * ---------------------------------------------------------
 *
 * Allows the frontend to send:
 *
 * single
 * single_seat
 * single-seat
 * single seat
 * private
 * private_ride
 * private-ride
 *
 * Internally everything becomes:
 *
 * single_seat
 * private
 *
 * ---------------------------------------------------------
 */

function normalizeKekeRideType(
  value
) {

  const normalized =
    String(
      value || 'single_seat'
    )
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');


  if (
    [
      'single',
      'single_seat',
      'singleseat',
      'one_seat',
      'one'
    ].includes(
      normalized
    )
  ) {

    return 'single_seat';

  }


  if (
    [
      'private',
      'private_ride',
      'private_keke',
      'entire_keke',
      'whole_keke'
    ].includes(
      normalized
    )
  ) {

    return 'private';

  }


  /*
   * Default safely to single seat.
   */

  return 'single_seat';

}


/*
 * ---------------------------------------------------------
 * SET PRICING CONFIGURATION
 * ---------------------------------------------------------
 */

function setPricingConfig(
  config = {}
) {

  for (
    const vehicle of [
      'bike',
      'keke',
      'car',
      'suv'
    ]
  ) {

    if (
      !config[vehicle]
    ) {
      continue;
    }


    PRICING[vehicle] = {

      ...PRICING[vehicle],

      ...config[vehicle]

    };

  }

}


/*
 * ---------------------------------------------------------
 * KEKE QUOTE
 * ---------------------------------------------------------
 */

function quoteKeke({
  distanceKm,
  durationMinutes,
  kekeRideType = 'single_seat',
  source = 'osrm'
}) {

  const price =
    PRICING.keke;


  if (!price) {

    const error =
      new Error(
        'Keke pricing configuration is missing'
      );

    error.statusCode =
      500;

    throw error;

  }


  /*
   * Normalise requested ride type.
   */

  const rideType =
    normalizeKekeRideType(
      kekeRideType
    );


  /*
   * -------------------------------------------------------
   * FIXED KEKE FARE
   * -------------------------------------------------------
   */

  let fare;


  if (
    rideType === 'private'
  ) {

    fare =
      Number(
        price.privateFare
      );

  } else {

    fare =
      Number(
        price.singleSeatFare
      );

  }


  /*
   * Validate fare configuration.
   */

  if (
    !Number.isFinite(fare) ||
    fare <= 0
  ) {

    const error =
      new Error(
        `Invalid Keke fare configuration for ${rideType}`
      );

    error.statusCode =
      500;

    throw error;

  }


  /*
   * -------------------------------------------------------
   * ETA
   * -------------------------------------------------------
   *
   * Distance is NOT used for fare.
   *
   * It is used only to calculate/display ETA.
   */

  const distance =
    Number(
      distanceKm
    );


  const duration =
    Number(
      durationMinutes
    );


  const estimatedMinutes =
    Math.max(

      3,

      Math.ceil(

        (
          Number.isFinite(duration) &&
          duration > 0

            ? duration

            : (
                Number.isFinite(distance) &&
                distance > 0

                  ? distance *
                    60 /
                    price.avgKph

                  : 10
              )

        ) *

        price.etaFactor

      )

    );


  return {

    distanceKm:
      Number.isFinite(distance)
        ? Number(
            distance.toFixed(1)
          )
        : 0,


    estimatedMinutes,


    fare,


    currency:
      'NGN',


    pricingVersion:
      'kaduna-keke-fixed-v2',


    pricingBasis:
      'fixed_per_passenger',


    vehicleType:
      'keke',


    kekeRideType:
      rideType,


    passengerCapacity:
      Number(
        price.capacity || 4
      ),


    farePerPassenger:
      Number(
        price.singleSeatFare
      ),


    singleSeatFare:
      Number(
        price.singleSeatFare
      ),


    privateFare:
      Number(
        price.privateFare
      ),


    routingSource:
      source

  };

}


/*
 * ---------------------------------------------------------
 * DISTANCE-BASED VEHICLE QUOTE
 * ---------------------------------------------------------
 */

function quoteDistanceBasedVehicle({
  distanceKm,
  durationMinutes,
  vehicleType,
  source = 'osrm'
}) {

  const price =
    PRICING[vehicleType];


  if (!price) {

    const error =
      new Error(
        'Unsupported vehicle type'
      );

    error.statusCode =
      400;

    throw error;

  }


  const distance =
    Number(
      distanceKm
    );


  const duration =
    Number(
      durationMinutes
    );


  if (
    !Number.isFinite(distance) ||
    distance <= 0
  ) {

    const error =
      new Error(
        'Valid route distance is required'
      );

    error.statusCode =
      400;

    throw error;

  }


  /*
   * -------------------------------------------------------
   * ETA
   * -------------------------------------------------------
   */

  const estimatedMinutes =
    Math.max(

      3,

      Math.ceil(

        (
          Number.isFinite(duration) &&
          duration > 0

            ? duration

            : (
                distance *
                60 /
                price.avgKph
              )

        ) *

        price.etaFactor

      )

    );


  /*
   * -------------------------------------------------------
   * FARE
   * -------------------------------------------------------
   */

  const rawFare =
    Math.max(

      price.minimum,

      price.base +
      distance *
      price.perKm

    );


  const fare =
    Math.ceil(
      rawFare / 50
    ) * 50;


  return {

    distanceKm:
      Number(
        distance.toFixed(1)
      ),


    estimatedMinutes,


    fare,


    currency:
      'NGN',


    pricingVersion:
      'kaduna-osm-v2',


    pricingBasis:
      'distance_based',


    vehicleType,


    routingSource:
      source

  };

}


/*
 * ---------------------------------------------------------
 * MAIN QUOTE FUNCTION
 * ---------------------------------------------------------
 */

function quoteFromRoute({

  distanceKm,

  durationMinutes,

  vehicleType,

  kekeRideType = 'single_seat',

  source = 'osrm'

}) {

  const normalizedVehicleType =
    String(
      vehicleType || ''
    )
      .trim()
      .toLowerCase();


  /*
   * -------------------------------------------------------
   * KEKE
   * -------------------------------------------------------
   *
   * Keke is deliberately separated from the
   * distance-based pricing engine.
   */

  if (
    normalizedVehicleType === 'keke'
  ) {

    return quoteKeke({

      distanceKm,

      durationMinutes,

      kekeRideType,

      source

    });

  }


  /*
   * -------------------------------------------------------
   * BIKE / CAR / SUV
   * -------------------------------------------------------
   */

  return quoteDistanceBasedVehicle({

    distanceKm,

    durationMinutes,

    vehicleType:
      normalizedVehicleType,

    source

  });

}


/*
 * ---------------------------------------------------------
 * EXPORTS
 * ---------------------------------------------------------
 */

module.exports = {

  PRICING,

  LOCATIONS,

  quoteFromRoute,

  quoteKeke,

  quoteDistanceBasedVehicle,

  normalizeKekeRideType,

  setPricingConfig

};