/*
 * =========================================================
 * KADUNA ONLY MAPS SERVICE
 * =========================================================
 *
 * PROVIDERS
 *
 * SEARCH:
 *   Google Places API (New)
 *
 * ROUTING:
 *   Google Routes API
 *
 * IMPORTANT:
 *   The Google API key stays on the backend.
 *
 * MOBILE CONTRACT REMAINS:
 *
 *   searchKaduna(query)
 *   getRoute(pickup, destination)
 *   validatePoint(point, name)
 *
 * No mobile UI changes are required.
 *
 * =========================================================
 */

const GOOGLE_MAPS_API_KEY =
  String(
    process.env.GOOGLE_MAPS_API_KEY || ''
  ).trim();


const GOOGLE_PLACES_URL =
  'https://places.googleapis.com/v1/places:searchText';


const GOOGLE_ROUTES_URL =
  'https://routes.googleapis.com/directions/v2:computeRoutes';


/*
 * ---------------------------------------------------------
 * KADUNA SEARCH AREA
 * ---------------------------------------------------------
 *
 * Approximate Kaduna metropolitan bounding area.
 *
 * These values are used as a search restriction so that
 * ordinary searches remain focused on Kaduna.
 *
 * ---------------------------------------------------------
 */

const KADUNA_BOUNDS = {
  low: {
    latitude: 10.35,
    longitude: 7.30
  },

  high: {
    latitude: 10.68,
    longitude: 7.58
  }
};


/*
 * ---------------------------------------------------------
 * IN-MEMORY CACHES
 * ---------------------------------------------------------
 */

const searchCache =
  new Map();


const routeCache =
  new Map();


/*
 * ---------------------------------------------------------
 * IN-FLIGHT REQUESTS
 * ---------------------------------------------------------
 */

const searchInflight =
  new Map();


const routeInflight =
  new Map();


/*
 * ---------------------------------------------------------
 * CACHE TTL
 * ---------------------------------------------------------
 */

const SEARCH_CACHE_TTL =
  Math.max(
    5 * 60 * 1000,
    Number(
      process.env.MAPS_SEARCH_CACHE_TTL_MS ||
      30 * 60 * 1000
    )
  );


const ROUTE_CACHE_TTL =
  Math.max(
    5 * 60 * 1000,
    Number(
      process.env.MAPS_ROUTE_CACHE_TTL_MS ||
      10 * 60 * 1000
    )
  );


/*
 * ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------
 */

function numberOrNull(value) {

  const x =
    Number(value);


  return Number.isFinite(x)
    ? x
    : null;

}


function normalizeQuery(value) {

  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

}


function cacheSet(
  cache,
  key,
  value,
  ttl
) {

  cache.set(
    key,
    value
  );


  const timer =
    setTimeout(
      () => {
        cache.delete(key);
      },
      ttl
    );


  if (
    typeof timer.unref ===
    'function'
  ) {

    timer.unref();

  }

}


