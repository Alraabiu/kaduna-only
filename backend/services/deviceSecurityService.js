const crypto = require('crypto');

const DeviceSession =
require('../models/DeviceSession');



/*
=========================================================
GENERATE DEVICE ID
=========================================================
*/

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






/*
=========================================================
REGISTER OR UPDATE DEVICE

Returns:

{
 device,
 isNew,
 previousIp,
 deviceId
}

=========================================================
*/

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
      'User ID is required'
    );

  }





  /*
  =======================================================
  DEVICE ID RESOLUTION
  =======================================================
  */


  const finalDeviceId =

    deviceId ||

    generateDeviceId({

      userAgent,

      ipAddress

    });







  /*
  =======================================================
  CHECK EXISTING DEVICE FIRST

  Required for security alerts

  =======================================================
  */


  const existingDevice =

    await DeviceSession.findOne({

      user:userId,

      deviceId:finalDeviceId

    });





  const isNew =

    !existingDevice;




  const previousIp =

    existingDevice?.ipAddress || null;







  /*
  =======================================================
  CREATE OR UPDATE DEVICE
  =======================================================
  */


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


    isNew,


    previousIp,


    deviceId:finalDeviceId


  };

}








/*
=========================================================
GET USER DEVICE
=========================================================
*/


async function getUserDevice({

  userId,

  deviceId

}) {


  return DeviceSession.findOne({

    user:userId,

    deviceId

  });


}








/*
=========================================================
CHECK TRUSTED DEVICE
=========================================================
*/


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









/*
=========================================================
DEVICE PLATFORM DETECTION
=========================================================
*/


function detectPlatform(userAgent=''){


  const agent =

    userAgent.toLowerCase();




  if(agent.includes('android')){


    return 'android';


  }





  if(

    agent.includes('iphone') ||

    agent.includes('ipad')

  ){


    return 'ios';


  }






  if(agent.includes('windows')){


    return 'windows';


  }






  if(agent.includes('mac')){


    return 'mac';


  }





  return 'unknown';


}








/*
=========================================================
DEVICE NAME DETECTION
=========================================================
*/


function detectDeviceName(userAgent=''){


  const agent =

    userAgent.toLowerCase();




  if(agent.includes('android')){


    return 'Android Device';


  }





  if(agent.includes('iphone')){


    return 'iPhone';


  }





  if(agent.includes('ipad')){


    return 'iPad';


  }





  if(agent.includes('windows')){


    return 'Windows Browser';


  }





  if(agent.includes('mac')){


    return 'Mac Browser';


  }





  return 'Unknown Device';


}








module.exports = {


  registerOrUpdateDevice,


  getUserDevice,


  isTrustedDevice,


  generateDeviceId


};