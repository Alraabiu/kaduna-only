const DeviceSession = require('../models/DeviceSession');


async function registerOrUpdateDevice({
  userId,
  deviceId,
  deviceName,
  platform,
  ipAddress,
  userAgent
}) {

  if (!userId || !deviceId) {
    throw new Error(
      'User ID and device ID are required'
    );
  }


  const device =
    await DeviceSession.findOneAndUpdate(

      {
        user:
          userId,

        deviceId
      },

      {

        $set: {

          deviceName:
            deviceName || 'Unknown device',

          platform:
            platform || 'unknown',

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
        upsert: true,
        returnDocument: 'after'
      }

    );


  return device;
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


  return !!(
    device &&
    device.trusted === true
  );

}



module.exports = {

  registerOrUpdateDevice,

  getUserDevice,

  isTrustedDevice

};