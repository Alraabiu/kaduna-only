const bcrypt = require('bcryptjs');

const User = require('../models/User');

const DriverProfile = require('../models/DriverProfile');

const Wallet = require('../models/Wallet');

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




const publicUser = u => ({

  id:u._id,

  fullName:u.fullName,

  phone:u.phone,

  email:u.email,

  role:u.role,

  status:u.status

});









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





if(
password.length < 8
){

return res.status(400).json({

success:false,

message:
'Password must be at least 8 characters'

});

}





const exists = await User.findOne({

$or:[

{
phone
},

...(email
?
[
{
email:email.toLowerCase()
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

phone,

email,

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





res.status(201).json({

success:true,

message:
'Account created successfully',

data:{

user:
publicUser(user),

token:
signToken(user)

}

});





}catch(error){

next(error);

}


}









/*
=========================================================
CREATE DEVICE ID
=========================================================
*/


function generateBrowserDeviceId(req){


return `browser-${

Buffer

.from(

`${req.ip}-${req.headers['user-agent']}`

)

.toString('base64')

.replace(/[^a-zA-Z0-9]/g,'')

.slice(0,32)

}`;


}









/*
=========================================================
LOGIN
DEVICE SECURITY
LOGIN HISTORY
SECURITY ALERTS
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

phone

})

.select('+passwordHash');







if(
!user
){

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







if(
user.status !== 'active'
){

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

await require('../models/DeviceSession')

.findOne({

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








res.json({

success:true,

message:
'Login successful',

data:{

user:
publicUser(user),

token:
signToken(user)

}

});





}catch(error){

next(error);

}


}









/*
=========================================================
CURRENT USER
=========================================================
*/


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