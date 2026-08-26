const mongoose = require('mongoose');


const schema = new mongoose.Schema(

{
  user: {

    type: mongoose.Schema.Types.ObjectId,

    ref:'User',

    required:true,

    index:true

  },


  deviceId: {

    type:String

  },


  deviceName: {

    type:String,

    default:'Unknown device'

  },


  platform: {

    type:String,

    default:'unknown'

  },


  ipAddress: {

    type:String

  },


  userAgent: {

    type:String

  },


  status: {

    type:String,

    enum:[
      'success',
      'failed'
    ],

    default:'success'

  },


  createdAt: {

    type:Date,

    default:Date.now,

    index:true

  }


},

{
 timestamps:true
}

);



module.exports =
mongoose.model(
'LoginHistory',
schema
);