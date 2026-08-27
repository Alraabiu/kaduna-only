const mongoose = require('mongoose');



const securityAlertSchema = new mongoose.Schema(

{

  user: {

    type: mongoose.Schema.Types.ObjectId,

    ref:'User',

    required:true,

    index:true

  },



  type: {

    type:String,

    enum:[

      'NEW_DEVICE',

      'NEW_IP',

      'MULTIPLE_DEVICES',

      'SUSPICIOUS_LOGIN'

    ],

    required:true,

    index:true

  },



  message: {

    type:String,

    required:true

  },



  deviceId: {

    type:String,

    default:null

  },



  deviceName: {

    type:String,

    default:'Unknown Device'

  },



  platform: {

    type:String,

    default:'unknown'

  },



  ipAddress: {

    type:String,

    default:null

  },



  userAgent: {

    type:String,

    default:null

  },



  /*
  =====================================================
  ALERT PRIORITY
  =====================================================
  */


  severity: {

    type:String,

    enum:[

      'LOW',

      'MEDIUM',

      'HIGH',

      'CRITICAL'

    ],

    default:'MEDIUM'

  },





  /*
  =====================================================
  READ STATUS
  =====================================================
  */


  read: {

    type:Boolean,

    default:false,

    index:true

  },





  /*
  =====================================================
  USER RESOLUTION STATUS
  =====================================================
  */


  resolved: {

    type:Boolean,

    default:false,

    index:true

  },





  /*
  =====================================================
  EXTRA SECURITY DATA
  =====================================================
  */


  metadata: {

    type:Object,

    default:{}

  }


},


{

timestamps:true

}

);





/*
=========================================================
INDEXES
=========================================================
*/


securityAlertSchema.index({

  user:1,

  createdAt:-1

});



securityAlertSchema.index({

  user:1,

  read:1

});



securityAlertSchema.index({

  user:1,

  type:1,

  createdAt:-1

});





module.exports = mongoose.model(

'SecurityAlert',

securityAlertSchema

);