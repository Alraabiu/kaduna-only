const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const PasswordReset = require('../models/PasswordReset');

/*
=========================================================
PASSWORD RESET SERVICE
=========================================================
*/

const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const OTP_BCRYPT_ROUNDS = 10;


/*
=========================================================
HASH HIGH-ENTROPY VALUE
=========================================================

SHA-256 is appropriate for the randomly generated reset
token because the token contains sufficient entropy.

The 6-digit OTP is deliberately NOT hashed with this
function. OTPs use bcrypt below.
=========================================================
*/

function hashValue(value) {

  return crypto
    .createHash('sha256')
    .update(String(value))
    .digest('hex');

}


/*
=========================================================
GENERATE OTP
=========================================================
*/

function generateOtp() {

  return String(
    crypto.randomInt(100000, 1000000)
  );

}


/*
=========================================================
GENERATE RESET TOKEN
=========================================================
*/

function generateResetToken() {

  return crypto
    .randomBytes(32)
    .toString('hex');

}


/*
=========================================================
CREATE PASSWORD RESET
=========================================================
*/

async function createPasswordReset(user) {

  const now = Date.now();

  /*
  Check the existing request BEFORE replacing it.

  This prevents repeated requests from continuously
  triggering SMS delivery.
  */

  const existing =
    await PasswordReset
      .findOne({
        userId:
          user._id
      })
      .select(
        'createdAt verified'
      );


  if(
    existing &&
    !existing.verified
  ){

    const createdAt =
      existing.createdAt
        ? existing.createdAt.getTime()
        : 0;

    const elapsed =
      now - createdAt;

    if(
      elapsed <
      RESEND_COOLDOWN_MS
    ){

      const retryAfterSeconds =
        Math.max(
          1,
          Math.ceil(
            (
              RESEND_COOLDOWN_MS -
              elapsed
            ) / 1000
          )
        );


      return {

        success:false,

        reason:
          'RESEND_COOLDOWN',

        retryAfterSeconds

      };

    }

  }


  const otp =
    generateOtp();


  /*
  OTPs have only 1,000,000 possible values.

  bcrypt makes an offline attack against a leaked
  database substantially more expensive than storing
  a direct SHA-256 digest.
  */

  const otpHash =
    await bcrypt.hash(
      otp,
      OTP_BCRYPT_ROUNDS
    );


  const otpExpiresAt =
    new Date(
      now +
      OTP_TTL_MS
    );


  /*
  One active reset process per account.
  */

  await PasswordReset.deleteOne({
    userId:
      user._id
  });


  await PasswordReset.create({

    userId:
      user._id,

    phone:
      user.phone,

    otpHash,

    otpExpiresAt,

    attempts:
      0,

    verified:
      false

  });


  /*
  Raw OTP exists only long enough for the SMS service
  to deliver it. It must never be returned by an API.
  */

  return {

    success:true,

    otp,

    expiresAt:
      otpExpiresAt

  };

}


/*
=========================================================
VERIFY OTP
=========================================================
*/

async function verifyPasswordResetOtp({
  userId,
  otp
}) {

  const record =
    await PasswordReset
      .findOne({
        userId
      })
      .select(
        '+otpHash +resetTokenHash'
      );


  if(!record){

    return {
      success:false,
      reason:'INVALID_OR_EXPIRED'
    };

  }


  if(record.verified){

    return {
      success:false,
      reason:'ALREADY_VERIFIED'
    };

  }


  if(
    record.otpExpiresAt.getTime() <
    Date.now()
  ){

    await PasswordReset.deleteOne({
      _id:
        record._id
    });


    return {
      success:false,
      reason:'INVALID_OR_EXPIRED'
    };

  }


  if(
    record.attempts >=
    MAX_OTP_ATTEMPTS
  ){

    await PasswordReset.deleteOne({
      _id:
        record._id
    });


    return {
      success:false,
      reason:'TOO_MANY_ATTEMPTS'
    };

  }


  const matches =
    await bcrypt.compare(
      String(otp),
      record.otpHash
    );


  if(!matches){

    record.attempts += 1;

    await record.save();


    if(
      record.attempts >=
      MAX_OTP_ATTEMPTS
    ){

      await PasswordReset.deleteOne({
        _id:
          record._id
      });


      return {
        success:false,
        reason:'TOO_MANY_ATTEMPTS'
      };

    }


    return {
      success:false,
      reason:'INVALID_OR_EXPIRED'
    };

  }


  /*
  OTP verified.

  Generate a separate high-entropy reset token.

  The raw token is returned once to the client.
  Only its SHA-256 hash is stored.
  */

  const resetToken =
    generateResetToken();


  record.verified =
    true;


  /*
  Destroy the usable OTP hash after verification.
  otpHash remains populated because the schema requires it.
  */

  record.otpHash =
    await bcrypt.hash(
      crypto
        .randomBytes(32)
        .toString('hex'),
      OTP_BCRYPT_ROUNDS
    );


  record.resetTokenHash =
    hashValue(
      resetToken
    );


  record.resetTokenExpiresAt =
    new Date(
      Date.now() +
      RESET_TOKEN_TTL_MS
    );


  await record.save();


  return {

    success:true,

    resetToken

  };

}


/*
=========================================================
VALIDATE RESET TOKEN
=========================================================
*/

async function validateResetToken({
  userId,
  resetToken
}) {

  const record =
    await PasswordReset
      .findOne({
        userId,
        verified:true
      })
      .select(
        '+resetTokenHash'
      );


  if(
    !record ||
    !record.resetTokenHash ||
    !record.resetTokenExpiresAt
  ){

    return null;

  }


  if(
    record.resetTokenExpiresAt.getTime() <
    Date.now()
  ){

    await PasswordReset.deleteOne({
      _id:
        record._id
    });

    return null;

  }


  const submittedHash =
    hashValue(
      resetToken
    );


  const expectedBuffer =
    Buffer.from(
      record.resetTokenHash,
      'hex'
    );


  const submittedBuffer =
    Buffer.from(
      submittedHash,
      'hex'
    );


  const matches =
    expectedBuffer.length ===
      submittedBuffer.length &&
    crypto.timingSafeEqual(
      expectedBuffer,
      submittedBuffer
    );


  if(!matches){

    return null;

  }


  return record;

}


/*
=========================================================
COMPLETE RESET
=========================================================
*/

async function consumePasswordReset(
  record
){

  if(!record){

    return;

  }


  await PasswordReset.deleteOne({
    _id:
      record._id
  });

}


/*
=========================================================
EXPORTS
=========================================================
*/

module.exports = {

  createPasswordReset,

  verifyPasswordResetOtp,

  validateResetToken,

  consumePasswordReset

};