const DeviceSession =
require('../models/DeviceSession');

const LoginHistory =
require('../models/LoginHistory');

const SecurityAlert =
require('../models/SecurityAlert');



/*
=========================================================
GET LOGIN HISTORY
=========================================================
*/

async function getLoginHistory(req,res,next){

  try{


    const history =

      await LoginHistory.find({

        user:req.user._id

      })

      .sort({

        createdAt:-1

      })

      .limit(50)

      .select(

        'deviceId deviceName platform ipAddress status createdAt userAgent'

      );



    res.json({

      success:true,

      count:
        history.length,

      history

    });



  }catch(error){

    next(error);

  }

}






/*
=========================================================
GET SECURITY ALERTS
=========================================================
*/

async function getAlerts(req,res,next){

  try{


    const alerts =

      await SecurityAlert.find({

        user:req.user._id

      })

      .sort({

        createdAt:-1

      })

      .limit(50)

      .select(

        'type message deviceId ipAddress resolved createdAt userAgent'

      );




    res.json({

      success:true,

      count:
        alerts.length,

      alerts

    });



  }catch(error){

    next(error);

  }

}






/*
=========================================================
RESOLVE SECURITY ALERT
=========================================================
*/

async function resolveAlert(req,res,next){

  try{


    const alert =

      await SecurityAlert.findOneAndUpdate(

        {

          _id:req.params.id,

          user:req.user._id

        },


        {

          $set:{

            resolved:true

          }

        },


        {

          returnDocument:'after'

        }

      );




    if(!alert){

      return res.status(404).json({

        success:false,

        message:
          'Security alert not found'

      });

    }




    res.json({

      success:true,

      message:
        'Security alert resolved',

      alert

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

        'deviceId deviceName platform trusted lastActiveAt createdAt ipAddress userAgent'

      );




    res.json({

      success:true,

      count:
        devices.length,

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

            lastActiveAt:
              new Date()

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

  logoutAllDevices,

  getLoginHistory,

  getAlerts,

  resolveAlert


};