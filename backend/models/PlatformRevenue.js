const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
      index: true
    },

    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    currency: {
      type: String,
      default: 'NGN'
    },

    paymentMethod: {
      type: String,
      enum: ['wallet', 'cash'],
      required: true
    },

    reference: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    status: {
      type: String,
      enum: ['collected', 'due'],
      default: 'collected',
      index: true
    },

    description: {
      type: String,
      default: 'Kaduna Only platform commission'
    },

    collectedAt: Date
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('PlatformRevenue', schema);