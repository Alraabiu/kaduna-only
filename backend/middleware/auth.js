const jwt = require('jsonwebtoken');

const User = require('../models/User');

const UserSession =
require('../models/UserSession');

const DeviceSession =
require('../models/DeviceSession');





/*
=========================================================
AUTHENTICATION MIDDLEWARE

Checks:

1. JWT validity
2. User account status
3. Active session
4. Device security status

=========================================================
*/


async function requireAuth(req,res,next){

try{


const header =
req.headers.authorization || '';



const token =

header.startsWith('Bearer ')

?
header.slice(7)

:
null;



if(!token){

return res.status(401).json({

success:false,

message:
'Authentication required'

});

}





const payload =

jwt.verify(

token,

process.env.JWT_SECRET

);





/*
=========================================================
CHECK SESSION

=========================================================
*/


const session =

await UserSession.findOne({

tokenId:
payload.tokenId,

revoked:false

});





if(!session){

return res.status(401).json({

success:false,

message:
'Session expired. Please login again'

});

}






/*
=========================================================
CHECK USER

=========================================================
*/


const user =

await User.findById(

payload.sub

);





if(!user || user.status !== 'active'){


return res.status(401).json({

success:false,

message:
'Account unavailable'

});

}








/*
=========================================================
CHECK DEVICE STATUS

=========================================================
*/


if(session.deviceId){


const device =

await DeviceSession.findOne({

user:user._id,

deviceId:
session.deviceId

});




if(device && device.blocked){


return res.status(403).json({

success:false,

message:
'This device has been blocked'

});


}


}








/*
=========================================================
UPDATE SESSION ACTIVITY

=========================================================
*/


session.lastUsedAt =
new Date();


await session.save();







req.user = user;


req.session = session;



next();




}catch(error){


return res.status(401).json({

success:false,

message:
'Invalid or expired token'

});


}

}








/*
=========================================================
ROLE AUTHORIZATION

=========================================================
*/


function requireRole(...roles){

return(

req,

res,

next

)=>{


if(

roles.includes(

req.user?.role

)

){

return next();

}




return res.status(403).json({

success:false,

message:
'Forbidden'

});


};

}






module.exports = {

requireAuth,

requireRole

};