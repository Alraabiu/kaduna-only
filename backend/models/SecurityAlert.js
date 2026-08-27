const mongoose = require('mongoose');


const securityAlertSchema = new mongoose.Schema(

{

  user: {

    type: mongoose.Schema.Types.ObjectId,

    ref: 'User',

    required: true,

    index: true

  },


  type: {

    type: String,

    enum: [

      'NEW_DEVICE',

      'NEW_IP',

      'MULTIPLE_DEVICES',

      'SUSPICIOUS_LOGIN',

      'FAILED_LOGIN',

      'PASSWORD_CHANGE',

      'LOGOUT_ALL'

    ],

    required: true,

    index: true

  },


  severity: {

    type: String,

    enum: [

      'LOW',

      'MEDIUM',

      'HIGH',

      'CRITICAL'

    ],

    default: 'MEDIUM'

  },


  message: {

    type: String,

    required: true

  },


  deviceId: {

    type: String

  },


  deviceName: {

    type: String

  },


  platform: {

    type: String

  },


  ipAddress: {

    type: String

  },


  userAgent: {

    type: String

  },


  read: {

    type: Boolean,

    default: false,

    index: true

  },


  resolved: {

    type: Boolean,

    default: false

  },


  metadata: {

    type: mongoose.Schema.Types.Mixed,

    default: {}

  }


},

{

  timestamps:true

}

);



securityAlertSchema.index({

  user:1,

  createdAt:-1

});


module.exports =
mongoose.model(
  'SecurityAlert',
  securityAlertSchema
);