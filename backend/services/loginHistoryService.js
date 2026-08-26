const LoginHistory =
require('../models/LoginHistory');



async function recordLogin({

userId,

deviceId,

deviceName,

platform,

ipAddress,

userAgent,

status='success'

}){


return LoginHistory.create({

user:userId,

deviceId,

deviceName,

platform,

ipAddress,

userAgent,

status

});


}



module.exports={

recordLogin

};