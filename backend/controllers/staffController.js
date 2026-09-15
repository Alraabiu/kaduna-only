const User = require('../models/User');
const Trip = require('../models/Trip');
const DriverProfile = require('../models/DriverProfile');
const Wallet = require('../models/Wallet');


/*
=================================================
STAFF ACTIVE TRIPS
=================================================
*/

async function trips(req,res,next){

  try {

    const activeTrips = await Trip.find({

      status:{
        $in:[
          'SEARCHING_DRIVER',
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
          'TRIP_STARTED'
        ]
      }

    })

    .populate(
      'rider',
      'fullName phone'
    )

    .populate(
      'driver',
      'fullName phone'
    )

    .sort({
      createdAt:-1
    });


    res.json({

      success:true,

      data:{
        trips:activeTrips
      }

    });


  }catch(error){

    next(error);

  }

}

/*
=================================================
STAFF DASHBOARD
=================================================
*/

async function dashboard(req, res, next) {

  try {

    const [

      totalRiders,

      totalDrivers,

      onlineDrivers,

      activeTrips,

      completedTrips,

      pendingWithdrawals

    ] = await Promise.all([


      User.countDocuments({
        role: 'rider'
      }),


      User.countDocuments({
        role: 'driver'
      }),


      DriverProfile.countDocuments({
        online: true,
        verificationStatus: 'approved'
      }),


      Trip.countDocuments({

        status: {
          $in: [
            'SEARCHING_DRIVER',
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED',
            'TRIP_STARTED'
          ]
        }

      }),


      Trip.countDocuments({

        status: 'TRIP_COMPLETED'

      }),


      Wallet.countDocuments({

        'withdrawals.status': 'pending'

      })


    ]);


    res.json({

      success: true,

      data: {

        totalRiders,

        totalDrivers,

        onlineDrivers,

        activeTrips,

        completedTrips,

        pendingWithdrawals

      }

    });


  } catch (error) {

    next(error);

  }

}


/*
=================================================
STAFF DRIVER MANAGEMENT
=================================================
*/

async function drivers(req,res,next){

  try {

    const drivers = await DriverProfile.find()

      .populate(
        'user',
        'fullName phone email status'
      )

      .sort({
        createdAt:-1
      });


    res.json({

      success:true,

      data:{
        drivers
      }

    });


  } catch(error){

    next(error);

  }

}


/*
=================================================
STAFF DRIVER DETAILS
=================================================
*/

async function driverDetails(req,res,next){

  try{

    const driver =
      await DriverProfile.findById(
        req.params.id
      )
      .populate(
        'user',
        'fullName phone email status role'
      );


    if(!driver){

      return res.status(404).json({

        success:false,

        message:'Driver not found'

      });

    }


    res.json({

      success:true,

      data:{
        driver
      }

    });


  }catch(error){

    next(error);

  }

}



/*
=================================================
SUSPEND DRIVER
=================================================
*/

async function suspendDriver(req,res,next){

  try{


    const driver =
      await DriverProfile.findById(
        req.params.id
      );


    if(!driver){

      return res.status(404).json({

        success:false,

        message:'Driver not found'

      });

    }



    await User.findByIdAndUpdate(

      driver.user,

      {

        status:'suspended'

      }

    );


    driver.online = false;

    await driver.save();



    res.json({

      success:true,

      message:'Driver suspended'

    });



  }catch(error){

    next(error);

  }

}



/*
=================================================
ACTIVATE DRIVER
=================================================
*/

async function activateDriver(req,res,next){

  try{


    const driver =
      await DriverProfile.findById(
        req.params.id
      );


    if(!driver){

      return res.status(404).json({

        success:false,

        message:'Driver not found'

      });

    }



    await User.findByIdAndUpdate(

      driver.user,

      {

        status:'active'

      }

    );


    res.json({

      success:true,

      message:'Driver activated'

    });



  }catch(error){

    next(error);

  }

}


/*
=================================================
STAFF WITHDRAWAL MANAGEMENT
=================================================
*/

async function withdrawals(req,res,next){

  try {

    const withdrawals = await Wallet.find({

      'withdrawals.status':'pending'

    })

    .populate(
      'user',
      'fullName phone'
    )

    .sort({
      createdAt:-1
    });


    res.json({

      success:true,

      data:{
        withdrawals
      }

    });


  }catch(error){

    next(error);

  }

}

/*
=================================================
STAFF USER SEARCH
=================================================
*/

