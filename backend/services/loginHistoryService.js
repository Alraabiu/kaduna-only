const LoginHistory =
require('../models/LoginHistory');



async function recordLogin(data){

  try {


    console.log(
      '[LOGIN HISTORY START]',
      {
        userId:String(data.userId),
        deviceId:data.deviceId
      }
    );


    const record =

      await LoginHistory.create({

        user:data.userId,

        deviceId:data.deviceId,

        deviceName:
          data.deviceName ||
          'Unknown device',

        platform:
          data.platform ||
          'unknown',

        ipAddress:
          data.ipAddress,

        userAgent:
          data.userAgent,

        status:
          data.status ||
          'success'

      });



    console.log(
      '[LOGIN HISTORY CREATED]',
      {
        id:String(record._id)
      }
    );


    return record;



  } catch(error){


    console.error(
      '[LOGIN HISTORY ERROR]',
      error
    );


    throw error;

  }

}



module.exports = {

  recordLogin

};