function validatePoint(
  point,
  name = 'Location'
) {

  const lat =
    numberOrNull(
      point?.lat
    );


  const lng =
    numberOrNull(
      point?.lng
    );


  if (
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {

    const error =
      new Error(
        `${name} requires valid coordinates`
      );


    error.statusCode =
      400;


    throw error;

  }


  return {

    label:
      String(
        point?.label ||
        name
      ).trim() ||
      name,

    lat,

    lng

  };

}


/*
 * ---------------------------------------------------------
 * GOOGLE API KEY CHECK
 * ---------------------------------------------------------
 */

function requireGoogleKey() {

  if (
    !GOOGLE_MAPS_API_KEY
  ) {

    const error =
      new Error(
        'Google Maps API key is not configured on the backend'
      );


    error.statusCode =
      500;


    throw error;

  }

}


/*
 * ---------------------------------------------------------
 * GOOGLE ERROR HANDLER
 * ---------------------------------------------------------
 */

async function readGoogleError(
  response,
  fallback
) {

  let body =
    null;


  try {

    body =
      await response.json();

  } catch {

    body =
      null;

  }


  const message =
    body?.error?.message ||
    body?.message ||
    fallback;


  const error =
    new Error(
      message
    );


  /*
   * Convert Google API failures into useful HTTP
   * responses for the Kaduna Only mobile client.
   */

  if (
    response.status === 400
  ) {

    error.statusCode =
      400;

  } else if (
    response.status === 401 ||
    response.status === 403
  ) {

    error.statusCode =
      502;

  } else if (
    response.status === 429
  ) {

    error.statusCode =
      429;

  } else if (
    response.status >= 500
  ) {

    error.statusCode =
      502;

  } else {

    error.statusCode =
      502;

  }


  error.googleStatus =
    response.status;


  error.googleResponse =
    body;


  return error;

}


/*
 * ---------------------------------------------------------
 * SEARCH KADUNA
 * ---------------------------------------------------------
 *
 * Uses:
 *
 *   Google Places API (New)
 *   Text Search
 *
 * Existing mobile response shape is preserved:
 *
 * {
 *   placeId,
 *   label,
 *   shortLabel,
 *   lat,
 *   lng,
 *   type
 * }
 *
 * ---------------------------------------------------------
 */

async function searchKaduna(
  query
) {

  requireGoogleKey();


  const q =
    String(query || '')
      .trim()
      .replace(/\s+/g, ' ');


  if (
    q.length < 3
  ) {

    const error =
      new Error(
        'Enter at least 3 characters to search'
      );


    error.statusCode =
      400;


    throw error;

  }


  const key =
    normalizeQuery(q);


  /*
   * Cached result.
   */

  if (
    searchCache.has(key)
  ) {

    return searchCache.get(
      key
    );

  }


  /*
   * Prevent duplicate simultaneous requests.
   */

  if (
    searchInflight.has(key)
  ) {

    return searchInflight.get(
      key
    );

  }


  const promise =
    (async () => {

      try {

        const response =
          await fetch(
            GOOGLE_PLACES_URL,
            {

              method:
                'POST',

              headers: {

                'Content-Type':
                  'application/json',

                'X-Goog-Api-Key':
                  GOOGLE_MAPS_API_KEY,

                'X-Goog-FieldMask':
                  [
                    'places.id',
                    'places.displayName',
                    'places.formattedAddress',
                    'places.location',
                    'places.types'
                  ].join(',')

              },

              body:
                JSON.stringify({

                  textQuery:
                    `${q}, Kaduna, Nigeria`,

                  pageSize:
                    6,

                  languageCode:
                    'en',

                  regionCode:
                    'NG',

                  locationBias: {

                    rectangle: {

                      low:
                        KADUNA_BOUNDS.low,

                      high:
                        KADUNA_BOUNDS.high

                    }

                  }

                }),

              signal:
                AbortSignal.timeout(
                  15000
                )

            }

          );


        if (
          !response.ok
        ) {

          throw await readGoogleError(
            response,
            `Google Places search failed (${response.status})`
          );

        }


        let data;


        try {

          data =
            await response.json();

        } catch {

          const error =
            new Error(
              'Google Places returned an invalid response'
            );


          error.statusCode =
            502;


          throw error;

        }


        const places =
          Array.isArray(
            data?.places
          )
            ? data.places
            : [];


        const output =
          places

            .map(
              place => {

                const latitude =
                  numberOrNull(
                    place?.location
                      ?.latitude
                  );


                const longitude =
                  numberOrNull(
                    place?.location
                      ?.longitude
                  );


                if (
                  latitude === null ||
                  longitude === null
                ) {

                  return null;

                }


                const displayName =
                  String(
                    place?.displayName
                      ?.text ||
                    ''
                  ).trim();


                const address =
                  String(
                    place?.formattedAddress ||
                    displayName ||
                    ''
                  ).trim();


                const types =
                  Array.isArray(
                    place?.types
                  )
                    ? place.types
                    : [];


                return {

                  placeId:
                    String(
                      place?.id ||
                      `${latitude},${longitude}`
                    ),

                  label:
                    address ||
                    displayName,

                  shortLabel:
                    displayName ||
                    address.split(',')[0],

                  lat:
                    latitude,

                  lng:
                    longitude,

                  type:
                    types[0] ||
                    'place'

                };

              }
            )

            .filter(Boolean);


        cacheSet(
          searchCache,
          key,
          output,
          SEARCH_CACHE_TTL
        );


        return output;

      } catch (
        error
      ) {

        if (
          error?.name ===
          'AbortError'
        ) {

          const timeoutError =
            new Error(
              'Location search timed out. Please try again.'
            );


          timeoutError.statusCode =
            504;


          throw timeoutError;

        }


        if (
          error?.statusCode
        ) {

          throw error;

        }


        const networkError =
          new Error(
            'Google location search is temporarily unavailable'
          );


        networkError.statusCode =
          502;


        networkError.cause =
          error;


        throw networkError;

      } finally {

        searchInflight.delete(
          key
        );

      }

    })();


  searchInflight.set(
    key,
    promise
  );


  return promise;

}


/*
 * ---------------------------------------------------------
 * ROUTE CACHE KEY
 * ---------------------------------------------------------
 */

function routeKey(
  pickup,
  destination
) {

  return [

    pickup.lat.toFixed(5),

    pickup.lng.toFixed(5),

    destination.lat.toFixed(5),

    destination.lng.toFixed(5)

  ].join(':');

}


/*
 * ---------------------------------------------------------
 * GET ROUTE
 * ---------------------------------------------------------
 *
 * Uses Google Routes API.
 *
 * Returns:
 *
 *   distanceKm
 *   durationMinutes
 *   geometry
 *   source
 *
 * Geometry is requested directly as GeoJSON so that the
 * existing map UI can continue consuming route geometry.
 *
 * ---------------------------------------------------------
 */

async function getRoute(
  pickup,
  destination
) {

  requireGoogleKey();


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


  const key =
    routeKey(
      a,
      b
    );


  /*
   * Cached route.
   */

  if (
    routeCache.has(key)
  ) {

    return routeCache.get(
      key
    );

  }


  /*
   * Prevent duplicate simultaneous route requests.
   */

  if (
    routeInflight.has(key)
  ) {

    return routeInflight.get(
      key
    );

  }


  const promise =
    (async () => {

      try {

        const response =
          await fetch(
            GOOGLE_ROUTES_URL,
            {

              method:
                'POST',

              headers: {

                'Content-Type':
                  'application/json',

                'X-Goog-Api-Key':
                  GOOGLE_MAPS_API_KEY,

                'X-Goog-FieldMask':
                  [
                    'routes.distanceMeters',
                    'routes.duration',
                    'routes.polyline.geoJsonLinestring'
                  ].join(',')

              },

              body:
                JSON.stringify({

                  origin: {

                    location: {

                      latLng: {

                        latitude:
                          a.lat,

                        longitude:
                          a.lng

                      }

                    }

                  },

                  destination: {

                    location: {

                      latLng: {

                        latitude:
                          b.lat,

                        longitude:
                          b.lng

                      }

                    }

                  },

                  travelMode:
                    'DRIVE',

                  routingPreference:
                    'TRAFFIC_AWARE',

                  polylineQuality:
                    'OVERVIEW',

                  polylineEncoding:
                    'GEO_JSON_LINESTRING',

                  computeAlternativeRoutes:
                    false,

                  units:
                    'METRIC'

                }),

              signal:
                AbortSignal.timeout(
                  15000
                )

            }

          );


        if (
          !response.ok
        ) {

          throw await readGoogleError(
            response,
            `Google Routes failed (${response.status})`
          );

        }


        let data;


        try {

          data =
            await response.json();

        } catch {

          const error =
            new Error(
              'Google Routes returned an invalid response'
            );


          error.statusCode =
            502;


          throw error;

        }


        const route =
          data?.routes?.[0];


        if (
          !route
        ) {

          const error =
            new Error(
              'No drivable route was found between these locations'
            );


          error.statusCode =
            400;


          throw error;

        }


        /*
         * Google duration is returned as a protobuf
         * Duration string such as:
         *
         *   "123s"
         */

        const durationSeconds =
          parseDurationSeconds(
            route.duration
          );


        const distanceMeters =
          Number(
            route.distanceMeters
          );


        if (
          !Number.isFinite(
            distanceMeters
          ) ||
          distanceMeters < 0
        ) {

          const error =
            new Error(
              'Google Routes returned an invalid distance'
            );


          error.statusCode =
            502;


          throw error;

        }


        const output = {

          distanceKm:
            Number(
              (
                distanceMeters /
                1000
              ).toFixed(1)
            ),

          durationMinutes:
            Math.max(
              1,
              Math.ceil(
                durationSeconds /
                60
              )
            ),

          geometry:
            route?.polyline
              ?.geoJsonLinestring ||
            null,

          source:
            'google'

        };


        cacheSet(
          routeCache,
          key,
          output,
          ROUTE_CACHE_TTL
        );


        return output;

      } catch (
        error
      ) {

        if (
          error?.name ===
          'AbortError'
        ) {

          const timeoutError =
            new Error(
              'Routing service timed out. Please try again.'
            );


          timeoutError.statusCode =
            504;


          throw timeoutError;

        }


        if (
          error?.statusCode
        ) {

          throw error;

        }


        const networkError =
          new Error(
            'Google routing service is temporarily unavailable'
          );


        networkError.statusCode =
          502;


        networkError.cause =
          error;


        throw networkError;

      } finally {

        routeInflight.delete(
          key
        );

      }

    })();


  routeInflight.set(
    key,
    promise
  );


  return promise;

}


/*
 * ---------------------------------------------------------
 * GOOGLE DURATION PARSER
 * ---------------------------------------------------------
 */

function parseDurationSeconds(
  duration
) {

  if (
    typeof duration ===
    'number'
  ) {

    return Number.isFinite(
      duration
    )
      ? duration
      : 0;

  }


  const text =
    String(
      duration || ''
    ).trim();


  if (!text) {

    return 0;

  }


  const match =
    text.match(
      /^(-?\d+(?:\.\d+)?)s$/
    );


  if (
    !match
  ) {

    return 0;

  }


  const seconds =
    Number(
      match[1]
    );


  return Number.isFinite(
    seconds
  )
    ? Math.max(
        0,
        seconds
      )
    : 0;

}


/*
 * ---------------------------------------------------------
 * EXPORTS
 * ---------------------------------------------------------
 */

module.exports = {

  searchKaduna,

  getRoute,

  validatePoint

};