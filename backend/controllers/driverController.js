const DriverProfile = require('../models/DriverProfile');
const Trip = require('../models/Trip');
const Wallet = require('../models/Wallet');

const {
  emitDriverLocation
} = require('../realtime');


/*
=========================================================
ACTIVE TRIP STATUSES
=========================================================

A trip remains active until it reaches:

    TRIP_COMPLETED
    CANCELLED

COMPLETION_REQUESTED remains active deliberately.
=========================================================
*/

const activeStatuses = [

  'DRIVER_ASSIGNED',

  'DRIVER_ARRIVING',

  'DRIVER_ARRIVED',

  'TRIP_STARTED',

  'COMPLETION_REQUESTED'

];


/*
=========================================================
IDENTITY CONSTANTS
=========================================================
*/

const faceVerificationStatuses = [

  'pending',

  'verified',

  'failed'

];


/*
=========================================================
NIN VALIDATION
=========================================================

Nigeria NIN is expected to contain 11 digits.

This validates FORMAT only.

It does NOT claim that the NIN belongs to the driver.

Actual NIN verification should eventually be performed
through an authorized identity-verification provider.
=========================================================
*/

function normalizeNIN(value) {

  return String(
    value || ''
  )
    .replace(/\s+/g, '')
    .trim();

}


function isValidNIN(nin) {

  return /^\d{11}$/.test(
    nin
  );

}


/*
=========================================================
FACE IMAGE VALIDATION
=========================================================

At this stage we accept a secure image URL/reference.

We do NOT automatically mark the face as verified.

Actual biometric/liveness verification should be performed
by an authorized verification service.
=========================================================
*/

function isValidFaceImage(value) {

  if (
    typeof value !== 'string'
  ) {

    return false;

  }


  const image =
    value.trim();


  if (!image) {

    return false;

  }


  /*
  Accept normal URL paths and secure storage references.
  */

  return (
    image.startsWith('http://') ||
    image.startsWith('https://') ||
    image.startsWith('/') ||
    image.startsWith('uploads/')
  );

}


/*
=========================================================
GET CURRENT DRIVER PROFILE
=========================================================
*/

