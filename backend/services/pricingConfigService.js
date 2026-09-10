const PricingConfig =
  require('../models/PricingConfig');

const {
  PRICING
} =
  require('../utils/pricing');


const VEHICLES = [
  'bike',
  'keke',
  'car',
  'suv'
];


/*
=========================================================
DEFAULTS
=========================================================
*/

function defaults() {

  return {

    bike: {
      ...PRICING.bike
    },

    keke: {
      ...PRICING.keke
    },

    car: {
      ...PRICING.car
    },

    suv: {
      ...PRICING.suv
    },

    routes: []

  };

}


/*
=========================================================
NORMALISE ROUTE KEY
=========================================================
*/

function normalizeLocationKey(
  value
) {

  return String(
    value || ''
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

}


/*
=========================================================
GET CONFIGURATION
=========================================================
*/

async function getPricingConfig() {

  let config =
    await PricingConfig
      .findOne({
        key:
          'kaduna-default'
      })
      .lean();


  if (!config) {

    config =
      await PricingConfig.create({

        key:
          'kaduna-default',

        ...defaults(),

        version:
          'kaduna-v3'

      });


    return config.toObject();

  }


  /*
   * Older database records may not have routes.
   */

  if (
    !Array.isArray(
      config.routes
    )
  ) {

    config.routes = [];

  }


  return config;

}


/*
=========================================================
UPDATE GLOBAL PRICING
=========================================================
*/

async function updatePricingConfig({
  pricing
}) {

  if (
    !pricing ||
    typeof pricing !== 'object'
  ) {

    const err =
      new Error(
        'Pricing configuration is required'
      );

    err.statusCode =
      400;

    throw err;

  }


  const current =
    await getPricingConfig();


  const next = {};


  for (
    const vehicle of VEHICLES
  ) {

    const input =
      pricing[vehicle] ||
      current[vehicle];


    if (
      vehicle === 'keke'
    ) {

      next.keke = {

        ...current.keke,

        ...input,

        capacity:
          Number(
            input.capacity ??
            current.keke.capacity ??
            4
          ),

        singleSeatFare:
          Number(
            input.singleSeatFare ??
            current.keke.singleSeatFare ??
            500
          ),

        privateFare:
          Number(
            input.privateFare ??
            current.keke.privateFare ??
            2000
          ),

        etaFactor:
          Number(
            input.etaFactor ??
            current.keke.etaFactor ??
            1.12
          ),

        avgKph:
          Number(
            input.avgKph ??
            current.keke.avgKph ??
            22
          )

      };

    } else {

      next[vehicle] = {

        ...current[vehicle],

        ...input,

        base:
          Number(
            input.base
          ),

        perKm:
          Number(
            input.perKm
          ),

        minimum:
          Number(
            input.minimum
          ),

        etaFactor:
          Number(
            input.etaFactor ??
            current[vehicle].etaFactor ??
            1
          ),

        avgKph:
          Number(
            input.avgKph
          )

      };

    }

  }


  next.routes =
    Array.isArray(
      current.routes
    )
      ? current.routes
      : [];


  const updated =
    await PricingConfig
      .findOneAndUpdate(

        {
          key:
            'kaduna-default'
        },

        {
          $set: {

            ...next,

            version:
              `kaduna-v3-${Date.now()}`

          }

        },

        {
          new: true,

          upsert: true,

          runValidators: true

        }

      )
      .lean();


  /*
   * Synchronise in-memory pricing.
   */

  Object.assign(
    PRICING.bike,
    updated.bike
  );

  Object.assign(
    PRICING.keke,
    updated.keke
  );

  Object.assign(
    PRICING.car,
    updated.car
  );

  Object.assign(
    PRICING.suv,
    updated.suv
  );


  return updated;

}


/*
=========================================================
ADD ROUTE PRICING
=========================================================
*/

async function addRoutePricing({
  pickupLabel,
  destinationLabel,
  pickupPlaceId = null,
  destinationPlaceId = null,
  pricing = {},
  active = true
}) {

  if (
    !pickupLabel ||
    !destinationLabel
  ) {

    const err =
      new Error(
        'Pickup and destination are required'
      );

    err.statusCode =
      400;

    throw err;

  }


  const pickupKey =
    normalizeLocationKey(
      pickupLabel
    );


  const destinationKey =
    normalizeLocationKey(
      destinationLabel
    );


  const config =
    await getPricingConfig();


  /*
   * Prevent duplicate route definitions.
   */

  const duplicate =
    config.routes?.find(
      route =>

        route.pickupKey ===
          pickupKey &&

        route.destinationKey ===
          destinationKey

    );


  if (duplicate) {

    const err =
      new Error(
        'A pricing rule already exists for this route'
      );

    err.statusCode =
      409;

    throw err;

  }


  const route = {

    pickupLabel:
      String(
        pickupLabel
      ).trim(),

    destinationLabel:
      String(
        destinationLabel
      ).trim(),

    pickupKey,

    destinationKey,

    pickupPlaceId,

    destinationPlaceId,

    active:

      active !== false,

    bike: {
      ...pricing.bike
    },

    keke: {
      ...pricing.keke
    },

    car: {
      ...pricing.car
    },

    suv: {
      ...pricing.suv
    }

  };


  const updated =
    await PricingConfig
      .findOneAndUpdate(

        {
          key:
            'kaduna-default'
        },

        {
          $push: {
            routes:
              route
          },

          $set: {

            version:
              `kaduna-v3-${Date.now()}`

          }

        },

        {
          new: true,

          runValidators: true

        }

      )
      .lean();


  return updated;

}


/*
=========================================================
UPDATE ROUTE PRICING
=========================================================
*/

async function updateRoutePricing({
  routeId,
  pickupLabel,
  destinationLabel,
  pickupPlaceId,
  destinationPlaceId,
  pricing,
  active
}) {

  const config =
    await getPricingConfig();


  const route =
    config.routes?.find(
      r =>
        String(r._id) ===
        String(routeId)
    );


  if (!route) {

    const err =
      new Error(
        'Pricing route not found'
      );

    err.statusCode =
      404;

    throw err;

  }


  const set = {};


  if (
    pickupLabel !== undefined
  ) {

    set['routes.$.pickupLabel'] =
      String(
        pickupLabel
      ).trim();

    set['routes.$.pickupKey'] =
      normalizeLocationKey(
        pickupLabel
      );

  }


  if (
    destinationLabel !== undefined
  ) {

    set['routes.$.destinationLabel'] =
      String(
        destinationLabel
      ).trim();

    set['routes.$.destinationKey'] =
      normalizeLocationKey(
        destinationLabel
      );

  }


  if (
    pickupPlaceId !== undefined
  ) {

    set['routes.$.pickupPlaceId'] =
      pickupPlaceId;

  }


  if (
    destinationPlaceId !== undefined
  ) {

    set['routes.$.destinationPlaceId'] =
      destinationPlaceId;

  }


  if (
    active !== undefined
  ) {

    set['routes.$.active'] =
      Boolean(
        active
      );

  }


  for (
    const vehicle of VEHICLES
  ) {

    if (
      pricing?.[vehicle]
    ) {

      for (
        const key of [
          'enabled',
          'fare',
          'singleSeatFare',
          'privateFare'
        ]
      ) {

        if (
          pricing[
            vehicle
          ][key] !== undefined
        ) {

          set[
            `routes.$.${vehicle}.${key}`
          ] =
            pricing[
              vehicle
            ][key];

        }

      }

    }

  }


  set.version =
    `kaduna-v3-${Date.now()}`;


  const updated =
    await PricingConfig
      .findOneAndUpdate(

        {
          key:
            'kaduna-default',

          'routes._id':
            routeId

        },

        {
          $set:
            set

        },

        {
          new: true,

          runValidators: true

        }

      )
      .lean();


  return updated;

}


/*
=========================================================
REMOVE ROUTE PRICING
=========================================================
*/

async function removeRoutePricing(
  routeId
) {

  const updated =
    await PricingConfig
      .findOneAndUpdate(

        {
          key:
            'kaduna-default'
        },

        {
          $pull: {
            routes: {
              _id:
                routeId
            }
          },

          $set: {

            version:
              `kaduna-v3-${Date.now()}`

          }

        },

        {
          new: true

        }

      )
      .lean();


  return updated;

}


module.exports = {

  getPricingConfig,

  updatePricingConfig,

  addRoutePricing,

  updateRoutePricing,

  removeRoutePricing,

  normalizeLocationKey

};