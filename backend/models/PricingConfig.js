const mongoose = require('mongoose');


/*
=========================================================
DISTANCE VEHICLE DEFAULT PRICING
=========================================================
*/

const distanceVehicleSchema =
  new mongoose.Schema({

    base: {
      type: Number,
      required: true,
      min: 0
    },

    perKm: {
      type: Number,
      required: true,
      min: 0
    },

    minimum: {
      type: Number,
      required: true,
      min: 0
    },

    etaFactor: {
      type: Number,
      required: true,
      min: 0.1
    },

    avgKph: {
      type: Number,
      required: true,
      min: 1
    }

  }, {
    _id: false
  });


/*
=========================================================
KEKE DEFAULT PRICING
=========================================================
*/

const kekeSchema =
  new mongoose.Schema({

    capacity: {
      type: Number,
      required: true,
      min: 1,
      default: 4
    },

    singleSeatFare: {
      type: Number,
      required: true,
      min: 1,
      default: 500
    },

    privateFare: {
      type: Number,
      required: true,
      min: 1,
      default: 2000
    },

    etaFactor: {
      type: Number,
      required: true,
      min: 0.1,
      default: 1.12
    },

    avgKph: {
      type: Number,
      required: true,
      min: 1,
      default: 22
    }

  }, {
    _id: false
  });


/*
=========================================================
ROUTE VEHICLE PRICING
=========================================================
*/

const routeVehicleSchema =
  new mongoose.Schema({

    /*
     * Whether this vehicle can use
     * this configured route fare.
     */

    enabled: {
      type: Boolean,
      default: true
    },


    /*
     * Distance-based vehicle fare.
     *
     * Used for:
     * bike
     * car
     * suv
     */

    fare: {
      type: Number,
      min: 0,
      default: 0
    },


    /*
     * Keke single-seat fare.
     */

    singleSeatFare: {
      type: Number,
      min: 0,
      default: 500
    },


    /*
     * Keke private fare.
     */

    privateFare: {
      type: Number,
      min: 0,
      default: 2000
    }

  }, {
    _id: false
  });


/*
=========================================================
ROUTE PRICING
=========================================================
*/

const routePricingSchema =
  new mongoose.Schema({

    /*
     * Human-readable pickup location.
     */

    pickupLabel: {
      type: String,
      required: true,
      trim: true
    },


    /*
     * Human-readable destination.
     */

    destinationLabel: {
      type: String,
      required: true,
      trim: true
    },


    /*
     * Normalized comparison labels.
     *
     * Used to find the configured route
     * regardless of capitalization.
     */

    pickupKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },

    destinationKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },


    /*
     * Optional Google place IDs.
     *
     * These are preferred over text when available.
     */

    pickupPlaceId: {
      type: String,
      default: null
    },

    destinationPlaceId: {
      type: String,
      default: null
    },


    /*
     * Vehicle-specific route pricing.
     */

    bike: {
      type: routeVehicleSchema,
      default: () => ({})
    },

    keke: {
      type: routeVehicleSchema,
      default: () => ({})
    },

    car: {
      type: routeVehicleSchema,
      default: () => ({})
    },

    suv: {
      type: routeVehicleSchema,
      default: () => ({})
    },


    /*
     * Disable a route without deleting it.
     */

    active: {
      type: Boolean,
      default: true,
      index: true
    }

  }, {
    _id: true,
    timestamps: true
  });


/*
=========================================================
MAIN PRICING CONFIGURATION
=========================================================
*/

const schema =
  new mongoose.Schema({

    key: {
      type: String,
      unique: true,
      required: true,
      default: 'kaduna-default'
    },


    /*
     * Global/default pricing.
     */

    bike: {
      type: distanceVehicleSchema,
      required: true
    },

    keke: {
      type: kekeSchema,
      required: true
    },

    car: {
      type: distanceVehicleSchema,
      required: true
    },

    suv: {
      type: distanceVehicleSchema,
      required: true
    },


    /*
     * Admin-configured route fares.
     */

    routes: {
      type: [routePricingSchema],
      default: []
    },


    version: {
      type: String,
      default: 'kaduna-v3'
    }

  }, {
    timestamps: true
  });


module.exports =
  mongoose.model(
    'PricingConfig',
    schema
  );