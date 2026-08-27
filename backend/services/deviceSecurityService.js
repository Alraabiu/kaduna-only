const crypto = require('crypto');

const DeviceSession = require('../models/DeviceSession');


function generateDeviceId({
  userAgent,
  ipAddress
}) {

  const fingerprint =
    `${userAgent || 'unknown'}-${ipAddress || 'unknown'}-${crypto.randomBytes(16).toString('hex')}`;


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


  if(!userId){

    throw new Error(
      'User ID required'
    );

  }



  const finalDeviceId =
    deviceId ||
    generateDeviceId({
      userAgent,
      ipAddress
    });



  const existing =
    await DeviceSession.findOne({

      user:userId,

      deviceId:finalDeviceId

    });



  const isNewDevice =
    !existing;



  const device =
    await DeviceSession.findOneAndUpdate(

      {

        user:userId,

        deviceId:finalDeviceId

      },


      {

        $set:{

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


        $setOnInsert:{

          trusted:true

        }

      },


      {

        upsert:true,

        returnDocument:'after'

      }

    );



  return {

    device,

    isNewDevice

  };

}







function detectPlatform(userAgent=''){

 const agent =
 userAgent.toLowerCase();


 if(agent.includes('android'))
 return 'android';


 if(
 agent.includes('iphone') ||
 agent.includes('ipad')
 )
 return 'ios';


 if(agent.includes('windows'))
 return 'windows';


 if(agent.includes('mac'))
 return 'mac';


 return 'unknown';

}





function detectDeviceName(userAgent=''){


 if(userAgent.includes('Android'))
 return 'Android Device';


 if(userAgent.includes('iPhone'))
 return 'iPhone';


 return 'Web Browser';

}





async function getUserDevice({

 userId,

 deviceId

}){


 return DeviceSession.findOne({

  user:userId,

  deviceId

 });


}






async function isTrustedDevice({

 userId,

 deviceId

}){


 const device =
 await getUserDevice({

  userId,

  deviceId

 });


 return Boolean(

  device &&
  device.trusted

 );


}




module.exports={

 registerOrUpdateDevice,

 getUserDevice,

 isTrustedDevice,

 generateDeviceId

};