async function searchUsers(req,res,next){

  try {

    const query =
      String(req.query.q || '').trim();


    if(!query){

      return res.status(400).json({

        success:false,

        message:'Search query required'

      });

    }


    const users = await User.find({

      $or:[

        {
          fullName:{
            $regex:query,
            $options:'i'
          }
        },

        {
          phone:{
            $regex:query,
            $options:'i'
          }
        }

      ]

    })

    .select(
      'fullName phone email role status'
    )

    .limit(20);



    res.json({

      success:true,

      data:{
        users
      }

    });


  }catch(error){

    next(error);

  }

}

/*
=================================================
STAFF USER DETAILS
=================================================
*/

async function userDetails(req,res,next){

  try{


    const user = await User.findById(
      req.params.id
    )
    .select(
      'fullName phone email role status department position createdAt lastLoginAt'
    );


    if(!user){

      return res.status(404).json({

        success:false,

        message:'User not found'

      });

    }



    const trips = await Trip.find({

      $or:[

        {
          rider:req.params.id
        },

        {
          driver:req.params.id
        }

      ]

    })
    .sort({

      createdAt:-1

    })
    .limit(10);



    const wallet = await Wallet.findOne({

      user:req.params.id

    });



    res.json({

      success:true,

      data:{

        user,

        wallet,

        recentTrips:trips

      }

    });



  }catch(error){

    next(error);

  }

}


async function updateUserStatus(req,res,next){

  try{

    const {
      status
    } = req.body;


    /*
    ==============================================
    VALIDATE REQUESTED STATUS
    ==============================================
    */

    if(
      ![
        'active',
        'suspended'
      ].includes(status)
    ){

      return res.status(400).json({

        success:false,

        message:'Invalid status'

      });

    }


    /*
    ==============================================
    FIND TARGET USER
    ==============================================
    */

    const targetUser =
      await User.findById(
        req.params.id
      );


    if(!targetUser){

      return res.status(404).json({

        success:false,

        message:'User not found'

      });

    }


    /*
    ==============================================
    PROTECT PRIVILEGED ACCOUNTS
    ==============================================

    Staff user-management endpoints must not be
    used to modify administrative or other staff
    accounts.

    Privileged accounts should be managed through
    the dedicated admin system.
    ==============================================
    */

    const protectedRoles = [

      'admin',

      'staff_operations',

      'customer_support',

      'dispatcher',

      'finance'

    ];


    if(
      protectedRoles.includes(
        targetUser.role
      )
    ){

      return res.status(403).json({

        success:false,

        message:
          'Staff accounts cannot be modified through this endpoint'

      });

    }


    /*
    ==============================================
    UPDATE USER STATUS
    ==============================================
    */

    targetUser.status =
      status;


    await targetUser.save();


    return res.json({

      success:true,

      message:
        `User ${status}`,

      data:{

        user:
          targetUser

      }

    });


  }catch(error){

    next(error);

  }

}
/*
=================================================
STAFF SINGLE TRIP DETAILS
=================================================
*/

async function tripDetails(req,res,next){

  try{


    const trip = await Trip.findById(

      req.params.id

    )

    .populate(

      'rider',

      'fullName phone email'

    )

    .populate(

      'driver',

      'fullName phone email'

    );



    if(!trip){

      return res.status(404).json({

        success:false,

        message:'Trip not found'

      });

    }



    res.json({

      success:true,

      data:{

        trip

      }

    });



  }catch(error){

    next(error);

  }

}



/*
=================================================
STAFF CANCEL TRIP
=================================================
*/

async function cancelTrip(req,res,next){

  try{


    const trip = await Trip.findById(

      req.params.id

    );



    if(!trip){

      return res.status(404).json({

        success:false,

        message:'Trip not found'

      });

    }



    if(

      trip.status === 'TRIP_COMPLETED'

    ){

      return res.status(400).json({

        success:false,

        message:'Completed trip cannot be cancelled'

      });

    }



    trip.status = 'CANCELLED';


    await trip.save();



    res.json({

      success:true,

      message:'Trip cancelled successfully',

      data:{

        trip

      }

    });



  }catch(error){

    next(error);

  }

}

/*
=================================================
STAFF USER TRIP HISTORY
=================================================
*/

async function userTrips(req,res,next){

  try {

    const trips = await Trip.find({

      $or:[

        {
          rider:req.params.id
        },

        {
          driver:req.params.id
        }

      ]

    })

    .populate(
      'rider',
      'fullName phone'
    )

    .populate(
      'driver',
      'fullName phone'
    )

    .sort({

      createdAt:-1

    })

    .limit(50);



    res.json({

      success:true,

      data:{
        trips
      }

    });


  }catch(error){

    next(error);

  }

}





module.exports = {

  dashboard,

  trips,

  drivers,

  driverDetails,

  suspendDriver,

  activateDriver,

  withdrawals,

searchUsers,

userDetails,

updateUserStatus,

tripDetails,

cancelTrip,

userTrips
};