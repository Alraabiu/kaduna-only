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

module.exports = {

  dashboard,

  trips,

  drivers,

  withdrawals

};