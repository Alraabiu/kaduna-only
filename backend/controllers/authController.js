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




const exists =

await User.findOne({

$or:[

{
phone
},

...(email
?
[
{
email:
email.toLowerCase()
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





if(
role === 'driver'
){


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
LOGIN
DEVICE SECURITY + LOGIN HISTORY
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





const u =

await User.findOne({

phone

})

.select('+passwordHash');





if(

!u ||

!(await bcrypt.compare(

password,

u.passwordHash

))

){



return res.status(401).json({

success:false,

message:
'Invalid phone or password'

});


}





if(
u.status !== 'active'
){


return res.status(403).json({

success:false,

message:
'Account is suspended'

});


}







/*
=========================================================
CREATE DEVICE ID

Priority:

1. Mobile app device ID
2. Browser supplied ID
3. Generated browser ID

=========================================================
*/


const currentDeviceId =


deviceId ||


req.headers['x-device-id'] ||


`browser-${

Buffer

.from(

`${req.ip}-${req.headers['user-agent']}`

)

.toString('base64')

.replace(/[^a-zA-Z0-9]/g,'')

.slice(0,32)

}`;







const finalDeviceName =

deviceName ||

req.headers['x-device-name'] ||

'Web Browser';




const finalPlatform =

platform ||

req.headers['x-platform'] ||

'web';






/*
=========================================================
SAVE DEVICE SESSION
=========================================================
*/


await registerOrUpdateDevice({

userId:u._id,

deviceId:currentDeviceId,

deviceName:finalDeviceName,

platform:finalPlatform,

ipAddress:req.ip,

userAgent:req.headers['user-agent']

});






/*
=========================================================
SAVE LOGIN HISTORY
=========================================================
*/


await recordLogin({

  userId:u._id,

  deviceId:currentDeviceId,

  deviceName:
    deviceName ||
    req.headers['x-device-name'] ||
    'Web Browser',

  platform:
    platform ||
    req.headers['x-platform'] ||
    'web',

  ipAddress:
    req.ip,

  userAgent:
    req.headers['user-agent']

});







res.json({

success:true,

message:
'Login successful',

data:{

user:
publicUser(u),

token:
signToken(u)

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





module.exports={


register,

login,

me


};