const PricingConfig =
  require('../models/PricingConfig');

const VEHICLES = [
  'bike',
  'keke',
  'car',
  'suv'
];


/*
=========================================================
UNCONFIGURED ADMIN PRICING
=========================================================
*/

function emptyConfig() {

  return {

    key:
      'kaduna-default',

    configured:
      false,

    bike:
      null,

    keke:
      null,

    car:
      null,

    suv:
      null,

    routes: [],

    version:
      null

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

  const config =
    await PricingConfig
      .findOne({
        key:
          'kaduna-default'
      })
      .lean();


  /*
   * Never create developer-defined monetary pricing.
   * Admin must save the initial pricing configuration.
   */

  if (!config) {

    return emptyConfig();

  }


  if (
    !Array.isArray(
      config.routes
    )
  ) {

    config.routes = [];

  }


  config.configured =
    true;


  return config;

}


/*
=========================================================
VALIDATION HELPERS
=========================================================
*/

function positiveNumber(
  value,
  label
) {

  const number =
    Number(value);


  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {

    const err =
      new Error(
        `${label} must be greater than 0`
      );

    err.statusCode =
      400;

    throw err;

  }


  return number;

}


function nonNegativeNumber(
  value,
  label
) {

  const number =
    Number(value);


  if (
    !Number.isFinite(number) ||
    number < 0
  ) {

    const err =
      new Error(
        `${label} must be 0 or greater`
      );

    err.statusCode =
      400;

    throw err;

  }


  return number;

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
    await PricingConfig
      .findOne({
        key:
          'kaduna-default'
      })
      .lean();


  const next = {};


  /*
   * Initial configuration must contain every vehicle.
   * Existing configuration may be partially updated.
   */

  for (
    const vehicle of VEHICLES
  ) {

    if (
      !current &&
      (
        !pricing[vehicle] ||
        typeof pricing[vehicle] !== 'object'
      )
    ) {

      const err =
        new Error(
          `Admin must configure ${vehicle} pricing`
        );

      err.statusCode =
        400;

      throw err;

    }

  }


  const currentKeke =
    current?.keke || {};

  const kekeInput =
    pricing.keke || {};


  next.keke = {

    ...currentKeke,

    ...kekeInput,

    capacity:
      positiveNumber(
        kekeInput.capacity ??
        currentKeke.capacity ??
        4,
        'Keke capacity'
      ),

    singleSeatFare:
      positiveNumber(
        kekeInput.singleSeatFare ??
        currentKeke.singleSeatFare,
        'Keke single-seat fare'
      ),

    privateFare:
      positiveNumber(
        kekeInput.privateFare ??
        currentKeke.privateFare,
        'Keke private fare'
      ),

    etaFactor:
      positiveNumber(
        kekeInput.etaFactor ??
        currentKeke.etaFactor ??
        1.12,
        'Keke ETA factor'
      ),

    avgKph:
      positiveNumber(
        kekeInput.avgKph ??
        currentKeke.avgKph ??
        22,
        'Keke average speed'
      )

  };


  for (
    const vehicle of [
      'bike',
      'car',
      'suv'
    ]
  ) {

    const currentVehicle =
      current?.[vehicle] || {};

    const input =
      pricing[vehicle] || {};


    next[vehicle] = {

      ...currentVehicle,

      ...input,

      base:
        nonNegativeNumber(
          input.base ??
          currentVehicle.base,
          `${vehicle} base fare`
        ),

      perKm:
        nonNegativeNumber(
          input.perKm ??
          currentVehicle.perKm,
          `${vehicle} per-km fare`
        ),

      minimum:
        positiveNumber(
          input.minimum ??
          currentVehicle.minimum,
          `${vehicle} minimum fare`
        ),

      etaFactor:
        positiveNumber(
          input.etaFactor ??
          currentVehicle.etaFactor ??
          1,
          `${vehicle} ETA factor`
        ),

      avgKph:
        positiveNumber(
          input.avgKph ??
          currentVehicle.avgKph,
          `${vehicle} average speed`
        )

    };

  }


  next.routes =
    Array.isArray(
      current?.routes
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


  if (
    config.configured === false
  ) {

    const err =
      new Error(
        'Configure global Admin pricing before adding route pricing'
      );

    err.statusCode =
      409;

    throw err;

  }


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


  if (
    config.configured === false
  ) {

    const err =
      new Error(
        'Configure global Admin pricing before updating route pricing'
      );

    err.statusCode =
      409;

    throw err;

  }


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
