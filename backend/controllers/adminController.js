const User = require('../models/User');
const Trip = require('../models/Trip');
const DriverProfile = require('../models/DriverProfile');
const Wallet = require('../models/Wallet');
const Payment = require('../models/Payment');

const Withdrawal = require('../models/Withdrawal');

const {
  refundRiderWallet
} = require('../services/tripPaymentService');

const {
  getPricingConfig,
  updatePricingConfig
} = require('../services/pricingConfigService');


/*
=========================================================
ACTIVE TRIP STATUSES
=========================================================
*/

const activeStatuses = [
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'TRIP_STARTED'
];


/*
=========================================================
ADMIN DASHBOARD
=========================================================
*/

async function dashboard(
  req,
  res,
  next
) {

  try {

    const [
      users,
      riders,
      drivers,
      staffOperations,
      totalTrips,
      activeTrips,
      completedTrips,
      cancelledTrips,
      pendingDrivers,
      onlineDrivers,
      grossFare,
      recentTrips,
      pendingWithdrawals
    ] = await Promise.all([

      User.countDocuments(),

      User.countDocuments({
        role: 'rider'
      }),

      User.countDocuments({
        role: 'driver'
      }),

      User.countDocuments({
        role: 'staff_operations'
      }),

      Trip.countDocuments(),

      Trip.countDocuments({
        status: {
          $in: activeStatuses
        }
      }),

      Trip.countDocuments({
        status: 'TRIP_COMPLETED'
      }),

      Trip.countDocuments({
        status: 'CANCELLED'
      }),

      DriverProfile.countDocuments({
        verificationStatus: 'pending'
      }),

      DriverProfile.countDocuments({
        verificationStatus: 'approved',
        online: true
      }),

      Trip.aggregate([

        {
          $match: {
            status: 'TRIP_COMPLETED'
          }
        },

        {
          $group: {
            _id: null,

            total: {
              $sum: {
                $convert: {
                  input: '$fare',
                  to: 'double',
                  onError: 0,
                  onNull: 0
                }
              }
            }
          }
        }

      ]),

      Trip.find()

        .populate(
          'rider',
          'fullName phone'
        )

        .populate(
          'driver',
          'fullName phone'
        )

        .sort({
          createdAt: -1
        })

        .limit(8),

      Withdrawal.countDocuments({
        status: {
          $in: [
            'pending',
            'approved'
          ]
        }
      })

    ]);


    return res.json({

      success: true,

      data: {

        stats: {

          users,

          riders,

          drivers,

          staffOperations,

          trips:
            totalTrips,

          activeTrips,

          completedTrips,

          cancelledTrips,

          pendingDrivers,

          onlineDrivers,

          grossFare:
            grossFare[0]?.total || 0,

          pendingWithdrawals

        },

        recentTrips

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
USERS
=========================================================
*/

async function users(
  req,
  res,
  next
) {

  try {

    const page =
      Math.max(
        1,
        Number(req.query.page) || 1
      );


    const limit =
      Math.min(
        100,
        Math.max(
          1,
          Number(req.query.limit) || 25
        )
      );


    const q = {};


    /*
    -------------------------------------------------------
    ROLE FILTER
    -------------------------------------------------------
    */

    if (

      [
        'rider',
        'driver',
        'admin',
        'staff_operations'
      ].includes(
        req.query.role
      )

    ) {

      q.role =
        req.query.role;

    }


    /*
    -------------------------------------------------------
    STATUS FILTER
    -------------------------------------------------------
    */

    if (

      [
        'active',
        'suspended'
      ].includes(
        req.query.status
      )

    ) {

      q.status =
        req.query.status;

    }


    /*
    -------------------------------------------------------
    SEARCH
    -------------------------------------------------------
    */

    if (
      req.query.search
    ) {

      const search =
        String(
          req.query.search
        ).trim();


      if (search) {

        q.$or = [

          {
            fullName:
              new RegExp(
                search,
                'i'
              )
          },

          {
            phone:
              new RegExp(
                search,
                'i'
              )
          },

          {
            email:
              new RegExp(
                search,
                'i'
              )
          }

        ];

      }

    }


    const [
      items,
      total
    ] = await Promise.all([

      User.find(q)

        .select(
          'fullName phone email role status createdAt'
        )

        .sort({
          createdAt: -1
        })

        .skip(
          (page - 1) * limit
        )

        .limit(limit),

      User.countDocuments(q)

    ]);


    return res.json({

      success: true,

      data: {

        users:
          items,

        total,

        page,

        limit,

        pages:
          Math.ceil(
            total / limit
          )

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
CHANGE USER STATUS
=========================================================
*/

async function setUserStatus(
  req,
  res,
  next
) {

  try {

    const status =
      req.body.status;


    if (
      ![
        'active',
        'suspended'
      ].includes(status)
    ) {

      return res.status(400).json({

        success: false,

        message:
          'Invalid account status'

      });

    }


    /*
    -------------------------------------------------------
    PREVENT ADMIN FROM SUSPENDING THEMSELVES
    -------------------------------------------------------
    */

    if (
      String(req.params.id) ===
      String(req.user._id)
    ) {

      return res.status(400).json({

        success: false,

        message:
          'You cannot change your own account status'

      });

    }


    const user =
      await User.findByIdAndUpdate(

        req.params.id,

        {
          $set: {
            status
          }
        },

        {
          new: true
        }

      ).select(
        'fullName phone email role status'
      );


    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          'User not found'

      });

    }


    /*
    -------------------------------------------------------
    DRIVER SUSPENSION
    -------------------------------------------------------
    */

    if (

      user.role === 'driver' &&
      status === 'suspended'

    ) {

      await DriverProfile.updateOne(

        {
          user:
            user._id
        },

        {
          $set: {

            online: false,

            verificationStatus:
              'suspended'

          }
        }

      );

    }


    return res.json({

      success: true,

      message:
        `Account ${status}`,

      data: {

        user

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
DRIVERS
=========================================================
*/

async function drivers(
  req,
  res,
  next
) {

  try {

    const q = {};


    if (

      [
        'pending',
        'approved',
        'rejected',
        'suspended'
      ].includes(
        req.query.status
      )

    ) {

      q.verificationStatus =
        req.query.status;

    }


    if (
      req.query.online === 'true'
    ) {

      q.online = true;

    }


    if (
      req.query.online === 'false'
    ) {

      q.online = false;

    }


    const items =
  await DriverProfile.find(q)

    .populate(
      {
        path: 'user',
        select:
          'fullName phone email role status createdAt'
      }
    )

    .select(
      `
      user
      verificationStatus
      driverImage
      vehicleType
      vehicleMake
      vehicleModel
      vehicleColor
      plateNumber
      driverLicenceNumber
      licenseDocument
      vehicleDocument
      identityDocument
      rating
      totalTrips
      online
      createdAt
      `
    )

    .sort({
      createdAt: -1
    });


    return res.json({

      success: true,

      data: {

        drivers:
          items

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
VERIFY DRIVER
=========================================================
*/

async function verifyDriver(
  req,
  res,
  next
) {

  try {

    const status =
      req.body.status;


    if (

      ![
        'pending',
        'approved',
        'rejected',
        'suspended'
      ].includes(status)

    ) {

      return res.status(400).json({

        success:false,

        message:
          'Invalid verification status'

      });

    }


    const existingProfile =
      await DriverProfile.findById(
        req.params.id
      );


    if (!existingProfile) {

      return res.status(404).json({

        success:false,

        message:
          'Driver profile not found'

      });

    }


    /*
    -------------------------------------------------------
    REQUIRE DRIVER DOCUMENTS BEFORE APPROVAL
    -------------------------------------------------------
    */

    if (
      status === 'approved'
    ) {


      const missingFields = [];


      if (
        !existingProfile.plateNumber
      ) {

        missingFields.push(
          'plate number'
        );

      }


      if (
        !existingProfile.vehicleMake
      ) {

        missingFields.push(
          'vehicle make'
        );

      }


      if (
        !existingProfile.driverLicenceNumber
      ) {

        missingFields.push(
          'driver licence number'
        );

      }


      if (
        !existingProfile.driverImage
      ) {

        missingFields.push(
          'driver image'
        );

      }


      if (
        missingFields.length > 0
      ) {

        return res.status(400).json({

          success:false,

          message:
            `Driver cannot be approved. Missing: ${missingFields.join(', ')}`

        });

      }

    }


    /*
=========================================================
CREATE STAFF ACCOUNT
=========================================================
*/

async function createStaff(
  req,
  res,
  next
){

try{


const {
  fullName,
  phone,
  email,
  password,
  role
}=req.body;

const User =
require('../models/User');



const exists =
await User.findOne({

$or:[
{
 phone
},
{
 email
}
]

});



if(exists){

return res.status(400).json({

success:false,

message:
'User already exists'

});

}



const bcrypt =
require('bcryptjs');


const hashed =
await bcrypt.hash(
password,
12
);


const staff =

await User.create({

fullName,

phone,

email,

passwordHash:

hashed,

role,

status:

'active'

});


return res.status(201).json({

success:true,

message:
'Staff account created',

data:{
staff
}

});


}
catch(error){

next(error);

}

}


    /*
    -------------------------------------------------------
    UPDATE DRIVER STATUS
    -------------------------------------------------------
    */

    const profile =
      await DriverProfile.findByIdAndUpdate(

        req.params.id,

        {

          $set: {

            verificationStatus:
              status,

            online:
              false

          }

        },

        {

          new:true,

          runValidators:true

        }

      )

      .populate(

        'user',

        'fullName phone email role status'

      );



    return res.json({

      success:true,

      message:
        `Driver ${status}`,

      data:{

        profile

      }

    });



  } catch(error) {

    next(error);

  }

}
/*
TRIPS
*/

async function trips(
  req,
  res,
  next
) {

  try {

    const page =
      Math.max(
        1,
        Number(req.query.page) || 1
      );


    const limit =
      Math.min(
        100,
        Math.max(
          1,
          Number(req.query.limit) || 30
        )
      );


    const q = {};


    if (
      req.query.status
    ) {

      q.status =
        req.query.status;

    }


    if (
      req.query.paymentMethod
    ) {

      q.paymentMethod =
        req.query.paymentMethod;

    }


    if (
      req.query.vehicleType
    ) {

      q.vehicleType =
        req.query.vehicleType;

    }


    const [
      items,
      total
    ] = await Promise.all([

      Trip.find(q)

        .populate(
          'rider',
          'fullName phone'
        )

        .populate(
          'driver',
          'fullName phone'
        )

        .sort({
          createdAt: -1
        })

        .skip(
          (page - 1) * limit
        )

        .limit(limit),

      Trip.countDocuments(q)

    ]);


    return res.json({

      success: true,

      data: {

        trips:
          items,

        total,

        page,

        limit,

        pages:
          Math.ceil(
            total / limit
          )

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
GET SINGLE TRIP
=========================================================
*/

async function getTrip(
  req,
  res,
  next
) {

  try {

    const trip =
      await Trip.findById(
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


    if (!trip) {

      return res.status(404).json({

        success: false,

        message:
          'Trip not found'

      });

    }


    return res.json({

      success: true,

      data: {

        trip

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
CANCEL TRIP
=========================================================
*/

async function cancelTrip(
  req,
  res,
  next
) {

  try {

    const trip =
      await Trip.findOne({

        _id:
          req.params.id,

        status: {
          $in:
            activeStatuses
        }

      });


    if (!trip) {

      return res.status(409).json({

        success: false,

        message:
          'Trip cannot be cancelled at its current stage'

      });

    }


    /*
    -------------------------------------------------------
    WALLET REFUND
    -------------------------------------------------------
    */

    if (

      trip.paymentMethod === 'wallet' &&

      trip.walletReservedAt &&

      !trip.walletRefundedAt

    ) {

      const result =
        await refundRiderWallet(
          trip
        );


      if (
        result.refunded
      ) {

        trip.walletRefundedAt =
          new Date();

        trip.paymentStatus =
          'refunded';

      }

    }


    trip.status =
      'CANCELLED';


    trip.cancelledAt =
      new Date();


    await trip.save();


    return res.json({

      success: true,

      message:
        'Trip cancelled',

      data: {

        trip

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
PAYMENTS
=========================================================
*/

async function payments(
  req,
  res,
  next
) {

  try {

    const [
      payments,
      byMethod
    ] = await Promise.all([

      Trip.find({

        status:
          'TRIP_COMPLETED'

      })

        .populate(
          'rider',
          'fullName'
        )

        .populate(
          'driver',
          'fullName'
        )

        .sort({
          completedAt: -1
        })

        .limit(200)

        .lean(),

      Trip.aggregate([

        {
          $match: {
            status:
              'TRIP_COMPLETED'
          }
        },

        {
          $group: {

            _id:
              '$paymentMethod',

            amount: {
              $sum:
                '$fare'
            },

            count: {
              $sum:
                1
            }

          }
        }

      ])

    ]);


    return res.json({

      success: true,

      data: {

        payments,

        summary: {

          gross:
            payments.reduce(
              (
                sum,
                item
              ) =>
                sum +
                Number(
                  item.fare || 0
                ),

              0
            ),

          byMethod

        }

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
WALLETS
=========================================================
*/

async function wallets(
  req,
  res,
  next
) {

  try {

    const wallets =
      await Wallet.find()

        .populate(
          'user',
          'fullName phone role'
        )

        .sort({
          updatedAt: -1
        })

        .limit(250);


    return res.json({

      success: true,

      data: {

        wallets

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
PRICING
=========================================================
*/

async function pricing(
  req,
  res,
  next
) {

  try {

    const config =
      await getPricingConfig();


    const {
      key,
      version,
      createdAt,
      updatedAt,
      ...pricing
    } = config;


    return res.json({

      success: true,

      data: {

        pricing,

        version,

        currency:
          'NGN',

        updatedAt

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
UPDATE PRICING
=========================================================
*/

async function updatePricing(
  req,
  res,
  next
) {

  try {

    const updated =
      await updatePricingConfig({

        pricing:
          req.body.pricing

      });


    const {
      key,
      version,
      createdAt,
      updatedAt,
      ...pricing
    } = updated;


    return res.json({

      success: true,

      message:
        'Pricing updated',

      data: {

        pricing,

        version,

        currency:
          'NGN',

        updatedAt

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
STAFF OPERATIONS
=========================================================
*/

/*
 * Return Staff Operations accounts.
 *
 * ADMIN ONLY.
 */

async function staff(
  req,
  res,
  next
) {

  try {

    const page =
      Math.max(
        1,
        Number(req.query.page) || 1
      );



    const limit =
      Math.min(
        100,
        Math.max(
          1,
          Number(req.query.limit) || 25
        )
      );


    const q = {

      role:
        'staff_operations'

    };


    if (

      [
        'active',
        'suspended'
      ].includes(
        req.query.status
      )

    ) {

      q.status =
        req.query.status;

    }


    if (
      req.query.search
    ) {

      const search =
        String(
          req.query.search
        ).trim();


      if (search) {

        q.$or = [

          {
            fullName:
              new RegExp(
                search,
                'i'
              )
          },

          {
            phone:
              new RegExp(
                search,
                'i'
              )
          },

          {
            email:
              new RegExp(
                search,
                'i'
              )
          }

        ];

      }

    }


    const [
      items,
      total
    ] = await Promise.all([

      User.find(q)

        .select(
          'fullName phone email role status createdAt updatedAt'
        )

        .sort({
          createdAt: -1
        })

        .skip(
          (page - 1) * limit
        )

        .limit(limit),

      User.countDocuments(q)

    ]);


    return res.json({

      success: true,

      data: {

        staff:
          items,

        total,

        page,

        limit,

        pages:
          Math.ceil(
            total / limit
          )

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
CREATE STAFF ACCOUNT
=========================================================
*/

async function createStaff(
  req,
  res,
  next
){

try{


const {
  fullName,
  phone,
  email,
  password,
  role
}=req.body;



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



const User =
require('../models/User');



const existing =
await User.findOne({
phone
});



if(existing){

return res.status(400).json({

success:false,

message:
'User already exists'

});

}



const bcrypt =
require('bcryptjs');



const hashedPassword =
await bcrypt.hash(
password,
12
);



const allowedRoles = [

  'staff_operations',
  'customer_support',
  'dispatcher',
  'finance'

];


const staffRole =
allowedRoles.includes(role)

?
role

:
'staff_operations';



const user =
await User.create({

fullName,

phone,

email,

passwordHash:
hashedPassword,

role:
staffRole,

status:
'active'

});


return res.json({

success:true,

message:
'Staff account created successfully',

data:{
user
}

});


}
catch(error){

next(error);

}

}

/*
=========================================================
SET STAFF STATUS
=========================================================
*/

async function setStaffStatus(
  req,
  res,
  next
) {

  try {

    const status =
      req.body.status;


    if (

      ![
        'active',
        'suspended'
      ].includes(status)

    ) {

      return res.status(400).json({

        success: false,

        message:
          'Invalid staff account status'

      });

    }


    const staffUser =
      await User.findOne({

        _id:
          req.params.id,

        role:
          'staff_operations'

      });


    if (!staffUser) {

      return res.status(404).json({

        success: false,

        message:
          'Staff Operations account not found'

      });

    }


    staffUser.status =
      status;


    await staffUser.save();


    return res.json({

      success: true,

      message:
        `Staff Operations account ${status}`,

      data: {

        user: {

          _id:
            staffUser._id,

          fullName:
            staffUser.fullName,

          phone:
            staffUser.phone,

          email:
            staffUser.email,

          role:
            staffUser.role,

          status:
            staffUser.status

        }

      }

    });

  } catch (e) {

    next(e);

  }

}


/*
=========================================================
EXPORTS
=========================================================
*/

module.exports = {

  dashboard,

  users,

  setUserStatus,

  drivers,

  verifyDriver,

  trips,

  getTrip,

  cancelTrip,

  payments,

  wallets,

  pricing,

  updatePricing,

  staff,

  setStaffStatus,

  createStaff,

};