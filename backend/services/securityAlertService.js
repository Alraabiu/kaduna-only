const SecurityAlert =
require('../models/SecurityAlert');





/*
=========================================================
CREATE SECURITY ALERT
=========================================================
*/

async function createAlert({

  userId,

  type,

  message,

  deviceId,

  deviceName,

  platform,

  ipAddress,

  userAgent,

  severity = 'MEDIUM',

  metadata = {}

}){


  if(!userId){

    throw new Error(
      'User ID is required'
    );

  }



  if(!type){

    throw new Error(
      'Alert type is required'
    );

  }




  return SecurityAlert.create({

    user:userId,

    type,

    message,

    deviceId,

    deviceName,

    platform,

    ipAddress,

    userAgent,

    severity,

    metadata

  });


}








/*
=========================================================
CHECK RECENT DUPLICATE ALERT
=========================================================
*/


async function hasRecentAlert({

  userId,

  type,

  deviceId,

  ipAddress,

  minutes = 30

}){


  const since =

    new Date(

      Date.now() -

      minutes *

      60 *

      1000

    );





  const query = {


    user:userId,


    type,


    createdAt:{

      $gte:since

    }


  };




  if(deviceId){

    query.deviceId =
      deviceId;

  }




  if(ipAddress){

    query.ipAddress =
      ipAddress;

  }




  return Boolean(

    await SecurityAlert.exists(
      query
    )

  );


}









/*
=========================================================
CREATE ALERT IF NOT EXISTS
=========================================================
*/


async function createUniqueAlert(payload){




  const exists =

    await hasRecentAlert({

      userId:
        payload.userId,

      type:
        payload.type,

      deviceId:
        payload.deviceId,

      ipAddress:
        payload.ipAddress

    });





  if(exists){

    return null;

  }





  return createAlert(payload);

}









/*
=========================================================
GET UNREAD ALERT COUNT
=========================================================
*/


async function getUnreadCount(userId){


  return SecurityAlert.countDocuments({

    user:userId,

    read:false

  });


}









/*
=========================================================
MARK ALL ALERTS READ
=========================================================
*/


async function markAllRead(userId){


  return SecurityAlert.updateMany(

    {

      user:userId,

      read:false

    },

    {

      $set:{

        read:true

      }

    }

  );


}









/*
=========================================================
RESOLVE ALL ALERTS
=========================================================
*/


async function resolveAll(userId){


  return SecurityAlert.updateMany(

    {

      user:userId,

      resolved:false

    },

    {

      $set:{

        resolved:true

      }

    }

  );


}









module.exports = {


  createAlert,


  createUniqueAlert,


  hasRecentAlert,


  getUnreadCount,


  markAllRead,


  resolveAll


};