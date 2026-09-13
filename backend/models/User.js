const mongoose = require('mongoose');


/*
=================================================
PUSH TOKEN
=================================================
*/

const pushTokenSchema = new mongoose.Schema({

  token: {
    type: String,
    required: true
  },

  deviceId: {
    type: String,
    default: 'web'
  },

  platform: {
    type: String,
    default: 'web'
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }

}, {
  _id: false
});



/*
=================================================
USER MODEL
=================================================
*/

const schema = new mongoose.Schema({

  /*
  ===============================================
  BASIC INFORMATION
  ===============================================
  */

  fullName: {

    type: String,

    required: true,

    trim: true

  },


  phone: {

    type: String,

    unique: true,

    required: true,

    trim: true

  },


  email: {

    type: String,

    lowercase: true,

    trim: true

  },


  passwordHash: {

    type: String,

    required: true,

    select: false

  },


  walletPinHash: {

    type: String,

    select: false

  },



  /*
  ===============================================
  USER ROLE
  ===============================================
  */

  role: {

    type: String,

    enum: [

      'rider',

      'driver',

      'admin',

      'staff_operations',

      'customer_support',

      'dispatcher',

      'finance'

    ],

    default: 'rider',

    index: true

  },



  /*
  ===============================================
  ACCOUNT STATUS
  ===============================================
  */

  status: {

    type: String,

    enum: [

      'active',

      'suspended'

    ],

    default: 'active',

    index: true

  },



  /*
  ===============================================
  STAFF OPERATION PROFILE
  ===============================================
  */

  department: {

    type: String,

    trim: true,

    default: ''

  },


  position: {

    type: String,

    trim: true,

    default: ''

  },


 permissions: {

  type: [

    String

  ],

  default: []

},



  /*
  Example:

  permissions:[
    "view_trips",
    "manage_drivers",
    "approve_withdrawals",
    "view_reports"
  ]

  */



  /*
  ===============================================
  STAFF ACCOUNT CONTROL
  ===============================================
  */


  createdBy: {

    type: mongoose.Schema.Types.ObjectId,

    ref: 'User',

    default: null

  },


  lastLoginAt: {

    type: Date,

    default: null

  },


  lastActiveAt: {

    type: Date,

    default: null

  },



  /*
  ===============================================
  PUSH NOTIFICATIONS
  ===============================================
  */

  pushTokens: {

    type: [

      pushTokenSchema

    ],

    default: []

  }


}, {

  timestamps: true

});



/*
=================================================
INDEXES
=================================================
*/


schema.index({

  role: 1,

  status: 1

});


/*
 Staff permission search
*/

schema.index({

  permissions: 1

});



module.exports = mongoose.model(
  'User',
  schema
);