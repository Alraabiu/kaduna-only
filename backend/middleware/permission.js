const User = require('../models/User');


/*
=================================================
PERMISSION CHECK MIDDLEWARE
=================================================
*/


function requirePermission(permission){


  return async function(req,res,next){


    try{


      const user = await User.findById(
        req.user._id
      );


      if(!user){

        return res.status(401).json({

          success:false,

          message:'User not found'

        });

      }



      if(

        user.role === 'admin'

      ){

        return next();

      }



      const allowed =

        user.permissions &&
        user.permissions.includes(permission);



      if(!allowed){

        return res.status(403).json({

          success:false,

          message:
            'You do not have permission for this action'

        });

      }



      next();


    }catch(error){

      next(error);

    }


  };


}



module.exports = requirePermission;