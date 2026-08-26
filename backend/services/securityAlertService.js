const SecurityAlert =
require('../models/SecurityAlert');



async function createAlert({

  userId,

  type,

  message,

  deviceId,

  ipAddress,

  userAgent

}) {


  return SecurityAlert.create({

    user:userId,

    type,

    message,

    deviceId,

    ipAddress,

    userAgent

  });


}



module.exports = {

  createAlert

};