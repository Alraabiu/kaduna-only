const User = require('../models/User');
const Trip = require('../models/Trip');
const DriverProfile = require('../models/DriverProfile');
const Wallet = require('../models/Wallet');

const { refundRiderWallet } =
  require('../services/tripPaymentService');

const { PRICING, LOCATIONS } =
  require('../utils/pricing');

const {
  flatCommission
} =
  require('../services/platformCommissionService');

const {
  getPricingConfig,
  updatePricingConfig
} =
  require('../services/pricingConfigService');


const activeStatuses = [
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'TRIP_STARTED'
];


/* =========================================================
   ADMIN DASHBOARD
========================================================= */

async function dashboard(req,res,next){

  try{

    const now=new Date();

    const startToday=new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const startMonth=new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );


    const[
      users,
      riders,
      drivers,
      totalTrips,
      activeTrips,
      completedTrips,
      cancelledTrips,
      pendingDrivers,
      onlineDrivers,
      grossFare,
      platformRevenue,
      todayRevenue,
      monthRevenue,
      dueCommission,
      recentTrips
    ]=await Promise.all([

      User.countDocuments(),

      User.countDocuments({
        role:'rider'
      }),

      User.countDocuments({
        role:'driver'
      }),

      Trip.countDocuments(),

      Trip.countDocuments({
        status:{
          $in:activeStatuses
        }
      }),

      Trip.countDocuments({
        status:'TRIP_COMPLETED'
      }),

      Trip.countDocuments({
        status:'CANCELLED'
      }),

      DriverProfile.countDocuments({
        verificationStatus:'pending'
      }),

      DriverProfile.countDocuments({
        verificationStatus:'approved',
        online:true
      }),

      Trip.aggregate([
        {
          $match:{
            status:'TRIP_COMPLETED'
          }
        },
        {
          $group:{
            _id:null,
            total:{
              $sum:{
                $convert:{
                  input:'$fare',
                  to:'double',
                  onError:0,
                  onNull:0
                }
              }
            }
          }
        }
      ]),

      Trip.aggregate([
        {
          $match:{
            status:'TRIP_COMPLETED',
            commissionStatus:'collected'
          }
        },
        {
          $group:{
            _id:null,
            total:{
              $sum:{
                $convert:{
                  input:'$platformCommission',
                  to:'double',
                  onError:0,
                  onNull:0
                }
              }
            }
          }
        }
      ]),

      Trip.aggregate([
        {
          $match:{
            status:'TRIP_COMPLETED',
            commissionStatus:'collected',
            commissionCollectedAt:{
              $gte:startToday
            }
          }
        },
        {
          $group:{
            _id:null,
            total:{
              $sum:{
                $convert:{
                  input:'$platformCommission',
                  to:'double',
                  onError:0,
                  onNull:0
                }
              }
            }
          }
        }
      ]),

      Trip.aggregate([
        {
          $match:{
            status:'TRIP_COMPLETED',
            commissionStatus:'collected',
            commissionCollectedAt:{
              $gte:startMonth
            }
          }
        },
        {
          $group:{
            _id:null,
            total:{
              $sum:{
                $convert:{
                  input:'$platformCommission',
                  to:'double',
                  onError:0,
                  onNull:0
                }
              }
            }
          }
        }
      ]),

      Trip.aggregate([
        {
          $match:{
            status:'TRIP_COMPLETED',
            commissionStatus:'due'
          }
        },
        {
          $group:{
            _id:null,
            total:{
              $sum:{
                $convert:{
                  input:'$platformCommission',
                  to:'double',
                  onError:0,
                  onNull:0
                }
              }
            },
            count:{
              $sum:1
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
          createdAt:-1
        })
        .limit(8)

    ]);


    res.json({

      success:true,

      data:{

        stats:{

          users,
          riders,
          drivers,

          trips:totalTrips,

          activeTrips,
          completedTrips,
          cancelledTrips,

          pendingDrivers,
          onlineDrivers,

          grossFare:
            grossFare[0]?.total||0,

          revenue:
            platformRevenue[0]?.total||0,

          todayRevenue:
            todayRevenue[0]?.total||0,

          monthRevenue:
            monthRevenue[0]?.total||0,

          dueCommission:
            dueCommission[0]?.total||0,

          dueCommissionTrips:
            dueCommission[0]?.count||0,

          /*
           * Informational configuration value only.
           * It must never be used to calculate historical
           * trip revenue.
           */
          flatCommission:
            flatCommission()

        },

        recentTrips

      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   USERS
========================================================= */

async function users(req,res,next){

  try{

    const page=Math.max(
      1,
      Number(req.query.page)||1
    );

    const limit=Math.min(
      100,
      Math.max(
        1,
        Number(req.query.limit)||25
      )
    );

    const q={};


    if(
      req.query.role&&
      [
        'rider',
        'driver',
        'admin'
      ].includes(req.query.role)
    ){

      q.role=req.query.role;

    }


    if(
      req.query.status&&
      [
        'active',
        'suspended'
      ].includes(req.query.status)
    ){

      q.status=req.query.status;

    }


    if(req.query.search){

      const s=req.query.search.trim();

      q.$or=[

        {
          fullName:{
            $regex:s,
            $options:'i'
          }
        },

        {
          phone:{
            $regex:s,
            $options:'i'
          }
        },

        {
          email:{
            $regex:s,
            $options:'i'
          }
        }

      ];

    }


    const[
      items,
      total
    ]=await Promise.all([

      User.find(q)
        .select(
          'fullName phone email role status createdAt'
        )
        .sort({
          createdAt:-1
        })
        .skip(
          (page-1)*limit
        )
        .limit(limit),

      User.countDocuments(q)

    ]);


    res.json({

      success:true,

      data:{

        users:items,

        pagination:{
          page,
          limit,
          total,
          pages:Math.ceil(
            total/limit
          )
        }

      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   USER STATUS
========================================================= */

async function setUserStatus(req,res,next){

  try{

    const status=req.body.status;


    if(
      ![
        'active',
        'suspended'
      ].includes(status)
    ){

      return res.status(400).json({

        success:false,

        message:
          'Status must be active or suspended'

      });

    }


    if(
      String(req.params.id)===
      String(req.user._id)&&
      status==='suspended'
    ){

      return res.status(400).json({

        success:false,

        message:
          'You cannot suspend your own admin account'

      });

    }


    const user=
      await User.findByIdAndUpdate(

        req.params.id,

        {
          $set:{
            status
          }
        },

        {
          new:true,
          runValidators:true
        }

      ).select(
        'fullName phone email role status createdAt'
      );


    if(!user){

      return res.status(404).json({

        success:false,

        message:'User not found'

      });

    }


    if(
      user.role==='driver'&&
      status==='suspended'
    ){

      await DriverProfile.findOneAndUpdate(

        {
          user:user._id
        },

        {
          $set:{
            online:false,
            verificationStatus:'suspended'
          }
        }

      );

    }


    res.json({

      success:true,

      message:
        `Account ${status}`,

      data:{
        user
      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   DRIVERS
========================================================= */

async function drivers(req,res,next){

  try{

    const q={};


    if(req.query.status){

      q.verificationStatus=
        req.query.status;

    }


    if(req.query.online==='true'){

      q.online=true;

    }


    if(req.query.online==='false'){

      q.online=false;

    }


    const items=
      await DriverProfile.find(q)

        .populate(
          'user',
          'fullName phone email role status createdAt'
        )

        .sort({
          createdAt:-1
        });


    res.json({

      success:true,

      data:{
        drivers:items
      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   DRIVER VERIFICATION
========================================================= */

async function verifyDriver(req,res,next){

  try{

    const allowed=[
      'pending',
      'approved',
      'rejected',
      'suspended'
    ];

    const status=req.body.status;


    if(!allowed.includes(status)){

      return res.status(400).json({

        success:false,

        message:
          'Invalid verification status'

      });

    }


    const profile=
      await DriverProfile.findByIdAndUpdate(

        req.params.id,

        {
          $set:{
            verificationStatus:status,
            online:false
          }
        },

        {
          new:true,
          runValidators:true
        }

      ).populate(
        'user',
        'fullName phone email role status'
      );


    if(!profile){

      return res.status(404).json({

        success:false,

        message:
          'Driver profile not found'

      });

    }


    res.json({

      success:true,

      message:
        `Driver ${status}`,

      data:{
        profile
      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   TRIPS
========================================================= */

async function trips(req,res,next){

  try{

    const page=Math.max(
      1,
      Number(req.query.page)||1
    );

    const limit=Math.min(
      100,
      Math.max(
        1,
        Number(req.query.limit)||30
      )
    );

    const q={};


    if(req.query.status){

      q.status=req.query.status;

    }


    if(req.query.paymentMethod){

      q.paymentMethod=
        req.query.paymentMethod;

    }


    if(req.query.vehicleType){

      q.vehicleType=
        req.query.vehicleType;

    }


    const[
      items,
      total
    ]=await Promise.all([

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
          createdAt:-1
        })

        .skip(
          (page-1)*limit
        )

        .limit(limit),

      Trip.countDocuments(q)

    ]);


    res.json({

      success:true,

      data:{

        trips:items,

        pagination:{
          page,
          limit,
          total,
          pages:Math.ceil(
            total/limit
          )
        }

      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   SINGLE TRIP
========================================================= */

async function getTrip(req,res,next){

  try{

    const trip=
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


    if(!trip){

      return res.status(404).json({

        success:false,

        message:
          'Trip not found'

      });

    }


    res.json({

      success:true,

      data:{
        trip
      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   ADMIN TRIP CANCELLATION
========================================================= */

async function cancelTrip(req,res,next){

  try{

    const trip=
      await Trip.findOne({

        _id:req.params.id,

        status:{
          $in:[
            'SEARCHING_DRIVER',
            'DRIVER_ASSIGNED',
            'DRIVER_ARRIVING',
            'DRIVER_ARRIVED'
          ]
        }

      });


    if(!trip){

      return res.status(409).json({

        success:false,

        message:
          'Trip cannot be administratively cancelled at its current stage'

      });

    }


    let refunded=false;


    if(
      trip.paymentMethod==='wallet'&&
      trip.walletReservedAt&&
      !trip.walletRefundedAt
    ){

      const result=
        await refundRiderWallet(
          trip
        );

      refunded=result.refunded;

    }


    trip.status='CANCELLED';

    trip.cancelledAt=new Date();


    if(refunded){

      trip.walletRefundedAt=
        new Date();

      trip.paymentStatus=
        'refunded';

    }


    await trip.save();


    const live=
      await Trip.findById(
        trip._id
      )

      .populate(
        'rider',
        'fullName phone'
      )

      .populate(
        'driver',
        'fullName phone'
      );


    res.json({

      success:true,

      message:
        refunded
          ?'Trip cancelled by admin and wallet fare refunded'
          :'Trip cancelled by admin',

      data:{
        trip:live,
        refunded
      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   PAYMENTS
   REAL FINANCIAL SOURCE OF TRUTH
========================================================= */

async function payments(req,res,next){

  try{

    const page=Math.max(
      1,
      Number(req.query.page)||1
    );

    const limit=Math.min(
      100,
      Math.max(
        1,
        Number(req.query.limit)||30
      )
    );


    /*
     * Only completed trips are financial
     * transactions.
     */
    const q={
      status:'TRIP_COMPLETED'
    };


    if(req.query.paymentMethod){

      q.paymentMethod=
        req.query.paymentMethod;

    }


    const[
      trips,
      total,
      byMethod,
      totals
    ]=await Promise.all([


      /* ===================================================
         ACTUAL COMPLETED TRIP RECORDS
      =================================================== */

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
          completedAt:-1,
          createdAt:-1
        })

        .skip(
          (page-1)*limit
        )

        .limit(limit)

        .lean(),


      Trip.countDocuments(q),


      /* ===================================================
         PAYMENT METHOD BREAKDOWN
      =================================================== */

      Trip.aggregate([

        {
          $match:q
        },

        {
          $group:{

            _id:'$paymentMethod',

            amount:{
              $sum:{
                $convert:{
                  input:'$fare',
                  to:'double',
                  onError:0,
                  onNull:0
                }
              }
            },

            commission:{
              $sum:{
                $convert:{
                  input:'$platformCommission',
                  to:'double',
                  onError:0,
                  onNull:0
                }
              }
            },

            driverEarnings:{
              $sum:{
                $convert:{
                  input:'$driverNetEarning',
                  to:'double',
                  onError:0,
                  onNull:0
                }
              }
            },

            count:{
              $sum:1
            }

          }
        }

      ]),


      /* ===================================================
         REAL FINANCIAL TOTALS
      =================================================== */

      Trip.aggregate([

        {
          $match:q
        },

        {
          $group:{

            _id:null,


            gross:{
              $sum:{
                $convert:{
                  input:'$fare',
                  to:'double',
                  onError:0,
                  onNull:0
                }
              }
            },


            /*
             * Only commission that has actually been
             * collected counts as Kaduna Only revenue.
             */
            platformRevenue:{
              $sum:{
                $cond:[

                  {
                    $eq:[
                      '$commissionStatus',
                      'collected'
                    ]
                  },

                  {
                    $convert:{
                      input:
                        '$platformCommission',
                      to:'double',
                      onError:0,
                      onNull:0
                    }
                  },

                  0

                ]
              }
            },


            /*
             * Commission still owed by drivers.
             */
            dueCommission:{
              $sum:{
                $cond:[

                  {
                    $eq:[
                      '$commissionStatus',
                      'due'
                    ]
                  },

                  {
                    $convert:{
                      input:
                        '$platformCommission',
                      to:'double',
                      onError:0,
                      onNull:0
                    }
                  },

                  0

                ]
              }
            },


            /*
             * Actual persisted driver earnings.
             */
            driverEarnings:{
              $sum:{
                $convert:{
                  input:'$driverNetEarning',
                  to:'double',
                  onError:0,
                  onNull:0
                }
              }
            },


            /*
             * Cash fare.
             */
            cashFare:{
              $sum:{
                $cond:[

                  {
                    $eq:[
                      '$paymentMethod',
                      'cash'
                    ]
                  },

                  {
                    $convert:{
                      input:'$fare',
                      to:'double',
                      onError:0,
                      onNull:0
                    }
                  },

                  0

                ]
              }
            },


            /*
             * Wallet fare.
             */
            walletFare:{
              $sum:{
                $cond:[

                  {
                    $eq:[
                      '$paymentMethod',
                      'wallet'
                    ]
                  },

                  {
                    $convert:{
                      input:'$fare',
                      to:'double',
                      onError:0,
                      onNull:0
                    }
                  },

                  0

                ]
              }
            },


            cashTrips:{
              $sum:{
                $cond:[
                  {
                    $eq:[
                      '$paymentMethod',
                      'cash'
                    ]
                  },
                  1,
                  0
                ]
              }
            },


            walletTrips:{
              $sum:{
                $cond:[
                  {
                    $eq:[
                      '$paymentMethod',
                      'wallet'
                    ]
                  },
                  1,
                  0
                ]
              }
            },


            collectedCommissionTrips:{
              $sum:{
                $cond:[
                  {
                    $eq:[
                      '$commissionStatus',
                      'collected'
                    ]
                  },
                  1,
                  0
                ]
              }
            },


            dueCommissionTrips:{
              $sum:{
                $cond:[
                  {
                    $eq:[
                      '$commissionStatus',
                      'due'
                    ]
                  },
                  1,
                  0
                ]
              }
            }

          }
        }

      ])

    ]);


    const t=
      totals[0]||{

        gross:0,

        platformRevenue:0,

        dueCommission:0,

        driverEarnings:0,

        cashFare:0,

        walletFare:0,

        cashTrips:0,

        walletTrips:0,

        collectedCommissionTrips:0,

        dueCommissionTrips:0

      };


    /*
     * Add a normalized financial object to each
     * completed trip.
     *
     * IMPORTANT:
     * Missing database values become ZERO.
     *
     * They are NEVER replaced with the current
     * configured commission.
     */
    const payments=
      trips.map(trip=>({

        ...trip,

        financial:{

          fare:Number(
            trip.fare||0
          ),

          platformCommission:Number(
            trip.platformCommission||0
          ),

          driverNetEarning:Number(
            trip.driverNetEarning||0
          ),

          paymentMethod:
            trip.paymentMethod||
            'unknown',

          paymentStatus:
            trip.paymentStatus||
            'unknown',

          commissionStatus:
            trip.commissionStatus||
            'unknown',

          commissionCollected:
            trip.commissionStatus===
            'collected'

              ?Number(
                  trip.platformCommission||0
                )

              :0,

          commissionDue:
            trip.commissionStatus===
            'due'

              ?Number(
                  trip.platformCommission||0
                )

              :0

        }

      }));


    res.json({

      success:true,

      data:{

        payments,


        summary:{

          gross:Number(
            t.gross||0
          ),


          platformRevenue:Number(
            t.platformRevenue||0
          ),


          dueCommission:Number(
            t.dueCommission||0
          ),


          driverEarnings:Number(
            t.driverEarnings||0
          ),


          cashFare:Number(
            t.cashFare||0
          ),


          walletFare:Number(
            t.walletFare||0
          ),


          cashTrips:Number(
            t.cashTrips||0
          ),


          walletTrips:Number(
            t.walletTrips||0
          ),


          collectedCommission:Number(
            t.platformRevenue||0
          ),


          collectedCommissionTrips:Number(
            t.collectedCommissionTrips||0
          ),


          dueCommissionTrips:Number(
            t.dueCommissionTrips||0
          ),


          /*
           * CURRENT CONFIGURATION ONLY.
           *
           * This is not used to calculate any
           * historical transaction.
           */
          flatCommission:Number(
            flatCommission()||0
          ),


          currency:'NGN',


          source:
            'completed_trip_records'

        },


        byMethod,


        pagination:{

          page,

          limit,

          total,

          pages:Math.ceil(
            total/limit
          )

        }

      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   WALLETS
========================================================= */

async function wallets(req,res,next){

  try{

    const items=
      await Wallet.find()

        .populate(
          'user',
          'fullName phone role status'
        )

        .sort({
          updatedAt:-1
        })

        .limit(200);


    const totalBalance=
      items.reduce(

        (total,wallet)=>
          total+
          Number(
            wallet.balance||0
          ),

        0

      );


    res.json({

      success:true,

      data:{

        wallets:items,

        totalBalance

      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   GET PRICING CONFIGURATION
========================================================= */

async function pricing(req,res,next){

  try{

    const config=
      await getPricingConfig();


    res.json({

      success:true,

      data:{

        pricing:{

          bike:config.bike,

          keke:config.keke,

          car:config.car,

          suv:config.suv

        },


        locations:
          Object.keys(
            LOCATIONS
          ),


        platformCommission:{

          type:'flat',

          amount:Number(
            config.platformCommission||0
          ),

          currency:'NGN'

        },


        currency:'NGN',


        version:
          config.version||
          'kaduna-v1',


        note:
          'Pricing is controlled by the administrator and stored on the server.'

      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   UPDATE PRICING CONFIGURATION
========================================================= */

async function updatePricing(
  req,
  res,
  next
){

  try{

    const{
      pricing,
      platformCommission
    }=req.body||{};


    if(
      !pricing||
      typeof pricing!=='object'
    ){

      return res.status(400).json({

        success:false,

        message:
          'Pricing configuration is required'

      });

    }


    const vehicles=[
      'bike',
      'keke',
      'car',
      'suv'
    ];


    for(
      const vehicle of vehicles
    ){

      const p=
        pricing[vehicle];


      if(!p){

        return res.status(400).json({

          success:false,

          message:
            `Missing ${vehicle} pricing`

        });

      }


      const base=
        Number(p.base);

      const perKm=
        Number(p.perKm);

      const minimum=
        Number(p.minimum);

      const avgKph=
        Number(p.avgKph);


      if(

        !Number.isFinite(base)||
        base<0||

        !Number.isFinite(perKm)||
        perKm<0||

        !Number.isFinite(minimum)||
        minimum<0||

        !Number.isFinite(avgKph)||
        avgKph<=0

      ){

        return res.status(400).json({

          success:false,

          message:
            `Invalid ${vehicle} pricing values`

        });

      }


      if(minimum<base){

        return res.status(400).json({

          success:false,

          message:
            `${vehicle} minimum fare cannot be lower than base fare`

        });

      }

    }


    const commission=
      Number(
        platformCommission
      );


    if(
      !Number.isFinite(commission)||
      commission<0
    ){

      return res.status(400).json({

        success:false,

        message:
          'Invalid platform commission'

      });

    }


    const updated=
      await updatePricingConfig({

        pricing,

        platformCommission:
          commission

      });


    res.json({

      success:true,

      message:
        'Pricing configuration updated successfully',


      data:{

        pricing:{

          bike:updated.bike,

          keke:updated.keke,

          car:updated.car,

          suv:updated.suv

        },


        platformCommission:{

          type:'flat',

          amount:Number(
            updated.platformCommission||0
          ),

          currency:'NGN'

        },


        currency:'NGN',


        version:
          updated.version||
          'kaduna-v1'

      }

    });

  }catch(e){

    next(e);

  }

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports={

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

  updatePricing

};