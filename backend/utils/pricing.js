/*
 * =========================================================
 * KADUNA ONLY PRICING ENGINE
 * =========================================================
 *
 * BUSINESS RULES
 *
 * 1. Admin controls pricing.
 * 2. Different routes may have different fares.
 * 3. There is NO commission.
 * 4. Google/OSRM routing supplies route information only.
 * 5. Route distance is used for ETA and, where no explicit
 *    route fare exists, distance-based pricing.
 *
 * KEKE
 *
 *   Single seat:
 *      Uses route-specific singleSeatFare when configured.
 *      Otherwise uses default singleSeatFare.
 *
 *   Private:
 *      Uses route-specific privateFare when configured.
 *      Otherwise uses default privateFare.
 *
 * OTHER VEHICLES
 *
 *   Bike, Car and SUV:
 *      Use route-specific fixed fare when configured.
 *      Otherwise use the existing distance-based formula.
 *
 * =========================================================
 */


/*
 * ---------------------------------------------------------
 * DEFAULT PRICING
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
 * LOCATIONS
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
 * NORMALISE KEKE RIDE TYPE
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
      .replace(
        /[\s-]+/g,
        '_'
      );


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


  return 'single_seat';

}


/*
 * ---------------------------------------------------------
 * NORMALISE LOCATION KEY
 * ---------------------------------------------------------
 */

function normalizeLocationKey(
  value
) {

  return String(
    value || ''
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      ' '
    );

}


/*
 * ---------------------------------------------------------
 * SET GLOBAL PRICING
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
 * ROUTE MATCHING
 * ---------------------------------------------------------
 *
 * Priority:
 *
 * 1. Google Place ID pair
 * 2. Normalised pickup/destination labels
 *
 * Direction matters.
 *
 * Ghana Road → Kawo
 *
 * is different from:
 *
 * Kawo → Ghana Road
 *
 * unless both are explicitly configured.
 *
 * ---------------------------------------------------------
 */

function findRoutePricing({

  routes = [],

  pickupLabel = '',

  destinationLabel = '',

  pickupPlaceId = null,

  destinationPlaceId = null

} = {}) {

  if (
    !Array.isArray(routes) ||
    routes.length === 0
  ) {

    return null;

  }


  const pickupKey =
    normalizeLocationKey(
      pickupLabel
    );


  const destinationKey =
    normalizeLocationKey(
      destinationLabel
    );


  /*
   * -------------------------------------------------------
   * PLACE ID MATCH
   * -------------------------------------------------------
   */

  if (
    pickupPlaceId &&
    destinationPlaceId
  ) {

    const placeMatch =
      routes.find(
        route =>

          route?.active !== false &&

          route?.pickupPlaceId ===
            pickupPlaceId &&

          route?.destinationPlaceId ===
            destinationPlaceId

      );


    if (
      placeMatch
    ) {

      return placeMatch;

    }

  }


  /*
   * -------------------------------------------------------
   * LABEL MATCH
   * -------------------------------------------------------
   */

  const labelMatch =
    routes.find(
      route =>

        route?.active !== false &&

        normalizeLocationKey(
          route?.pickupKey ||
          route?.pickupLabel
        ) ===
          pickupKey &&

        normalizeLocationKey(
          route?.destinationKey ||
          route?.destinationLabel
        ) ===
          destinationKey

    );


  return labelMatch || null;

}


/*
 * ---------------------------------------------------------
 * ROUND FARE
 * ---------------------------------------------------------
 */

function roundFare(
  value
) {

  const number =
    Number(
      value
    );


  if (
    !Number.isFinite(
      number
    )
  ) {

    return 0;

  }


  return (
    Math.ceil(
      number / 50
    ) * 50
  );

}


/*
 * ---------------------------------------------------------
 * ETA
 * ---------------------------------------------------------
 */

