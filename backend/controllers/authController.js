const bcrypt = require('bcryptjs');

const User = require('../models/User');

const DriverProfile = require('../models/DriverProfile');

const Wallet = require('../models/Wallet');

const DeviceSession = require('../models/DeviceSession');

const signToken = require('../utils/jwt');


const {
  registerOrUpdateDevice
} = require('../services/deviceSecurityService');


const {
  recordLogin
} = require('../services/loginHistoryService');


const {
  createUniqueAlert
} = require('../services/securityAlertService');


const {
  createSession
} = require('../services/sessionService');




const publicUser = user => ({

  id:user._id,

  fullName:user.fullName,

  phone:user.phone,

  email:user.email,

  role:user.role,

  status:user.status

});






function generateBrowserDeviceId(req){

return `browser-${
Buffer
.from(
`${req.ip}-${req.headers['user-agent'] || 'unknown'}`
)
.toString('base64')
.replace(/[^a-zA-Z0-9]/g,'')
.slice(0,32)
}`;

}







async function createUserSession({

user,

jwtResult,

deviceId,

req

}){


return createSession({

userId:user._id,

tokenId:jwtResult.tokenId,

deviceId,

ipAddress:req.ip,

userAgent:req.headers['user-agent'],

expiresAt:new Date(

Date.now() +

7 *

24 *

60 *

60 *

1000

)

});


}








/*
=========================================================
REGISTER
=========================================================
*/


async function register(req,res,next){

try{


const {

fullName,

phone,

email,

password,

role='rider'

}=req.body || {};




if(
!fullName ||
!phone ||
!password
){

return res.status(400).json({

success:false,

message:
'Full name, phone and password are required'

});

}




if(
!['rider','driver'].includes(role)
){

return res.status(400).json({

success:false,

message:
'Only rider or driver registration is allowed'

});

}




if(password.length < 8){

return res.status(400).json({

success:false,

message:
'Password must be at least 8 characters'

});

}




const cleanPhone =
phone.trim();


const cleanEmail =
email
?
email.toLowerCase().trim()
:
undefined;




const exists =
await User.findOne({

$or:[

{
phone:cleanPhone
},

...(cleanEmail
?
[
{
email:cleanEmail
}
]
:
[])

]

});





if(exists){

return res.status(409).json({

success:false,

message:
'Phone or email already registered'

});

}





const passwordHash =

await bcrypt.hash(

password,

12

);





const user =

await User.create({

fullName,

phone:cleanPhone,

email:cleanEmail,

passwordHash,

role

});





await Wallet.create({

user:user._id

});





if(role === 'driver'){

await DriverProfile.create({

user:user._id

});

}





const jwtResult =
signToken(user);





res.status(201).json({

success:true,

message:
'Account created successfully',

data:{

user:
publicUser(user),

token:
jwtResult.token

}

});



}catch(error){

next(error);

}

}










/*
=========================================================
LOGIN
=========================================================
*/


async function login(req,res,next){

try{


const {

phone,

password,

deviceId,

deviceName,

platform

}=req.body || {};




if(
!phone ||
!password
){

return res.status(400).json({

success:false,

message:
'Phone and password are required'

});

}




const user =

await User.findOne({

phone:phone.trim()

})

.select('+passwordHash');





if(!user){

return res.status(401).json({

success:false,

message:
'Invalid phone or password'

});

}





const passwordValid =

await bcrypt.compare(

password,

user.passwordHash

);





if(!passwordValid){


await createUniqueAlert({

userId:user._id,

type:'SUSPICIOUS_LOGIN',

message:
'Failed login attempt detected',

ipAddress:req.ip,

userAgent:req.headers['user-agent'],

severity:'HIGH'

});



return res.status(401).json({

success:false,

message:
'Invalid phone or password'

});

}





if(user.status !== 'active'){

return res.status(403).json({

success:false,

message:
'Account is suspended'

});

}





const currentDeviceId =

deviceId ||

req.headers['x-device-id'] ||

generateBrowserDeviceId(req);





const finalDeviceName =

deviceName ||

req.headers['x-device-name'] ||

'Web Browser';





const finalPlatform =

platform ||

req.headers['x-platform'] ||

'web';





const existingDevice =

await DeviceSession.findOne({

user:user._id,

deviceId:currentDeviceId

});





const previousIp =
existingDevice?.ipAddress;





await registerOrUpdateDevice({

userId:user._id,

deviceId:currentDeviceId,

deviceName:finalDeviceName,

platform:finalPlatform,

ipAddress:req.ip,

userAgent:req.headers['user-agent']

});






if(!existingDevice){


await createUniqueAlert({

userId:user._id,

type:'NEW_DEVICE',

message:
'Login detected from a new device',

deviceId:currentDeviceId,

ipAddress:req.ip,

userAgent:req.headers['user-agent'],

severity:'HIGH'

});


}





if(

previousIp &&

previousIp !== req.ip

){


await createUniqueAlert({

userId:user._id,

type:'NEW_IP',

message:
'Login detected from a new IP address',

deviceId:currentDeviceId,

ipAddress:req.ip,

userAgent:req.headers['user-agent'],

severity:'MEDIUM'

});


}






await recordLogin({

userId:user._id,

deviceId:currentDeviceId,

deviceName:finalDeviceName,

platform:finalPlatform,

ipAddress:req.ip,

userAgent:req.headers['user-agent'],

status:'success'

});







const jwtResult =
signToken(user);





await createUserSession({

user,

jwtResult,

deviceId:currentDeviceId,

req

});







res.json({

success:true,

message:
'Login successful',

data:{

user:
publicUser(user),

token:
jwtResult.token

}

});




}catch(error){

next(error);

}

}








async function me(req,res){

res.json({

success:true,

data:{

user:
publicUser(req.user)

}

});

}






module.exports = {

register,

login,

me

};