const UserSession = require('../models/UserSession');


/*
=========================================================
CREATE USER SESSION
=========================================================
*/

async function createSession({

  userId,

  tokenId,

  deviceId,

  ipAddress,

  userAgent,

  expiresAt

}){


return UserSession.create({

  user:userId,

  tokenId,

  deviceId,

  ipAddress,

  userAgent,

  expiresAt

});


}







/*
=========================================================
CHECK ACTIVE SESSION
=========================================================
*/

async function getActiveSession(tokenId){


return UserSession.findOne({

  tokenId,

  revoked:false

});


}







/*
=========================================================
REVOKE SESSION
=========================================================
*/

async function revokeSession(tokenId){


return UserSession.updateOne(

{

tokenId

},

{

$set:{

revoked:true

}

}

);


}







/*
=========================================================
REVOKE ALL USER SESSIONS
=========================================================
*/

async function revokeAllUserSessions(userId){


return UserSession.updateMany(

{

user:userId

},

{

$set:{

revoked:true

}

}

);


}







/*
=========================================================
REVOKE DEVICE SESSIONS
=========================================================
*/

async function revokeDeviceSessions({

userId,

deviceId

}){


return UserSession.updateMany(

{

user:userId,

deviceId

},

{

$set:{

revoked:true

}

}

);


}





module.exports={

createSession,

getActiveSession,

revokeSession,

revokeAllUserSessions,

revokeDeviceSessions

};