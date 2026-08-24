const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    amount: {
      type: Number,
      required: true,
      min: 1
    },

    currency: {
      type: String,
      default: 'NGN',
      uppercase: true
    },

    bankName: {
      type: String,
      required: true,
      trim: true
    },

    bankCode: {
      type: String,
      required: true,
      trim: true
    },

    accountNumber: {
      type: String,
      required: true,
      trim: true
    },

    accountName: {
      type: String,
      required: true,
      trim: true
    },

    recipientCode: {
      type: String,
      default: '',
      trim: true
    },

    reference: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    paystackTransferCode: {
      type: String,
      default: '',
      index: true
    },

    status: {
      type: String,
      enum: [
        'pending',
        'processing',
        'successful',
        'failed',
        'reversed'
      ],
      default: 'pending',
      index: true
    },

    failureReason: {
      type: String,
      default: ''
    },

    requestedAt: {
      type: Date,
      default: Date.now
    },

    completedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  'PlatformWithdrawal',
  schema
);