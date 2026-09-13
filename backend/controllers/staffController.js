const User = require('../models/User');
const Trip = require('../models/Trip');
const DriverProfile = require('../models/DriverProfile');
const Wallet = require('../models/Wallet');


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



module.exports = {

  dashboard

};