function calculateEstimatedMinutes({

  distanceKm,

  durationMinutes,

  avgKph,

  etaFactor

}) {

  const distance =
    Number(
      distanceKm
    );


  const duration =
    Number(
      durationMinutes
    );


  const speed =
    Number(
      avgKph
    );


  const factor =
    Number(
      etaFactor
    );


  const validFactor =
    Number.isFinite(
      factor
    ) &&
    factor > 0
      ? factor
      : 1;


  const fallbackDuration =
    Number.isFinite(
      distance
    ) &&
    distance > 0 &&
    Number.isFinite(
      speed
    ) &&
    speed > 0

      ? (
          distance *
          60 /
          speed
        )

      : 10;


  const baseDuration =
    Number.isFinite(
      duration
    ) &&
    duration > 0

      ? duration

      : fallbackDuration;


  return Math.max(

    3,

    Math.ceil(
      baseDuration *
      validFactor
    )

  );

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

  source = 'osrm',

  routePricing = null

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


  const rideType =
    normalizeKekeRideType(
      kekeRideType
    );


  /*
   * -------------------------------------------------------
   * ROUTE-SPECIFIC FARE
   * -------------------------------------------------------
   */

  let fare;

  let pricingBasis;


  if (
    routePricing?.keke
  ) {

    if (
      routePricing.keke.enabled === false
    ) {

      const error =
        new Error(
          'Keke service is not available on this route'
        );

      error.statusCode =
        400;

      throw error;

    }


    if (
      rideType === 'private'
    ) {

      fare =
        Number(
          routePricing.keke.privateFare
        );

    } else {

      fare =
        Number(
          routePricing.keke.singleSeatFare
        );

    }


    if (
      !Number.isFinite(
        fare
      ) ||
      fare <= 0
    ) {

      fare =
        rideType === 'private'

          ? Number(
              price.privateFare
            )

          : Number(
              price.singleSeatFare
            );

    }


    pricingBasis =
      'route_fixed';

  }


  /*
   * -------------------------------------------------------
   * DEFAULT KEKE FARE
   * -------------------------------------------------------
   */

  else {

    fare =
      rideType === 'private'

        ? Number(
            price.privateFare
          )

        : Number(
            price.singleSeatFare
          );


    pricingBasis =
      'default_fixed';

  }


  if (
    !Number.isFinite(
      fare
    ) ||
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


  const estimatedMinutes =
    calculateEstimatedMinutes({

      distanceKm,

      durationMinutes,

      avgKph:
        price.avgKph,

      etaFactor:
        price.etaFactor

    });


  const distance =
    Number(
      distanceKm
    );


  return {

    distanceKm:

      Number.isFinite(
        distance
      )

        ? Number(
            distance.toFixed(1)
          )

        : 0,


    estimatedMinutes,


    fare:


      Math.round(
        fare
      ),


    currency:
      'NGN',


    pricingVersion:
      routePricing
        ? 'kaduna-route-v3'
        : 'kaduna-keke-v3',


    pricingBasis,


    vehicleType:
      'keke',


    kekeRideType:
      rideType,


    passengerCapacity:
      Number(
        routePricing?.keke?.capacity ||
        price.capacity ||
        4
      ),


    farePerPassenger:
      Number(
        routePricing?.keke?.singleSeatFare ||
        price.singleSeatFare
      ),


    singleSeatFare:
      Number(
        routePricing?.keke?.singleSeatFare ||
        price.singleSeatFare
      ),


    privateFare:
      Number(
        routePricing?.keke?.privateFare ||
        price.privateFare
      ),


    routingSource:
      normalizeRoutingSource(
        source
      )

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

  source = 'osrm',

  routePricing = null

}) {

  const price =
    PRICING[
      vehicleType
    ];


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


  if (
    !Number.isFinite(
      distance
    ) ||
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


  const estimatedMinutes =
    calculateEstimatedMinutes({

      distanceKm:

        distance,

      durationMinutes,

      avgKph:
        price.avgKph,

      etaFactor:
        price.etaFactor

    });


  /*
   * -------------------------------------------------------
   * ROUTE-SPECIFIC FIXED FARE
   * -------------------------------------------------------
   */

  if (
    routePricing?.[vehicleType]
  ) {

    const routeVehicle =
      routePricing[
        vehicleType
      ];


    if (
      routeVehicle.enabled === false
    ) {

      const error =
        new Error(
          `${vehicleType} service is not available on this route`
        );

      error.statusCode =
        400;

      throw error;

    }


    const routeFare =
      Number(
        routeVehicle.fare
      );


    if (
      Number.isFinite(
        routeFare
      ) &&
      routeFare > 0
    ) {

      return {

        distanceKm:
          Number(
            distance.toFixed(1)
          ),


        estimatedMinutes,


        fare:
          Math.round(
            routeFare
          ),


        currency:
          'NGN',


        pricingVersion:
          'kaduna-route-v3',


        pricingBasis:
          'route_fixed',


        vehicleType,


        routingSource:
          normalizeRoutingSource(
            source
          )

      };

    }

  }


  /*
   * -------------------------------------------------------
   * DEFAULT DISTANCE-BASED FARE
   * -------------------------------------------------------
   */

  const rawFare =
    Math.max(

      Number(
        price.minimum
      ),

      Number(
        price.base
      ) +

      distance *
      Number(
        price.perKm
      )

    );


  const fare =
    roundFare(
      rawFare
    );


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
      'kaduna-distance-v3',


    pricingBasis:
      'distance_based',


    vehicleType,


    routingSource:
      normalizeRoutingSource(
        source
      )

  };

}


/*
 * ---------------------------------------------------------
 * ROUTING SOURCE NORMALISATION
 * ---------------------------------------------------------
 *
 * Trip.js currently accepts:
 *
 *   osrm
 *   estimate
 *
 * Google is used for route discovery, but the Trip schema
 * does not currently accept "google".
 *
 * Therefore Google is mapped to the supported value
 * "estimate" for database compatibility.
 *
 * ---------------------------------------------------------
 */

function normalizeRoutingSource(
  source
) {

  const value =
    String(
      source || ''
    )
      .trim()
      .toLowerCase();


  if (
    value === 'osrm'
  ) {

    return 'osrm';

  }


  if (
    value === 'estimate'
  ) {

    return 'estimate';

  }


  /*
   * Google routing is authoritative for the current
   * route calculation, but Trip.routingSource currently
   * only permits osrm/estimate.
   *
   * Until the Trip schema is deliberately upgraded,
   * store it as estimate rather than causing validation
   * failure.
   */

  if (
    value === 'google' ||
    value === 'google_maps' ||
    value === 'googlemaps'
  ) {

    return 'estimate';

  }


  return 'estimate';

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

  source = 'osrm',

  pickupLabel = '',

  destinationLabel = '',

  pickupPlaceId = null,

  destinationPlaceId = null,

  routes = []

}) {

  const normalizedVehicleType =
    String(
      vehicleType || ''
    )
      .trim()
      .toLowerCase();


  if (
    ![
      'bike',
      'keke',
      'car',
      'suv'
    ].includes(
      normalizedVehicleType
    )
  ) {

    const error =
      new Error(
        'Unsupported vehicle type'
      );

    error.statusCode =
      400;

    throw error;

  }


  /*
   * -------------------------------------------------------
   * FIND ROUTE-SPECIFIC PRICING
   * -------------------------------------------------------
   */

  const routePricing =
    findRoutePricing({

      routes,

      pickupLabel,

      destinationLabel,

      pickupPlaceId,

      destinationPlaceId

    });


  /*
   * -------------------------------------------------------
   * KEKE
   * -------------------------------------------------------
   */

  if (
    normalizedVehicleType === 'keke'
  ) {

    return quoteKeke({

      distanceKm,

      durationMinutes,

      kekeRideType,

      source,

      routePricing

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

    source,

    routePricing

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

  normalizeLocationKey,

  findRoutePricing,

  normalizeRoutingSource,

  setPricingConfig

};