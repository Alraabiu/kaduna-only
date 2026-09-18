/*
=========================================================
SMS SERVICE — TERMII
=========================================================

Used for transactional security messages such as
password-reset verification codes.

Secrets are read only from environment variables.
=========================================================
*/

const TERMII_BASE_URL =
  'https://v4.api.termii.com';


/*
=========================================================
NORMALIZE NIGERIAN PHONE NUMBER
=========================================================

Examples:

08012345678  -> 2348012345678
+2348012345678 -> 2348012345678
2348012345678 -> 2348012345678
=========================================================
*/

function normalizeNigerianPhone(phone) {

  let value =
    String(phone || '')
      .trim()
      .replace(/[^\d+]/g, '');


  if(value.startsWith('+')) {

    value =
      value.slice(1);

  }


  if(value.startsWith('0')) {

    value =
      `234${value.slice(1)}`;

  }


  if(!value.startsWith('234')) {

    throw new Error(
      'Only Nigerian phone numbers are currently supported'
    );

  }


  if(!/^234\d{10}$/.test(value)) {

    throw new Error(
      'Invalid Nigerian phone number'
    );

  }


  return value;

}


/*
=========================================================
CONFIGURATION
=========================================================
*/

function getTermiiConfig() {

  const apiKey =
    String(
      process.env.TERMII_API_KEY || ''
    ).trim();


  const senderId =
    String(
      process.env.TERMII_SENDER_ID || ''
    ).trim();


  if(!apiKey) {

    throw new Error(
      'TERMII_API_KEY is not configured'
    );

  }


  if(!senderId) {

    throw new Error(
      'TERMII_SENDER_ID is not configured'
    );

  }


  return {
    apiKey,
    senderId
  };

}


/*
=========================================================
SEND SMS
=========================================================
*/

async function sendSms({
  phone,
  message
}) {

  const {
    apiKey,
    senderId
  } = getTermiiConfig();


  const to =
    normalizeNigerianPhone(
      phone
    );


  const cleanMessage =
    String(
      message || ''
    ).trim();


  if(!cleanMessage) {

    throw new Error(
      'SMS message is required'
    );

  }


  const response =
    await fetch(
      `${TERMII_BASE_URL}/api/sms/send`,
      {
        method:
          'POST',

        headers:{
          'Content-Type':
            'application/json',
          Accept:
            'application/json'
        },

        body:
          JSON.stringify({
            to,
            from:
              senderId,
            sms:
              cleanMessage,
            type:
              'plain',
            channel:
              'generic',
            api_key:
              apiKey
          })
      }
    );


  let data = null;


  try {

    data =
      await response.json();

  }catch{

    data = null;

  }


  if(!response.ok) {

    const error =
      new Error(
        data?.message ||
        data?.error ||
        `Termii SMS request failed with status ${response.status}`
      );

    error.status =
      response.status;

    throw error;

  }


  return data;

}


/*
=========================================================
PASSWORD RESET OTP
=========================================================
*/

async function sendPasswordResetOtp({
  phone,
  otp
}) {

  const code =
    String(otp || '')
      .trim();


  if(!/^\d{6}$/.test(code)) {

    throw new Error(
      'Password reset OTP must be 6 digits'
    );

  }


  const message =
    `Your Kaduna Only password reset code is ${code}. ` +
    'This code expires in 10 minutes. ' +
    'Do not share it with anyone.';


  return sendSms({
    phone,
    message
  });

}


/*
=========================================================
EXPORTS
=========================================================
*/

module.exports = {

  normalizeNigerianPhone,

  sendSms,

  sendPasswordResetOtp

};
