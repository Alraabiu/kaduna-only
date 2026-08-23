const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
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
  },
  {
    _id: false
  }
);

const schema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      required: true,
      default: 'kaduna-default'
    },

    bike: {
      type: vehicleSchema,
      required: true
    },

    keke: {
      type: vehicleSchema,
      required: true
    },

    car: {
      type: vehicleSchema,
      required: true
    },

    suv: {
      type: vehicleSchema,
      required: true
    },

    platformCommission: {
      type: Number,
      required: true,
      min: 0,
      default: 50
    },

    version: {
      type: String,
      default: 'kaduna-v1'
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.model(
    'PricingConfig',
    schema
  );