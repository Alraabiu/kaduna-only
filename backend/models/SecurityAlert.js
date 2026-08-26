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

      'SUSPICIOUS_LOGIN'

    ],

    required: true

  },


  message: {

    type: String,

    required: true

  },


  deviceId: {

    type: String

  },


  ipAddress: {

    type: String

  },


  userAgent: {

    type: String

  },


  resolved: {

    type: Boolean,

    default: false

  }

},

{

  timestamps: true

}

);



module.exports =
mongoose.model(
  'SecurityAlert',
  securityAlertSchema
);