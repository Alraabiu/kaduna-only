const mongoose = require('mongoose');

/*
=========================================================
PASSWORD RESET
=========================================================

Temporary password-reset records only.

Security:
- OTP is never stored as plaintext.
- Reset token is never stored as plaintext.
- Records automatically expire.
- One active reset request per user.
=========================================================
*/

const schema = new mongoose.Schema({

  userId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required: true
},

  phone: {
    type: String,
    required: true,
    trim: true
  },

  otpHash: {
    type: String,
    required: true,
    select: false
  },

  otpExpiresAt: {
    type: Date,
    required: true
  },

  attempts: {
    type: Number,
    default: 0
  },

  verified: {
    type: Boolean,
    default: false
  },

  resetTokenHash: {
    type: String,
    default: null,
    select: false
  },

  resetTokenExpiresAt: {
    type: Date,
    default: null
  },

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 900
  }

}, {
  versionKey: false
});

/*
One active password-reset process per account.
*/
schema.index(
  { userId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  'PasswordReset',
  schema
);
