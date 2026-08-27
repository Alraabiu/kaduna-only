const jwt = require('jsonwebtoken');

const User = require('../models/User');

const {
  getActiveSession
} = require('../services/sessionService');



/*
=========================================================
AUTHENTICATION MIDDLEWARE

Flow:

Bearer Token
      |
      |
JWT Verify
      |
      |
Check UserSession
      |
      |
Check User
      |
      |
Attach req.user

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





if(!payload.tokenId){

return res.status(401).json({

success:false,

message:
'Invalid session token'

});

}





const session =

await getActiveSession(

payload.tokenId

);





if(!session){

return res.status(401).json({

success:false,

message:
'Session expired or revoked'

});

}





if(

session.expiresAt < new Date()

){

return res.status(401).json({

success:false,

message:
'Session expired'

});

}





const user =

await User.findById(

payload.sub

);





if(

!user ||

user.status !== 'active'

){

return res.status(401).json({

success:false,

message:
'Account unavailable'

});

}





/*
=========================================================
SECURITY CONTEXT
=========================================================
*/


req.user = user;


req.session = session;


req.tokenId = payload.tokenId;



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
ROLE CHECK
=========================================================
*/


function requireRole(...roles){


return (

req,

res,

next

)=>{


if(

!req.user

){

return res.status(401).json({

success:false,

message:
'Authentication required'

});

}





if(

!roles.includes(req.user.role)

){

return res.status(403).json({

success:false,

message:
'Forbidden'

});

}





next();


};


}








module.exports = {

requireAuth,

requireRole

};