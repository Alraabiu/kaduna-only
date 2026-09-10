const router =
  require('express').Router();


const upload =
  require('../middleware/upload');


const {
  requireAuth
} =
  require('../middleware/auth');


const DriverProfile =
  require('../models/DriverProfile');



/*
=========================================================
DRIVER PROFILE IMAGE
=========================================================
*/

router.post(
  '/driver-image',
  requireAuth,
  upload.single('driverImage'),

  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({

          success: false,

          message:
            'No image uploaded'

        });

      }


      const imageUrl =
        `/uploads/${req.file.filename}`;


      await DriverProfile.findOneAndUpdate(

        {
          user:
            req.user._id
        },

        {
          driverImage:
            imageUrl
        }

      );


      return res.json({

        success: true,

        message:
          'Driver image uploaded',

        data: {

          driverImage:
            imageUrl

        }

      });

    }

    catch (error) {

      return res.status(500).json({

        success: false,

        message:
          error.message

      });

    }

  }

);



/*
=========================================================
DRIVER FACE VERIFICATION IMAGE
=========================================================

This endpoint is specifically for identity verification.

IMPORTANT:

Uploading the image does NOT verify the driver.

The image is stored and the verification status remains:

    pending

An authorized verification process must later change
the status to:

    verified

or:

    failed

=========================================================
*/

router.post(
  '/driver-face',
  requireAuth,
  upload.single('faceImage'),

  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({

          success: false,

          message:
            'No face image uploaded'

        });

      }


      const imageUrl =
        `/uploads/${req.file.filename}`;


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


      profile.faceVerification = {

        ...(profile.faceVerification?.toObject
          ? profile.faceVerification.toObject()
          : profile.faceVerification),

        imageUrl,

        status:
          'pending',

        verifiedAt:
          undefined

      };


      await profile.save();


      return res.json({

        success: true,

        message:
          'Face image submitted and is awaiting verification',

        data: {

          faceSubmitted:
            true,

          faceStatus:
            'pending'

        }

      });

    }

    catch (error) {

      return res.status(500).json({

        success: false,

        message:
          error.message

      });

    }

  }

);



module.exports =
  router;