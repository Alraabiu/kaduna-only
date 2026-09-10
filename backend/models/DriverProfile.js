const mongoose = require('mongoose');


const schema = new mongoose.Schema(

  {

    /*
    ==========================================
    DRIVER ACCOUNT
    ==========================================
    */

    user: {

      type:
        mongoose.Schema.Types.ObjectId,

      ref:
        'User',

      required:
        true,

      unique:
        true,

      index:
        true

    },


    /*
    ==========================================
    DRIVER VERIFICATION
    ==========================================
    */

    verificationStatus: {

      type:
        String,

      enum: [

        'pending',

        'approved',

        'rejected',

        'suspended'

      ],

      default:
        'pending',

      index:
        true

    },


    /*
    ==========================================
    DRIVER IMAGE
    ==========================================
    */

    driverImage: {

      type:
        String,

      trim:
        true,

      default:
        ''

    },


    /*
    ==========================================
    ONLINE STATUS
    ==========================================
    */

    online: {

      type:
        Boolean,

      default:
        false,

      index:
        true

    },


    /*
    ==========================================
    LIVE LOCATION
    ==========================================
    */

    location: {

      latitude:
        Number,

      longitude:
        Number,

      accuracy:
        Number,

      updatedAt:
        Date

    },


    /*
    ==========================================
    PERFORMANCE
    ==========================================
    */

    rating: {

      type:
        Number,

      default:
        5,

      min:
        0,

      max:
        5

    },


    totalTrips: {

      type:
        Number,

      default:
        0

    },


    /*
    ==========================================
    VEHICLE INFORMATION
    ==========================================
    */

    vehicleType: {

      type:
        String,

      enum: [

        'bike',

        'keke',

        'car',

        'suv'

      ],

      default:
        'keke'

    },


    vehicleMake: {

      type:
        String,

      trim:
        true,

      default:
        ''

    },


    vehicleModel: {

      type:
        String,

      trim:
        true,

      default:
        ''

    },


    vehicleColor: {

      type:
        String,

      trim:
        true,

      default:
        ''

    },


    plateNumber: {

      type:
        String,

      trim:
        true,

      uppercase:
        true,

      default:
        ''

    },


    /*
    ==========================================
    DRIVER LICENCE
    ==========================================
    */

    driverLicenceNumber: {

      type:
        String,

      trim:
        true,

      uppercase:
        true,

      default:
        ''

    },


    /*
    ==========================================
    DOCUMENT UPLOADS
    ==========================================
    */

    licenseDocument: {

      type:
        String,

      trim:
        true,

      default:
        ''

    },


    vehicleDocument: {

      type:
        String,

      trim:
        true,

      default:
        ''

    },


    identityDocument: {

      type:
        String,

      trim:
        true,

      default:
        ''

    },


    /*
==========================================
DRIVER IDENTITY SECURITY
==========================================
*/


ninVerification: {

  number: {

    type:
      String,

    trim:
      true,

    select:
      false,

    default:
      ''

  },


  verified: {

    type:
      Boolean,

    default:
      false

  },


  verifiedAt: {

    type:
      Date

  }

},



faceVerification: {

  imageUrl: {

    type:
      String,

    trim:
      true,

    default:
      ''

  },


  status: {

    type:
      String,

    enum: [

      'pending',

      'verified',

      'failed'

    ],

    default:
      'pending'

  },


  verifiedAt: {

    type:
      Date

  }

},



/*
==========================================
SECURITY TRACKING
==========================================
*/


securityProfile: {

  deviceId: {

    type:
      String,

    default:
      ''

  },


  lastFaceCheck: {

    type:
      Date

  },


  riskScore: {

    type:
      Number,

    default:
      0

  }

},

    /*
    ==========================================
    PAYMENT DETAILS
    ==========================================
    */

    payoutAccount: {

      bankName: {

        type:
          String,

        trim:
          true

      },


      accountName: {

        type:
          String,

        trim:
          true

      },


      accountNumber: {

        type:
          String,

        trim:
          true

      }

    }


  },


  {

    timestamps:
      true

  }

);



module.exports =
  mongoose.model(
    'DriverProfile',
    schema
  );