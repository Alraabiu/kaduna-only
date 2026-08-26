const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    deviceId: {
      type: String,
      required: true
    },

    deviceName: {
      type: String,
      default: 'Unknown device'
    },

    platform: {
      type: String,
      default: 'unknown'
    },

    ipAddress: {
      type: String
    },

    userAgent: {
      type: String
    },

    trusted: {
      type: Boolean,
      default: false
    },

    lastActiveAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);


schema.index(
  {
    user: 1,
    deviceId: 1
  },
  {
    unique: true
  }
);


module.exports =
  mongoose.model(
    'DeviceSession',
    schema
  );