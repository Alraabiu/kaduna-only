const mongoose = require('mongoose');

const bankSnapshotSchema = new mongoose.Schema(
  {
    bankName: {
      type: String,
      required: true,
      trim: true,
    },

    bankCode: {
      type: String,
      trim: true,
    },

    accountName: {
      type: String,
      required: true,
      trim: true,
    },

    accountNumber: {
      type: String,
      required: true,
      trim: true,
    },

    recipientCode: {
      type: String,
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const schema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    /*
    -------------------------------------------------------
    GENERIC WALLET OWNER
    -------------------------------------------------------
    Supports both:
    - Rider
    - Driver
    */

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    /*
    -------------------------------------------------------
    LEGACY DRIVER FIELD
    -------------------------------------------------------
    Kept so existing driver withdrawals continue working.
    */

    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    bank: bankSnapshotSchema,

   status: {
  type: String,
  enum: [
    'pending',
    'approved',
    'processing',
    'paid',
    'rejected',
    'failed',
    'needs_review',
  ],
  default: 'pending',
  index: true,
},

    adminNote: {
      type: String,
      trim: true,
    },

    transferReference: {
      type: String,
      trim: true,
    },

    paystackTransferId: {
      type: String,
      trim: true,
    },

    paystackStatus: {
      type: String,
      trim: true,
    },

    fundsReservedAt: {
      type: Date,
      default: Date.now,
    },

    approvedAt: Date,

    processingAt: Date,

    paidAt: Date,

    rejectedAt: Date,

    refundedAt: Date,

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.model(
    'Withdrawal',
    schema
  );