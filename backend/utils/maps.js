const NOMINATIM_URL =
  process.env.NOMINATIM_URL ||
  'https://nominatim.openstreetmap.org';

const OSRM_URL =
  process.env.OSRM_URL ||
  'https://router.project-osrm.org';

const USER_AGENT =
  process.env.MAPS_USER_AGENT ||
  'KadunaOnly/1.0 (https://kaduna-only.onrender.com; contact: support@kaduna-only.com)';

/*
 * ---------------------------------------------------------
 * IN-MEMORY CACHES
 * ---------------------------------------------------------
 */

const searchCache = new Map();
const routeCache = new Map();

/*
 * Prevent multiple identical requests from being sent
 * to Nominatim at the same time.
 */

const searchInflight = new Map();
const routeInflight = new Map();

/*
 * ---------------------------------------------------------
 * NOMINATIM RATE LIMIT QUEUE
 * ---------------------------------------------------------
 */

let lastNominatimAt = 0;

let nominatimQueue = Promise.resolve();

const NOMINATIM_MIN_GAP =
  Math.max(
    1000,
    Number(process.env.NOMINATIM_MIN_GAP_MS || 1200)
  );

const SEARCH_CACHE_TTL =
  Math.max(
    5 * 60 * 1000,
    Number(process.env.MAPS_SEARCH_CACHE_TTL_MS || 30 * 60 * 1000)
  );

const ROUTE_CACHE_TTL =
  Math.max(
    5 * 60 * 1000,
    Number(process.env.MAPS_ROUTE_CACHE_TTL_MS || 10 * 60 * 1000)
  );

const MAX_429_RETRIES = 3;

const wait = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

/*
 * ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------
 */

