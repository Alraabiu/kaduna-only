const PricingConfig = require('../models/PricingConfig');
const {
  PRICING,
  setPricingConfig
} = require('../utils/pricing');

const DEFAULT_CONFIG = {
  bike: {
    base: 350,
    perKm: 120,
    minimum: 700,
    etaFactor: 1.08,
    avgKph: 25
  },

  keke: {
    base: 500,
    perKm: 160,
    minimum: 900,
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
  },

  platformCommission: 50,
  version: 'kaduna-v1'
};

function cleanVehicle(value, fallback) {
  return {
    base: Number.isFinite(Number(value?.base))
      ? Number(value.base)
      : fallback.base,

    perKm: Number.isFinite(Number(value?.perKm))
      ? Number(value.perKm)
      : fallback.perKm,

    minimum: Number.isFinite(Number(value?.minimum))
      ? Number(value.minimum)
      : fallback.minimum,

    etaFactor: Number.isFinite(Number(value?.etaFactor))
      ? Number(value.etaFactor)
      : fallback.etaFactor,

    avgKph: Number.isFinite(Number(value?.avgKph))
      ? Number(value.avgKph)
      : fallback.avgKph
  };
}

function normalize(config = {}) {
  return {
    bike: cleanVehicle(config.bike, DEFAULT_CONFIG.bike),
    keke: cleanVehicle(config.keke, DEFAULT_CONFIG.keke),
    car: cleanVehicle(config.car, DEFAULT_CONFIG.car),
    suv: cleanVehicle(config.suv, DEFAULT_CONFIG.suv),

    platformCommission:
      Number.isFinite(Number(config.platformCommission))
        ? Number(config.platformCommission)
        : DEFAULT_CONFIG.platformCommission,

    version:
      config.version ||
      DEFAULT_CONFIG.version
  };
}

async function getPricingConfig() {
  let config = await PricingConfig.findOne({
    key: 'kaduna-default'
  });

  if (!config) {
    config = await PricingConfig.create({
      key: 'kaduna-default',
      ...DEFAULT_CONFIG
    });
  }

  const normalized = normalize(config.toObject());

  // Keep the fare engine synchronized with MongoDB.
  setPricingConfig(normalized);

  return normalized;
}

async function updatePricingConfig({
  pricing,
  platformCommission
}) {
  const next = normalize({
    bike: pricing.bike,
    keke: pricing.keke,
    car: pricing.car,
    suv: pricing.suv,
    platformCommission,
    version: 'kaduna-v1'
  });

  const updated =
    await PricingConfig.findOneAndUpdate(
      {
        key: 'kaduna-default'
      },
      {
        $set: next
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

  const normalized = normalize(
    updated.toObject()
  );

  // Immediately apply new pricing without restarting backend.
  setPricingConfig(normalized);

  return normalized;
}

module.exports = {
  getPricingConfig,
  updatePricingConfig,
  DEFAULT_CONFIG
};