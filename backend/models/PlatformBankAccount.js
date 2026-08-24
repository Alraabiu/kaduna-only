const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
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

    currency: {
      type: String,
      default: 'NGN',
      uppercase: true
    },

    isVerified: {
      type: Boolean,
      default: false
    },

    verifiedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  'PlatformBankAccount',
  schema
);