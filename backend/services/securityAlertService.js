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

  severity='MEDIUM',

  metadata={}

}){


  if(!userId){

    throw new Error(
      'User ID is required'
    );

  }



  const alert =

    await SecurityAlert.create({

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



  return alert;


}







/*
=========================================================
CHECK DUPLICATE ALERT
=========================================================
*/


async function hasRecentAlert({

  userId,

  type,

  deviceId,

  ipAddress,

  minutes=30

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

    await SecurityAlert.exists(query)

  );


}









/*
=========================================================
REALTIME SECURITY EMIT
=========================================================
*/


function emitSecurityAlert({

  userId,

  alert

}){


  const io =

    global.io;



  if(!io){

    console.log(
      '[SECURITY SOCKET] IO unavailable'
    );

    return;

  }





  io.to(

    `security:${userId}`

  )

  .emit(

    'security_alert',

    {

      success:true,

      alert

    }

  );



}









/*
=========================================================
CREATE UNIQUE ALERT + REALTIME
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





  const alert =

    await createAlert(payload);





  emitSecurityAlert({

    userId:
      payload.userId,

    alert

  });





  return alert;


}









/*
=========================================================
UNREAD COUNT
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
MARK ALL READ
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
RESOLVE ALERTS
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

emitSecurityAlert,

getUnreadCount,

markAllRead,

resolveAll


};