const crypto = require('crypto');

const DeviceSession = require('../models/DeviceSession');



function generateDeviceId({
  userAgent,
  ipAddress
}) {

  const fingerprint =
    `${userAgent || 'unknown'}-${ipAddress || 'unknown'}-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;


  return crypto
    .createHash('sha256')
    .update(fingerprint)
    .digest('hex');

}





async function registerOrUpdateDevice({

  userId,

  deviceId,

  deviceName,

  platform,

  ipAddress,

  userAgent

}) {


  if (!userId) {

    throw new Error(
      'User ID is required'
    );

  }



  /*
   * Generate device ID automatically
   * when frontend does not provide one.
   */

  const finalDeviceId =
    deviceId ||
    generateDeviceId({
      userAgent,
      ipAddress
    });



  const device =
    await DeviceSession.findOneAndUpdate(

      {

        user:
          userId,

        deviceId:
          finalDeviceId

      },


      {

        $set: {

          deviceName:
            deviceName ||
            detectDeviceName(userAgent),


          platform:
            platform ||
            detectPlatform(userAgent),


          ipAddress,


          userAgent,


          lastActiveAt:
            new Date()

        },


        $setOnInsert: {

          trusted:
            true

        }

      },


      {

        upsert:true,

        returnDocument:'after'

      }

    );



  return device;

}






function detectPlatform(userAgent='') {


  const agent =
    userAgent.toLowerCase();


  if (
    agent.includes('android')
  ) {

    return 'android';

  }


  if (
    agent.includes('iphone') ||
    agent.includes('ipad')
  ) {

    return 'ios';

  }


  if (
    agent.includes('windows')
  ) {

    return 'windows';

  }


  if (
    agent.includes('mac')
  ) {

    return 'mac';

  }


  return 'unknown';

}







function detectDeviceName(userAgent='') {


  if (
    userAgent.includes('Android')
  ) {

    return 'Android Device';

  }


  if (
    userAgent.includes('iPhone')
  ) {

    return 'iPhone';

  }


  return 'Unknown Device';

}








async function getUserDevice({

  userId,

  deviceId

}) {


  return DeviceSession.findOne({

    user:
      userId,

    deviceId

  });

}







async function isTrustedDevice({

  userId,

  deviceId

}) {


  const device =
    await getUserDevice({

      userId,

      deviceId

    });



  return Boolean(

    device &&

    device.trusted === true

  );


}






module.exports = {

  registerOrUpdateDevice,

  getUserDevice,

  isTrustedDevice,

  generateDeviceId

};