function numberOrNull(value) {
  const x = Number(value);

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

function cacheSet(cache, key, value, ttl) {
  cache.set(key, value);

  const timer = setTimeout(() => {
    cache.delete(key);
  }, ttl);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

function validatePoint(point, name = 'Location') {
  const lat = numberOrNull(point?.lat);
  const lng = numberOrNull(point?.lng);

  if (
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    const error = new Error(
      `${name} requires valid coordinates`
    );

    error.statusCode = 400;

    throw error;
  }

  return {
    label:
      String(point?.label || name).trim() ||
      name,

    lat,
    lng
  };
}

/*
 * ---------------------------------------------------------
 * RETRY-AFTER
 * ---------------------------------------------------------
 */

function getRetryAfterMs(response, attempt) {
  const header =
    response.headers.get('retry-after');

  if (header) {
    const seconds = Number(header);

    if (
      Number.isFinite(seconds) &&
      seconds >= 0
    ) {
      return Math.min(
        Math.max(seconds * 1000, 1200),
        15000
      );
    }

    const retryDate =
      Date.parse(header);

    if (Number.isFinite(retryDate)) {
      const delay =
        retryDate - Date.now();

      if (delay > 0) {
        return Math.min(delay, 15000);
      }
    }
  }

  /*
   * Exponential backoff with a small amount
   * of jitter.
   */

  const base =
    Math.min(
      15000,
      1500 * Math.pow(2, attempt)
    );

  const jitter =
    Math.floor(Math.random() * 500);

  return base + jitter;
}

/*
 * ---------------------------------------------------------
 * RAW NOMINATIM REQUEST
 * ---------------------------------------------------------
 */

async function nominatimRequest(url) {
  for (
    let attempt = 0;
    attempt <= MAX_429_RETRIES;
    attempt++
  ) {
    /*
     * Global queue spacing.
     */

    const gap =
      NOMINATIM_MIN_GAP -
      (Date.now() - lastNominatimAt);

    if (gap > 0) {
      await wait(gap);
    }

    lastNominatimAt = Date.now();

    let response;

    try {
      response = await fetch(url, {
        method: 'GET',

        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
          'Accept-Language': 'en'
        },

        signal: AbortSignal.timeout(10000)
      });
    } catch (error) {
      /*
       * Network timeout / connection error.
       */

      if (attempt < MAX_429_RETRIES) {
        await wait(
          Math.min(
            8000,
            1000 * Math.pow(2, attempt)
          )
        );

        continue;
      }

      const e = new Error(
        'Location search service is temporarily unavailable'
      );

      e.statusCode = 502;
      e.cause = error;

      throw e;
    }

    /*
     * Rate limited.
     */

    if (response.status === 429) {
      if (attempt < MAX_429_RETRIES) {
        const delay =
          getRetryAfterMs(
            response,
            attempt
          );

        console.warn(
          `[MAPS] Nominatim rate limited. Retry ${attempt + 1}/${MAX_429_RETRIES} in ${delay}ms`
        );

        await wait(delay);

        continue;
      }

      const error = new Error(
        'Location search is temporarily busy. Please try again in a few seconds.'
      );

      error.statusCode = 429;

      throw error;
    }

    if (!response.ok) {
      const error =
        new Error(
          `Location search unavailable (${response.status})`
        );

      error.statusCode = 502;

      throw error;
    }

    try {
      return await response.json();
    } catch {
      const error =
        new Error(
          'Location search returned an invalid response'
        );

      error.statusCode = 502;

      throw error;
    }
  }

  const error =
    new Error(
      'Location search unavailable'
    );

  error.statusCode = 502;

  throw error;
}

/*
 * ---------------------------------------------------------
 * QUEUED NOMINATIM REQUEST
 * ---------------------------------------------------------
 */

async function nominatimFetch(url) {
  /*
   * Every request enters the same promise queue.
   */

  const task = async () => {
    return nominatimRequest(url);
  };

  const result =
    nominatimQueue.then(
      task,
      task
    );

  /*
   * Keep queue alive even if a request fails.
   */

  nominatimQueue =
    result.catch(() => undefined);

  return result;
}

/*
 * ---------------------------------------------------------
 * SEARCH KADUNA
 * ---------------------------------------------------------
 */

async function searchKaduna(query) {
  const q =
    String(query || '')
      .trim()
      .replace(/\s+/g, ' ');

  if (q.length < 3) {
    const error =
      new Error(
        'Enter at least 3 characters to search'
      );

    error.statusCode = 400;

    throw error;
  }

  const key =
    normalizeQuery(q);

  /*
   * 1. Return cached result.
   */

  if (searchCache.has(key)) {
    return searchCache.get(key);
  }

  /*
   * 2. If the same request is already running,
   * return the existing promise instead of sending
   * another request to Nominatim.
   */

  if (searchInflight.has(key)) {
    return searchInflight.get(key);
  }

  const promise =
    (async () => {
      try {
        const params =
          new URLSearchParams({
            q:
              `${q}, Kaduna, Nigeria`,

            format:
              'jsonv2',

            limit:
              '6',

            countrycodes:
              'ng',

            addressdetails:
              '1',

            'accept-language':
              'en',

            viewbox:
              '7.30,10.68,7.58,10.35',

            bounded:
              '1'
          });

        const data =
          await nominatimFetch(
            `${NOMINATIM_URL}/search?${params.toString()}`
          );

        const output =
          (Array.isArray(data)
            ? data
            : []
          )
            .map(item => ({
              placeId:
                String(
                  item.place_id
                ),

              label:
                item.display_name,

              shortLabel:
                item.name ||
                String(
                  item.display_name ||
                  ''
                ).split(',')[0],

              lat:
                Number(item.lat),

              lng:
                Number(item.lon),

              type:
                item.type ||
                item.addresstype ||
                'place'
            }))
            .filter(
              item =>
                Number.isFinite(
                  item.lat
                ) &&
                Number.isFinite(
                  item.lng
                )
            );

        cacheSet(
          searchCache,
          key,
          output,
          SEARCH_CACHE_TTL
        );

        return output;
      } finally {
        searchInflight.delete(key);
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
 */

async function getRoute(
  pickup,
  destination
) {
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
    routeKey(a, b);

  /*
   * Return cached route.
   */

  if (routeCache.has(key)) {
    return routeCache.get(key);
  }

  /*
   * Prevent duplicate OSRM requests.
   */

  if (routeInflight.has(key)) {
    return routeInflight.get(key);
  }

  const promise =
    (async () => {
      try {
        const url =
          `${OSRM_URL}/route/v1/driving/` +
          `${a.lng},${a.lat};` +
          `${b.lng},${b.lat}` +
          `?overview=full` +
          `&geometries=geojson` +
          `&steps=false`;

        let response;

        try {
          response =
            await fetch(
              url,
              {
                method: 'GET',

                headers: {
                  'User-Agent':
                    USER_AGENT,

                  'Accept':
                    'application/json'
                },

                signal:
                  AbortSignal.timeout(
                    15000
                  )
              }
            );
        } catch (error) {
          const e =
            new Error(
              'Routing service is temporarily unavailable'
            );

          e.statusCode = 502;
          e.cause = error;

          throw e;
        }

        if (!response.ok) {
          const error =
            new Error(
              `Routing service unavailable (${response.status})`
            );

          error.statusCode = 502;

          throw error;
        }

        let data;

        try {
          data =
            await response.json();
        } catch {
          const error =
            new Error(
              'Routing service returned an invalid response'
            );

          error.statusCode = 502;

          throw error;
        }

        const route =
          data?.routes?.[0];

        if (
          data?.code !== 'Ok' ||
          !route
        ) {
          const error =
            new Error(
              data?.message ||
              'No drivable route was found between these locations'
            );

          error.statusCode = 400;

          throw error;
        }

        const output = {
          distanceKm:
            Number(
              (
                route.distance /
                1000
              ).toFixed(1)
            ),

          durationMinutes:
            Math.max(
              1,
              Math.ceil(
                route.duration /
                60
              )
            ),

          geometry:
            route.geometry,

          source:
            'osrm'
        };

        cacheSet(
          routeCache,
          key,
          output,
          ROUTE_CACHE_TTL
        );

        return output;
      } finally {
        routeInflight.delete(key);
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
 * EXPORTS
 * ---------------------------------------------------------
 */

module.exports = {
  searchKaduna,
  getRoute,
  validatePoint
};