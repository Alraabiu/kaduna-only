const DeviceSession = require('../models/DeviceSession');



async function getDevices(req,res,next){

  try{

    const devices =
      await DeviceSession.find({
        user:req.user._id
      })
      .sort({
        lastActiveAt:-1
      });



    res.json({

      success:true,

      devices

    });


  }catch(error){

    next(error);

  }

}





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

        message:'Device not found'

      });

    }



    res.json({

      success:true,

      message:'Device removed successfully'

    });



  }catch(error){

    next(error);

  }

}






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
        'All devices logged out successfully'

    });



  }catch(error){

    next(error);

  }

}





module.exports = {

  getDevices,

  removeDevice,

  logoutAllDevices

};