const mongoose = require('mongoose');


const schema = new mongoose.Schema(

  {

    user: {

      type:
        mongoose.Schema.Types.ObjectId,

      ref:
        'User',

      required:
        true,

      index:
        true

    },


    /*
     * Unique identifier generated
     * by browser or mobile app.
     */

    deviceId: {

      type:
        String,

      required:
        true

    },


    /*
     * Human readable device information
     */

    deviceName: {

      type:
        String,

      default:
        'Unknown device'

    },


    /*
     * web / android / ios
     */

    deviceType: {

      type:
        String,

      enum: [

        'web',

        'android',

        'ios',

        'unknown'

      ],

      default:
        'unknown'

    },


    platform: {

      type:
        String,

      default:
        'unknown'

    },


    /*
     * Future mobile app fields
     */

    appVersion: {

      type:
        String,

      default:
        null

    },


    osVersion: {

      type:
        String,

      default:
        null

    },


    deviceModel: {

      type:
        String,

      default:
        null

    },


    /*
     * Firebase push notification token
     */

    pushToken: {

      type:
        String,

      default:
        null

    },


    ipAddress: {

      type:
        String,

      default:
        null

    },


    userAgent: {

      type:
        String,

      default:
        null

    },


    /*
     * Trusted device status
     */

    trusted: {

      type:
        Boolean,

      default:
        false

    },


    /*
     * Security control
     */

    blocked: {

      type:
        Boolean,

      default:
        false

    },


    lastActiveAt: {

      type:
        Date,

      default:
        Date.now

    }


  },


  {

    timestamps:true

  }

);



/*
 * Prevent duplicate devices
 * for the same user.
 */

schema.index(

  {

    user:1,

    deviceId:1

  },

  {

    unique:true

  }

);



module.exports =
  mongoose.model(
    'DeviceSession',
    schema
  );