async function getMe(
  req,
  res,
  next
) {

  try {

    const profile =
      await DriverProfile.findOne({

        user:
          req.user._id

      })

      .populate(

        'user',

        'fullName phone email role status'

      );


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    return res.json({

      success: true,

      data: {

        profile

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
DRIVER DASHBOARD
=========================================================
*/

async function dashboard(
  req,
  res,
  next
) {

  console.log(

    '[DRIVER DASHBOARD USER]',

    {

      id:
        req.user._id,

      type:
        typeof req.user._id

    }

  );


  try {

    /*
    -------------------------------------------------------
    DRIVER PROFILE
    -------------------------------------------------------
    */

    const profile =
      await DriverProfile.findOne({

        user:
          req.user._id

      })

      .populate(

        'user',

        'fullName phone email role status'

      );


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    /*
    -------------------------------------------------------
    LOAD DASHBOARD DATA
    -------------------------------------------------------
    */

    const [

      wallet,

      activeTrip,

      completedTrips,

      recentTrips

    ] = await Promise.all([


      Wallet.findOne({

        user:
          req.user._id

      }),


      Trip.findOne({

        driver:
          req.user._id,

        status: {

          $in:
            activeStatuses

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

        createdAt:
          -1

      }),


      Trip.countDocuments({

        driver:
          req.user._id,

        status:
          'TRIP_COMPLETED'

      }),


      Trip.find({

        driver:
          req.user._id

      })

      .populate(

        'rider',

        'fullName phone'

      )

      .sort({

        createdAt:
          -1

      })

      .limit(5)

    ]);


    /*
    -------------------------------------------------------
    DRIVER COMPLETION STATE
    -------------------------------------------------------
    */

    const riderArrivalConfirmed =
      activeTrip?.riderArrivalConfirmed === true;


    const canComplete =
      Boolean(

        activeTrip &&

        activeTrip.status ===
          'TRIP_STARTED' &&

        riderArrivalConfirmed &&

        String(

          activeTrip.arrivalStatus || ''

        ).toLowerCase() ===
          'rider_confirmed'

      );


    return res.json({

      success: true,

      data: {

        profile,

        wallet: {

          balance:
            wallet?.balance || 0

        },

        activeTrip:
          activeTrip || null,

        riderArrivalConfirmed,

        canComplete,

        completedTrips,

        recentTrips

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
UPDATE DRIVER PROFILE
=========================================================
*/

async function updateMe(
  req,
  res,
  next
) {

  try {

    const fields = [

      'vehicleType',

      'vehicleMake',

      'vehicleModel',

      'vehicleColor',

      'plateNumber',

      'driverLicenceNumber',

      'driverImage'

    ];


    const updates = {};


    /*
    -------------------------------------------------------
    COPY ONLY ALLOWED FIELDS
    -------------------------------------------------------
    */

    for (
      const field of fields
      ) {

      if (
        req.body[field] !== undefined
      ) {

        updates[field] =

          typeof req.body[field] === 'string'

            ?

            req.body[field].trim()

            :

            req.body[field];

      }

    }


    /*
    -------------------------------------------------------
    FORMAT SPECIAL FIELDS
    -------------------------------------------------------
    */

    if (
      updates.plateNumber
    ) {

      updates.plateNumber =
        String(

          updates.plateNumber

        )
          .toUpperCase();

    }


    if (
      updates.driverLicenceNumber
    ) {

      updates.driverLicenceNumber =
        String(

          updates.driverLicenceNumber

        )
          .toUpperCase();

    }


    /*
    -------------------------------------------------------
    CLEAN DRIVER DATA
    -------------------------------------------------------
    */

    if (
      updates.vehicleType === ''
    ) {

      delete updates.vehicleType;

    }


    Object.keys(
      updates
    ).forEach(

      key => {

        if (

          updates[key] === undefined ||

          updates[key] === null ||

          updates[key] === ''

        ) {

          delete updates[key];

        }

      }

    );


    /*
    -------------------------------------------------------
    NORMALIZE VEHICLE TYPE
    -------------------------------------------------------
    */

    if (
      updates.vehicleType
    ) {

      updates.vehicleType =
        String(

          updates.vehicleType

        )
          .trim()
          .toLowerCase();

    }


    /*
    -------------------------------------------------------
    UPDATE PROFILE
    -------------------------------------------------------
    */

    const profile =
      await DriverProfile.findOneAndUpdate(

        {

          user:
            req.user._id

        },

        {

          $set:
            updates

        },

        {

          returnDocument:
            'after',

          runValidators:
            true

        }

      )

      .populate(

        'user',

        'fullName phone email role status'

      );


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    return res.json({

      success: true,

      message:
        'Driver profile updated successfully',

      data: {

        profile

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
SET DRIVER ONLINE / OFFLINE
=========================================================
*/

async function setOnline(
  req,
  res,
  next
) {

  try {

    const online =
      !!req.body.online;


    /*
    -------------------------------------------------------
    FIND DRIVER
    -------------------------------------------------------
    */

    const profile =
      await DriverProfile.findOne({

        user:
          req.user._id

      });


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    /*
    -------------------------------------------------------
    APPROVAL CHECK
    -------------------------------------------------------
    */

    if (

      String(

        profile.verificationStatus || ''

      ).toLowerCase() !==
      'approved'

    ) {

      return res.status(403).json({

        success: false,

        message:
          'Driver must be approved before going online'

      });

    }


    /*
    -------------------------------------------------------
    IDENTITY SECURITY CHECK
    -------------------------------------------------------

    A driver must eventually have:

        NIN verified
        Face verified

    before going online.

    This is intentionally enforced here.

    Existing drivers that have not completed the new
    identity process will therefore need verification.
    -------------------------------------------------------
    */

    if (online) {

      const ninVerified =
        profile.ninVerification?.verified === true;


      const faceVerified =
        profile.faceVerification?.status ===
        'verified';


      if (
        !ninVerified ||
        !faceVerified
      ) {

        return res.status(403).json({

          success: false,

          code:
            'IDENTITY_VERIFICATION_REQUIRED',

          message:
            'Identity verification is required before you can go online',

          data: {

            ninVerified,

            faceVerified

          }

        });

      }

    }


    /*
    -------------------------------------------------------
    PREVENT OFFLINE DURING ACTIVE TRIP
    -------------------------------------------------------
    */

    if (!online) {

      const active =
        await Trip.exists({

          driver:
            req.user._id,

          status: {

            $in:
              activeStatuses

          }

        });


      if (active) {

        return res.status(409).json({

          success: false,

          message:
            'You cannot go offline during an active trip'

        });

      }

    }


    /*
    -------------------------------------------------------
    SAVE ONLINE STATUS
    -------------------------------------------------------
    */

    profile.online =
      online;


    await profile.save();


    return res.json({

      success: true,

      data: {

        online:
          profile.online

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
DRIVER LOCATION
=========================================================
*/

async function location(
  req,
  res,
  next
) {

  try {

    const latitude =
      Number(
        req.body.latitude
      );


    const longitude =
      Number(
        req.body.longitude
      );


    const accuracy =
      req.body.accuracy == null

        ? undefined

        : Number(
            req.body.accuracy
          );


    /*
    -------------------------------------------------------
    VALIDATE LATITUDE
    -------------------------------------------------------
    */

    if (

      !Number.isFinite(
        latitude
      )

      ||

      latitude < -90

      ||

      latitude > 90

    ) {

      return res.status(400).json({

        success: false,

        message:
          'Valid latitude and longitude are required'

      });

    }


    /*
    -------------------------------------------------------
    VALIDATE LONGITUDE
    -------------------------------------------------------
    */

    if (

      !Number.isFinite(
        longitude
      )

      ||

      longitude < -180

      ||

      longitude > 180

    ) {

      return res.status(400).json({

        success: false,

        message:
          'Valid latitude and longitude are required'

      });

    }


    /*
    -------------------------------------------------------
    UPDATE DRIVER LOCATION
    -------------------------------------------------------
    */

    const profile =
      await DriverProfile.findOneAndUpdate(

        {

          user:
            req.user._id,

          verificationStatus:
            'approved'

        },

        {

          $set: {

            location: {

              latitude,

              longitude,

              accuracy,

              updatedAt:
                new Date()

            }

          }

        },

        {

          returnDocument:
            'after'

        }

      );


    if (!profile) {

      return res.status(403).json({

        success: false,

        message:
          'Approved driver profile required'

      });

    }


    /*
    -------------------------------------------------------
    FIND ACTIVE TRIP
    -------------------------------------------------------
    */

    const activeTrip =
      await Trip.findOne({

        driver:
          req.user._id,

        status: {

          $in:
            activeStatuses

        }

      })

      .select(
        '_id rider status'
      );


    /*
    -------------------------------------------------------
    SEND LOCATION TO RIDER
    -------------------------------------------------------
    */

    if (activeTrip) {

      emitDriverLocation({

        driverId:
          req.user._id,

        riderId:
          activeTrip.rider,

        tripId:
          activeTrip._id,

        location:
          profile.location

      });

    }


    return res.json({

      success: true,

      data: {

        location:
          profile.location

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
SUBMIT DRIVER NIN
=========================================================

IMPORTANT:

This endpoint validates NIN FORMAT only.

It does not claim government verification.
=========================================================
*/

async function submitNIN(
  req,
  res,
  next
) {

  try {

    const nin =
      normalizeNIN(
        req.body?.nin
      );


    /*
    -------------------------------------------------------
    REQUIRED
    -------------------------------------------------------
    */

    if (!nin) {

      return res.status(400).json({

        success: false,

        message:
          'NIN is required'

      });

    }


    /*
    -------------------------------------------------------
    FORMAT
    -------------------------------------------------------
    */

    if (
      !isValidNIN(nin)
    ) {

      return res.status(400).json({

        success: false,

        message:
          'NIN must contain exactly 11 digits'

      });

    }


    /*
    -------------------------------------------------------
    DRIVER PROFILE
    -------------------------------------------------------
    */

    const profile =
      await DriverProfile.findOne({

        user:
          req.user._id

      });


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    /*
    -------------------------------------------------------
    CHECK WHETHER NIN IS ALREADY VERIFIED
    -------------------------------------------------------
    */

    if (
      profile.ninVerification?.verified === true
    ) {

      return res.status(409).json({

        success: false,

        message:
          'Your NIN has already been verified'

      });

    }


    /*
    -------------------------------------------------------
    DUPLICATE NIN CHECK
    -------------------------------------------------------

    Do not allow the same NIN to be attached to another
    driver account.
    -------------------------------------------------------
    */

    const existing =
      await DriverProfile.findOne({

        'ninVerification.number':
          nin,

        user: {

          $ne:
            req.user._id

        }

      });


    if (existing) {

      return res.status(409).json({

        success: false,

        message:
          'This NIN is already associated with another driver account'

      });

    }


    /*
    -------------------------------------------------------
    SAVE NIN
    -------------------------------------------------------

    The schema has select:false on the NIN number.
    -------------------------------------------------------
    */

    profile.ninVerification = {

      number:
        nin,

      verified:
        false,

      verifiedAt:
        undefined

    };


    await profile.save();


    return res.json({

      success: true,

      message:
        'NIN submitted successfully and is awaiting verification',

      data: {

        ninVerified:
          false,

        verificationStatus:
          'pending'

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
GET DRIVER IDENTITY STATUS
=========================================================

Driver receives only the minimum information required.

The full NIN is NEVER returned.
=========================================================
*/
async function getIdentityStatus(
  req,
  res,
  next
) {

  try {

    const profile =
      await DriverProfile.findOne({

        user:
          req.user._id

      })

      /*
      =====================================================
      SECURITY
      =====================================================

      NIN number is select:false in DriverProfile.

      We explicitly load it here only to determine whether
      the driver has submitted a NIN.

      The actual NIN number is NOT returned in this response.
      =====================================================
      */

      .select(
        '+ninVerification.number'
      );


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    const hasNIN =
      Boolean(
        profile.ninVerification?.number
      );


    const faceStatus =
      profile.faceVerification?.status ||
      'pending';


    const ninVerified =
      profile.ninVerification?.verified === true;


    const faceVerified =
      faceStatus === 'verified';


    const faceSubmitted =
      Boolean(
        profile.faceVerification?.imageUrl
      );


    return res.json({

      success: true,

      data: {

        identity: {

          ninSubmitted:
            hasNIN,

          ninVerified,

          faceSubmitted,

          faceStatus,

          faceVerified,

          identityVerified:
            ninVerified &&
            faceVerified

        }

      }

    });

  } catch (error) {

    return next(error);

  }

}


/*
=========================================================
SUBMIT FACE VERIFICATION
=========================================================

The driver submits a face image/reference.

The server sets the state to PENDING.

It does NOT automatically claim that the face matches
the driver's identity.
=========================================================
*/

async function submitFaceVerification(
  req,
  res,
  next
) {

  try {

    const imageUrl =
      String(

        req.body?.imageUrl ||

        req.body?.faceImage ||

        ''

      ).trim();


    /*
    -------------------------------------------------------
    DRIVER PROFILE
    -------------------------------------------------------
    */

    const profile =
      await DriverProfile.findOne({

        user:
          req.user._id

      });


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    /*
    -------------------------------------------------------
    NIN REQUIREMENT
    -------------------------------------------------------
    */

    if (
      !profile.ninVerification?.number
    ) {

      return res.status(400).json({

        success: false,

        code:
          'NIN_REQUIRED',

        message:
          'Submit your NIN before submitting face verification'

      });

    }


    /*
    -------------------------------------------------------
    IMAGE VALIDATION
    -------------------------------------------------------
    */

    if (
      !isValidFaceImage(
        imageUrl
      )
    ) {

      return res.status(400).json({

        success: false,

        message:
          'A valid face image reference is required'

      });

    }


    /*
    -------------------------------------------------------
    SAVE FACE SUBMISSION
    -------------------------------------------------------
    */

    profile.faceVerification = {

      imageUrl,

      status:
        'pending',

      verifiedAt:
        undefined

    };


    /*
    -------------------------------------------------------
    SECURITY DEVICE
    -------------------------------------------------------
    */

    const deviceId =
      req.headers['x-device-id'] ||
      req.body?.deviceId ||
      '';


    if (
      deviceId
    ) {

      profile.securityProfile = {

        ...(profile.securityProfile?.toObject?.() ||
          profile.securityProfile ||
          {}),

        deviceId:
          String(
            deviceId
          ).trim(),

        lastFaceCheck:
          new Date()

      };

    }


    await profile.save();


    return res.json({

      success: true,

      message:
        'Face verification submitted and is awaiting review',

      data: {

        faceStatus:
          'pending'

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
LIST DRIVERS
=========================================================
*/

async function list(
  req,
  res,
  next
) {

  try {

    const profiles =
      await DriverProfile.find()

      .populate(

        'user',

        'fullName phone email role status'

      )

      .sort({

        createdAt:
          -1

      });


    return res.json({

      success: true,

      data: {

        drivers:
          profiles

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
VERIFY DRIVER
=========================================================
*/

async function verify(
  req,
  res,
  next
) {

  try {

    const allowedStatuses = [

      'pending',

      'approved',

      'rejected',

      'suspended'

    ];


    const status =
      req.body.status;


    if (
      !allowedStatuses.includes(
        status
      )
    ) {

      return res.status(400).json({

        success: false,

        message:
          'Invalid verification status'

      });

    }


    /*
    -------------------------------------------------------
    LOAD DRIVER PROFILE
    -------------------------------------------------------
    */

    const existingProfile =
      await DriverProfile.findById(
        req.params.id
      );


    if (!existingProfile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    /*
    -------------------------------------------------------
    APPROVAL REQUIREMENTS
    -------------------------------------------------------
    */

    if (
      status === 'approved'
    ) {

      const missing = [];


      if (
        !existingProfile.driverImage
      ) {

        missing.push(
          'driver image'
        );

      }


      if (
        !existingProfile.vehicleMake
      ) {

        missing.push(
          'vehicle make'
        );

      }


      if (
        !existingProfile.plateNumber
      ) {

        missing.push(
          'plate number'
        );

      }


      if (
        !existingProfile.driverLicenceNumber
      ) {

        missing.push(
          'driver licence number'
        );

      }


      /*
      -----------------------------------------------------
      IDENTITY REQUIREMENTS
      -----------------------------------------------------
      */

      if (
        existingProfile.ninVerification?.verified !==
        true
      ) {

        missing.push(
          'verified NIN'
        );

      }


      if (
        existingProfile.faceVerification?.status !==
        'verified'
      ) {

        missing.push(
          'verified face'
        );

      }


      if (
        missing.length > 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            `Driver cannot be approved. Missing: ${missing.join(', ')}`

        });

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

          returnDocument:
            'after',

          runValidators:
            true

        }

      )

      .populate(

        'user',

        'fullName phone email role status'

      );


    return res.json({

      success: true,

      message:
        `Driver ${status}`,

      data: {

        profile

      }

    });

  } catch (error) {

    return next(error);

  }

}


/*
=========================================================
ADMIN GET DRIVER IDENTITY
=========================================================

This is deliberately an admin-only controller function.

The route will be protected by requireRole('admin').

The NIN is explicitly selected because normal DriverProfile
queries hide it with select:false.
=========================================================
*/

async function adminGetIdentity(
  req,
  res,
  next
) {

  try {

    const profile =
      await DriverProfile.findById(
        req.params.id
      )

      .select(
        '+ninVerification.number'
      )

      .populate(

        'user',

        'fullName phone email role status'

      );


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    const nin =
      profile.ninVerification?.number ||
      '';


    /*
    -------------------------------------------------------
    MASK NIN FOR NORMAL ADMIN VIEW
    -------------------------------------------------------

    We return the last four digits rather than exposing
    the entire NIN unnecessarily.
    -------------------------------------------------------
    */

    const maskedNIN =
      nin
        ? `*******${nin.slice(-4)}`
        : 'Not submitted';


    return res.json({

      success: true,

      data: {

        driver: {

          id:
            profile._id,

          user:
            profile.user

        },

        identity: {

          ninSubmitted:
            Boolean(nin),

          ninMasked:
            maskedNIN,

          ninVerified:
            profile.ninVerification?.verified === true,

          ninVerifiedAt:
            profile.ninVerification?.verifiedAt ||
            null,

          faceSubmitted:
            Boolean(
              profile.faceVerification?.imageUrl
            ),

          faceStatus:
            profile.faceVerification?.status ||
            'pending',

          faceImageUrl:
            profile.faceVerification?.imageUrl ||
            '',

          faceVerifiedAt:
            profile.faceVerification?.verifiedAt ||
            null,

          identityVerified:

            profile.ninVerification?.verified === true &&

            profile.faceVerification?.status ===
              'verified'

        }

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
ADMIN VERIFY NIN
=========================================================

This does NOT perform government verification.

It records the decision made by an authorized
administrator after verification has been completed
through the approved identity-verification process.
=========================================================
*/

async function verifyNIN(
  req,
  res,
  next
) {

  try {

    const verified =
      req.body?.verified;


    if (
      typeof verified !==
      'boolean'
    ) {

      return res.status(400).json({

        success: false,

        message:
          'verified must be true or false'

      });

    }


    const profile =
      await DriverProfile.findById(
        req.params.id
      )

      .select(
        '+ninVerification.number'
      );


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    if (
      !profile.ninVerification?.number
    ) {

      return res.status(400).json({

        success: false,

        message:
          'Driver has not submitted a NIN'

      });

    }


    profile.ninVerification.verified =
      verified;


    profile.ninVerification.verifiedAt =
      verified
        ? new Date()
        : undefined;


    if (!verified) {

      profile.verificationStatus =
        'pending';

      profile.online =
        false;

    }


    await profile.save();


    return res.json({

      success: true,

      message:
        verified
          ? 'NIN verification approved'
          : 'NIN verification rejected',

      data: {

        ninVerified:
          verified,

        ninVerifiedAt:
          profile.ninVerification.verifiedAt ||
          null

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
ADMIN VERIFY FACE
=========================================================

This records an authorized verification decision.

It does not perform biometric matching itself.
=========================================================
*/

async function verifyFace(
  req,
  res,
  next
) {

  try {

    const status =
      req.body?.status;


    if (
      !faceVerificationStatuses.includes(
        status
      )
    ) {

      return res.status(400).json({

        success: false,

        message:
          'Invalid face verification status'

      });

    }


    const profile =
      await DriverProfile.findById(
        req.params.id
      );


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    if (
      !profile.faceVerification?.imageUrl
    ) {

      return res.status(400).json({

        success: false,

        message:
          'Driver has not submitted a face image'

      });

    }


    profile.faceVerification.status =
      status;


    profile.faceVerification.verifiedAt =

      status === 'verified'

        ?

        new Date()

        :

        undefined;


    /*
    -------------------------------------------------------
    REJECTED FACE
    -------------------------------------------------------
    */

    if (
      status === 'failed'
    ) {

      profile.online =
        false;

    }


    await profile.save();


    return res.json({

      success: true,

      message:

        status === 'verified'

          ?

          'Face verification approved'

          :

        status === 'failed'

          ?

          'Face verification rejected'

          :

          'Face verification returned to pending',

      data: {

        faceStatus:
          status,

        faceVerified:
          status === 'verified',

        verifiedAt:
          profile.faceVerification.verifiedAt ||
          null

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
EXPORTS
=========================================================
*/

module.exports = {

  getMe,

  dashboard,

  updateMe,

  setOnline,

  location,

  submitNIN,

  getIdentityStatus,

  submitFaceVerification,

  list,

  verify,

  adminGetIdentity,

  verifyNIN,

  verifyFace

};


/*
=========================================================
ACTIVE TRIP STATUSES
=========================================================

A trip is considered active until it reaches:

    TRIP_COMPLETED
    CANCELLED

COMPLETION_REQUESTED is deliberately included.

Workflow:

    TRIP_STARTED
          ↓
    Driver requests completion
          ↓
    COMPLETION_REQUESTED
          ↓
    Rider confirms arrival
          ↓
    Driver sees confirmation
          ↓
    Driver clicks Trip Completed
          ↓
    TRIP_COMPLETED

The driver must therefore remain locked to this trip
until the final completion has actually taken place.
=========================================================
*/

/*
=========================================================
GET CURRENT DRIVER PROFILE
=========================================================
*/

async function getMe(
  req,
  res,
  next
) {

  try {

    const profile =
      await DriverProfile.findOne({

        user:
          req.user._id

      })

      .populate(
        'user',
        'fullName phone email role status'
      );


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    return res.json({

      success: true,

      data: {

        profile

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
DRIVER DASHBOARD
=========================================================

Returns:

    driver profile
    wallet
    active trip
    completed trip count
    recent trips

IMPORTANT:

COMPLETION_REQUESTED is included in activeTrips.

This prevents the dashboard from saying:

    "No active ride"

while the driver is actually waiting for final
completion.
=========================================================
*/

async function dashboard(
  req,
  res,
  next
) {

  console.log(
  '[DRIVER DASHBOARD USER]',
  {
    id: req.user._id,
    type: typeof req.user._id
  }
);

  try {

    /*
    -------------------------------------------------------
    DRIVER PROFILE
    -------------------------------------------------------
    */

    const profile =
      await DriverProfile.findOne({

        user:
          req.user._id

      })

      .populate(
        'user',
        'fullName phone email role status'
      );


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    /*
    -------------------------------------------------------
    LOAD DASHBOARD DATA
    -------------------------------------------------------
    */

    const [
      wallet,
      activeTrip,
      completedTrips,
      recentTrips
    ] = await Promise.all([

      /*
      -----------------------------------------------------
      DRIVER WALLET
      -----------------------------------------------------
      */

      Wallet.findOne({

        user:
          req.user._id

      }),


      /*
      -----------------------------------------------------
      ACTIVE TRIP
      -----------------------------------------------------

      Includes COMPLETION_REQUESTED.
      */

   Trip.findOne({

  driver:
    req.user._id,

  status: {

    $in:
      activeStatuses

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

        createdAt:
          -1

      }),


      /*
      -----------------------------------------------------
      COMPLETED TRIPS
      -----------------------------------------------------
      */

      Trip.countDocuments({

        driver:
          req.user._id,

        status:
          'TRIP_COMPLETED'

      }),


      /*
      -----------------------------------------------------
      RECENT TRIPS
      -----------------------------------------------------
      */

      Trip.find({

        driver:
          req.user._id

      })

      .populate(
        'rider',
        'fullName phone'
      )

      .sort({

        createdAt:
          -1

      })

      .limit(5)

    ]);


    /*
    -------------------------------------------------------
    DRIVER COMPLETION STATE
    -------------------------------------------------------

    This gives the mobile client enough information to
    determine whether the final completion action is
    allowed.

    Rider must explicitly confirm arrival.
    -------------------------------------------------------
    */

    const riderArrivalConfirmed =
      activeTrip?.riderArrivalConfirmed === true;


    const canComplete =
      Boolean(

        activeTrip &&

        activeTrip.status ===
          'TRIP_STARTED' &&

        riderArrivalConfirmed &&

        String(
          activeTrip.arrivalStatus || ''
        ).toLowerCase() ===
          'rider_confirmed'

      );


    /*
    -------------------------------------------------------
    RESPONSE
    -------------------------------------------------------
    */

    return res.json({

      success: true,

      data: {

        profile,

        wallet: {

          balance:
            wallet?.balance || 0

        },

        activeTrip:
          activeTrip || null,

        /*
        Explicit completion state.
        */

        riderArrivalConfirmed,

        canComplete,

        completedTrips,

        recentTrips

      }

    });

  } catch (e) {

    return next(e);

  }

}



/*
=========================================================
UPDATE DRIVER PROFILE
=========================================================
*/

async function updateMe(
  req,
  res,
  next
) {

  try {


    const fields = [

      'vehicleType',

      'vehicleMake',

      'vehicleModel',

      'vehicleColor',

      'plateNumber',

      'driverLicenceNumber',

      'driverImage'

    ];

    const updates = {};

    /*
    -------------------------------------------------------
    COPY ONLY ALLOWED FIELDS
    -------------------------------------------------------
    */

    for (
      const field of fields
    ) {


      if (
        req.body[field] !== undefined
      ) {


        updates[field] =

          typeof req.body[field] === 'string'

            ?

            req.body[field].trim()

            :

            req.body[field];


      }


    }



    /*
    -------------------------------------------------------
    FORMAT SPECIAL FIELDS
    -------------------------------------------------------
    */


    if (
      updates.plateNumber
    ) {

      updates.plateNumber =
        String(
          updates.plateNumber
        )
        .toUpperCase();

    }



    if (
      updates.driverLicenceNumber
    ) {

      updates.driverLicenceNumber =
        String(
          updates.driverLicenceNumber
        )
        .toUpperCase();

    }




   /*
-------------------------------------------------------
UPDATE PROFILE
-------------------------------------------------------
*/


/*
-------------------------------------------------------
CLEAN DRIVER DATA BEFORE UPDATE
-------------------------------------------------------
*/

// Prevent invalid enum error
// when vehicleType is empty

if (
  updates.vehicleType === ''
) {

  delete updates.vehicleType;

}


// Remove empty optional fields

Object.keys(updates).forEach(
  key => {

    if (
      updates[key] === undefined ||
      updates[key] === null
    ) {

      delete updates[key];

    }

  }
);


/*
-------------------------------------------------------
CLEAN DRIVER DATA BEFORE UPDATE
-------------------------------------------------------
*/


if (
  updates.vehicleType
) {

  updates.vehicleType =
    String(
      updates.vehicleType
    )
    .trim()
    .toLowerCase();

}



/*
-------------------------------------------------------
REMOVE EMPTY VALUES
-------------------------------------------------------
*/


Object.keys(
  updates
).forEach(

  key => {

    if (
      updates[key] === '' ||
      updates[key] === undefined ||
      updates[key] === null
    ) {

      delete updates[key];

    }

  }

);



/*
-------------------------------------------------------
UPDATE DRIVER PROFILE
-------------------------------------------------------
*/

const profile =
  await DriverProfile.findOneAndUpdate(

    {

      user:
        req.user._id

    },


    {

      $set:
        updates

    },


    {

      returnDocument:
        'after',

      runValidators:
        true

    }

  )


  .populate(

    'user',

    'fullName phone email role status'

  );




if (
  !profile
) {


  return res.status(404).json({

    success:false,

    message:
      'Driver profile not found'

  });


}




return res.json({

  success:true,

  message:
    'Driver profile updated successfully',

  data:{

    profile

  }

});

  } catch (e) {

    return next(e);

  }

}

/*
=========================================================
SET DRIVER ONLINE / OFFLINE
=========================================================
*/

async function setOnline(
  req,
  res,
  next
) {

  try {

    const online =
      !!req.body.online;


    /*
    -------------------------------------------------------
    FIND DRIVER
    -------------------------------------------------------
    */

    const profile =
      await DriverProfile.findOne({

        user:
          req.user._id

      });


    if (!profile) {

      return res.status(404).json({

        success: false,

        message:
          'Driver profile not found'

      });

    }


    /*
    -------------------------------------------------------
    APPROVAL CHECK
    -------------------------------------------------------
    */

    if (

      String(
        profile.verificationStatus || ''
      ).toLowerCase() !==
      'approved'

    ) {

      return res.status(403).json({

        success: false,

        message:
          'Driver must be approved before going online'

      });

    }


    /*
    -------------------------------------------------------
    PREVENT OFFLINE DURING ACTIVE TRIP
    -------------------------------------------------------

    This includes COMPLETION_REQUESTED.

    Therefore the driver cannot:

        1. finish a ride request
        2. have rider confirmation
        3. remain on an unfinished trip
        4. go offline
        5. accept another ride

    -------------------------------------------------------
    */

    if (!online) {

      const active =
        await Trip.exists({

          driver:
            req.user._id,

          status: {

            $in:
              activeStatuses

          }

        });


      if (active) {

        return res.status(409).json({

          success: false,

          message:
            'You cannot go offline during an active trip'

        });

      }

    }


    /*
    -------------------------------------------------------
    SAVE ONLINE STATUS
    -------------------------------------------------------
    */

    profile.online =
      online;


    await profile.save();


    return res.json({

      success: true,

      data: {

        online:
          profile.online

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
DRIVER LOCATION
=========================================================

Updates driver's GPS position.

The location is also sent to the rider when the driver
has an active trip.

COMPLETION_REQUESTED remains active here so that the
driver/rider connection is not prematurely broken while
the final completion confirmation is being processed.
=========================================================
*/

async function location(
  req,
  res,
  next
) {

  try {

    const latitude =
      Number(
        req.body.latitude
      );

    const longitude =
      Number(
        req.body.longitude
      );

    const accuracy =
      req.body.accuracy == null

        ? undefined

        : Number(
            req.body.accuracy
          );


    /*
    -------------------------------------------------------
    VALIDATE LATITUDE
    -------------------------------------------------------
    */

    if (

      !Number.isFinite(
        latitude
      )

      ||

      latitude < -90

      ||

      latitude > 90

    ) {

      return res.status(400).json({

        success: false,

        message:
          'Valid latitude and longitude are required'

      });

    }


    /*
    -------------------------------------------------------
    VALIDATE LONGITUDE
    -------------------------------------------------------
    */

    if (

      !Number.isFinite(
        longitude
      )

      ||

      longitude < -180

      ||

      longitude > 180

    ) {

      return res.status(400).json({

        success: false,

        message:
          'Valid latitude and longitude are required'

      });

    }


    /*
    -------------------------------------------------------
    UPDATE DRIVER LOCATION
    -------------------------------------------------------
    */

    const profile =
      await DriverProfile.findOneAndUpdate(

        {

          user:
            req.user._id,

          verificationStatus:
            'approved'

        },

        {

          $set: {

            location: {

              latitude,

              longitude,

              accuracy,

              updatedAt:
                new Date()

            }

          }

        },

        {

          returnDocument:
            'after'

        }

      );


    if (!profile) {

      return res.status(403).json({

        success: false,

        message:
          'Approved driver profile required'

      });

    }


    /*
    -------------------------------------------------------
    FIND ACTIVE TRIP
    -------------------------------------------------------
    */

    const activeTrip =
      await Trip.findOne({

        driver:
          req.user._id,

        status: {

          $in:
            activeStatuses

        }

      })

      .select(
        '_id rider status'
      );


    /*
    -------------------------------------------------------
    SEND LOCATION TO RIDER
    -------------------------------------------------------
    */

    if (activeTrip) {

      emitDriverLocation({

        driverId:
          req.user._id,

        riderId:
          activeTrip.rider,

        tripId:
          activeTrip._id,

        location:
          profile.location

      });

    }


    /*
    -------------------------------------------------------
    RESPONSE
    -------------------------------------------------------
    */

    return res.json({

      success: true,

      data: {

        location:
          profile.location

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
LIST DRIVERS
=========================================================
*/

async function list(
  req,
  res,
  next
) {

  try {

    const profiles =
      await DriverProfile.find()

      .populate(
        'user',
        'fullName phone email role status'
      )

      .sort({

        createdAt:
          -1

      });


    return res.json({

      success: true,

      data: {

        drivers:
          profiles

      }

    });

  } catch (e) {

    return next(e);

  }

}


/*
=========================================================
VERIFY DRIVER
=========================================================
*/

async function verify(
  req,
  res,
  next
) {

  try {

    const allowedStatuses = [

      'pending',

      'approved',

      'rejected',

      'suspended'

    ];


    const status =
      req.body.status;



    if (
      !allowedStatuses.includes(status)
    ) {

      return res.status(400).json({

        success:false,

        message:
          'Invalid verification status'

      });

    }



    /*
    -------------------------------------------------------
    LOAD DRIVER PROFILE FIRST
    -------------------------------------------------------
    */

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
    APPROVAL REQUIREMENTS
    -------------------------------------------------------

    Driver must submit:

    1. Driver image
    2. Vehicle make
    3. Plate number
    4. Driver licence number

    before approval.

    -------------------------------------------------------
    */

    if (
      status === 'approved'
    ) {


      const missing = [];



      if (
        !existingProfile.driverImage
      ) {

        missing.push(
          'driver image'
        );

      }



      if (
        !existingProfile.vehicleMake
      ) {

        missing.push(
          'vehicle make'
        );

      }



      if (
        !existingProfile.plateNumber
      ) {

        missing.push(
          'plate number'
        );

      }



      if (
        !existingProfile.driverLicenceNumber
      ) {

        missing.push(
          'driver licence number'
        );

      }



      if (
        missing.length > 0
      ) {

        return res.status(400).json({

          success:false,

          message:
            `Driver cannot be approved. Missing: ${missing.join(', ')}`

        });

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

          returnDocument:
            'after',

          runValidators:
            true

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

    return next(error);

  }

}

/*
=========================================================
EXPORTS
=========================================================
*/

module.exports = {

  /*
  -------------------------------------------------------
  DRIVER PROFILE
  -------------------------------------------------------
  */

  getMe,

  dashboard,

  updateMe,


  /*
  -------------------------------------------------------
  DRIVER OPERATIONS
  -------------------------------------------------------
  */

  setOnline,

  location,


  /*
  -------------------------------------------------------
  DRIVER IDENTITY SECURITY
  -------------------------------------------------------
  */

  submitNIN,

  getIdentityStatus,

  submitFaceVerification,


  /*
  -------------------------------------------------------
  ADMIN DRIVER MANAGEMENT
  -------------------------------------------------------
  */

  list,

  verify,


  /*
  -------------------------------------------------------
  ADMIN IDENTITY REVIEW
  -------------------------------------------------------
  */

  adminGetIdentity,

  verifyNIN,

  verifyFace

};