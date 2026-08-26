const DeviceSession = require('../models/DeviceSession');
const LoginHistory =
require('../models/LoginHistory');


async function getLoginHistory(req,res,next){

try{


const history =

await LoginHistory.find({

user:req.user._id

})

.sort({

createdAt:-1

})

.limit(50);



res.json({

success:true,

history

});


}catch(error){

next(error);

}

}


/*
=========================================================
GET USER DEVICES
=========================================================
*/

async function getDevices(req,res,next){

  try{


    const devices =

      await DeviceSession.find({

        user:req.user._id

      })

      .sort({

        lastActiveAt:-1

      })

      .select(

        'deviceId deviceName platform trusted lastActiveAt createdAt ipAddress'

      );




    res.json({

      success:true,

      devices

    });



  }catch(error){

    next(error);

  }

}






/*
=========================================================
REMOVE DEVICE
=========================================================
*/

async function removeDevice(req,res,next){

  try{


    const {

      deviceId

    } = req.params;




    const device =

      await DeviceSession.findOneAndDelete({

        user:req.user._id,

        deviceId

      });





    if(!device){

      return res.status(404).json({

        success:false,

        message:
        'Device not found'

      });

    }




    res.json({

      success:true,

      message:
      'Device removed successfully'

    });





  }catch(error){

    next(error);

  }

}






/*
=========================================================
TRUST DEVICE
=========================================================
*/

async function trustDevice(req,res,next){

  try{


    const {

      deviceId

    } = req.params;




    const device =

      await DeviceSession.findOneAndUpdate(

        {

          user:req.user._id,

          deviceId

        },

        {

          $set:{

            trusted:true,

            lastActiveAt:new Date()

          }

        },

        {

          returnDocument:'after'

        }

      );





    if(!device){

      return res.status(404).json({

        success:false,

        message:
        'Device not found'

      });

    }




    res.json({

      success:true,

      message:
      'Device trusted successfully',

      device

    });





  }catch(error){

    next(error);

  }

}






/*
=========================================================
UNTRUST DEVICE
=========================================================
*/

async function untrustDevice(req,res,next){

  try{


    const {

      deviceId

    } = req.params;




    const device =

      await DeviceSession.findOneAndUpdate(

        {

          user:req.user._id,

          deviceId

        },

        {

          $set:{

            trusted:false

          }

        },

        {

          returnDocument:'after'

        }

      );





    if(!device){

      return res.status(404).json({

        success:false,

        message:
        'Device not found'

      });

    }




    res.json({

      success:true,

      message:
      'Device untrusted',

      device

    });





  }catch(error){

    next(error);

  }

}






/*
=========================================================
LOGOUT ALL DEVICES
=========================================================
*/

async function logoutAllDevices(req,res,next){

  try{


    await DeviceSession.updateMany(

      {

        user:req.user._id

      },

      {

        $set:{

          trusted:false

        }

      }

    );




    res.json({

      success:true,

      message:
      'All devices have been logged out'

    });





  }catch(error){

    next(error);

  }

}






module.exports = {


  getDevices,

  removeDevice,

  trustDevice,

  untrustDevice,

  logoutAllDevices


};