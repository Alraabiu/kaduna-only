const bcrypt = require('bcryptjs');

const User = require('../models/User');

const DriverProfile = require('../models/DriverProfile');

const Wallet = require('../models/Wallet');

const DeviceSession = require('../models/DeviceSession');

const signToken = require('../utils/jwt');
const {
  createPasswordReset,
  verifyPasswordResetOtp,
  validateResetToken,
  consumePasswordReset
} = require('../services/passwordResetService');

const {
  sendPasswordResetOtp
} = require('../services/smsService');


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
  createSession,
  revokeAllUserSessions
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










async function logout(req,res,next){
  try {
    if (req.tokenId) await require('../services/sessionService').revokeSession(req.tokenId);
    res.json({success:true,message:'Logged out'});
  } catch(e) { next(e); }
}

async function refresh(req,res,next){
  try{
    const jwtResult=signToken(req.user);
    await createUserSession({
      user:req.user,
      jwtResult,
      deviceId:req.session?.deviceId || generateBrowserDeviceId(req),
      req
    });
    res.json({success:true,message:'Session refreshed',data:{user:publicUser(req.user),token:jwtResult.token}});
  }catch(e){next(e)}
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






async function forgotPassword(req,res,next){

  try {

    const phone =
      String(req.body?.phone || '')
        .trim();

    if(!phone){

      return res.status(400).json({
        success:false,
        message:'Phone number is required'
      });

    }


    const genericResponse = {
      success:true,
      message:
        'If an account exists for this phone number, a verification code will be sent.'
    };


    const user =
      await User.findOne({
        phone
      });


    /*
    Do not reveal whether the account exists.
    */

    if(!user){

      return res.json(
        genericResponse
      );

    }


    /*
    Suspended accounts must not use password recovery
    to bypass account restrictions.
    */

    if(user.status !== 'active'){

      return res.json(
        genericResponse
      );

    }


    const resetRequest =
      await createPasswordReset(
        user
      );


    /*
    A recent reset request already exists.

    Return the same generic response used for a successful
    request so the endpoint does not reveal whether the
    supplied phone number belongs to an account.

    No additional SMS is sent during the cooldown.
    */

    if(
      !resetRequest.success &&
      resetRequest.reason ===
        'RESEND_COOLDOWN'
    ){

      return res.json({

        success:true,

        message:
          'If an account exists for that phone number, a verification code will be sent shortly.'

      });

    }


    const {
      otp
    } =
      resetRequest;


    try {

      await sendPasswordResetOtp({
        phone:
          user.phone,
        otp
      });

    }catch(smsError){

      /*
      Do not leave a usable OTP behind when delivery
      failed.

      Requiring the model here avoids changing the
      permanent User record.
      */

      const PasswordReset =
        require('../models/PasswordReset');

      await PasswordReset.deleteOne({
        userId:
          user._id
      });


      console.error(
        'Password reset SMS delivery failed:',
        smsError.message
      );


      /*
      Configuration/provider failure is different from
      an unknown phone number. We must not tell the user
      that a code was sent when it was not.
      */

      return res.status(503).json({
        success:false,
        message:
          'Password recovery service is temporarily unavailable. Please try again later.'
      });

    }


    return res.json(
      genericResponse
    );


  }catch(error){

    next(error);

  }

}





/*
=========================================================
VERIFY PASSWORD RESET CODE
=========================================================
*/

async function verifyResetCode(req,res,next){

  try {

    const phone =
      String(req.body?.phone || '')
        .trim();

    const otp =
      String(req.body?.otp || '')
        .trim();


    if(!phone || !otp){

      return res.status(400).json({
        success:false,
        message:
          'Phone number and verification code are required'
      });

    }


    if(!/^\d{6}$/.test(otp)){

      return res.status(400).json({
        success:false,
        message:
          'Verification code must be 6 digits'
      });

    }


    const user =
      await User.findOne({
        phone
      });


    if(!user){

      return res.status(400).json({
        success:false,
        message:
          'Invalid or expired verification code'
      });

    }


    const result =
      await verifyPasswordResetOtp({
        userId:
          user._id,
        otp
      });


    if(!result.success){

      if(
        result.reason ===
        'TOO_MANY_ATTEMPTS'
      ){

        return res.status(429).json({
          success:false,
          message:
            'Too many incorrect attempts. Request a new verification code.'
        });

      }


      return res.status(400).json({
        success:false,
        message:
          'Invalid or expired verification code'
      });

    }


    return res.json({

      success:true,

      message:
        'Verification successful',

      data:{
        resetToken:
          result.resetToken
      }

    });


  }catch(error){

    next(error);

  }

}





/*
=========================================================
RESET PASSWORD
=========================================================
*/

async function resetPassword(req,res,next){

  try {

    const phone =
      String(req.body?.phone || '')
        .trim();

    const resetToken =
      String(req.body?.resetToken || '')
        .trim();

    const newPassword =
      String(req.body?.newPassword || '');


    if(
      !phone ||
      !resetToken ||
      !newPassword
    ){

      return res.status(400).json({
        success:false,
        message:
          'Phone number, reset token and new password are required'
      });

    }


    if(newPassword.length < 8){

      return res.status(400).json({
        success:false,
        message:
          'Password must be at least 8 characters'
      });

    }


    const user =
      await User.findOne({
        phone
      });


    if(!user){

      return res.status(400).json({
        success:false,
        message:
          'Invalid or expired password reset request'
      });

    }


    const resetRecord =
      await validateResetToken({
        userId:
          user._id,
        resetToken
      });


    if(!resetRecord){

      return res.status(400).json({
        success:false,
        message:
          'Invalid or expired password reset request'
      });

    }


    /*
    Use the same bcrypt cost as the existing
    authentication implementation.
    */

    user.passwordHash =
      await bcrypt.hash(
        newPassword,
        12
      );


    await user.save();


    /*
    Reset token becomes unusable immediately.
    */

    await consumePasswordReset(
      resetRecord
    );


    /*
    Revoke existing sessions after a password reset.

    This prevents a previously authenticated device
    from remaining logged in with old credentials.
    */

    await revokeAllUserSessions(user._id);


    return res.json({

      success:true,

      message:
        'Password updated successfully. Please log in with your new password.'

    });


  }catch(error){

    next(error);

  }

}




module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  forgotPassword,
  verifyResetCode,
  resetPassword
};