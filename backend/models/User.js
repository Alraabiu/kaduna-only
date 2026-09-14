const mongoose = require('mongoose');


/*
=================================================
PUSH TOKEN SCHEMA
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
=================================================
BASIC INFORMATION
=================================================
*/


fullName: {

  type: String,

  required: true,

  trim: true

},


phone: {

  type: String,

  required: true,

  unique: true,

  trim: true,

  index: true

},


email: {

  type: String,

  lowercase: true,

  trim: true,

  default: '',

  index: true

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
=================================================
USER ROLE
=================================================
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
=================================================
ACCOUNT STATUS
=================================================
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
=================================================
STAFF OPERATION PROFILE
=================================================
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



/*
=================================================
STAFF PERMISSIONS
=================================================

Examples:

view_trips
view_users
manage_drivers
approve_withdrawals
view_reports

=================================================
*/


permissions: {

  type: [

    String

  ],

  default: []

},



/*
=================================================
STAFF ACCOUNT CONTROL
=================================================
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
=================================================
PUSH NOTIFICATIONS
=================================================
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
DATABASE INDEXES
=================================================
*/


/*
Staff permission lookup

Used by:

permission middleware
staff access control

Example:

{
 permissions:"view_trips"
}

*/

schema.index({

  permissions: 1

});



/*
Staff department filtering

Example:

Finance staff
Operations staff
Support staff

*/

schema.index({

  department: 1,

  role: 1

});



/*
Audit tracking

Find staff created by admin

*/

schema.index({

  createdBy: 1,

  createdAt: -1

});



/*
Activity monitoring

*/

schema.index({

  lastActiveAt: -1

});



/*
Combined account filtering

Used for:

active finance staff
active operations staff

*/

schema.index({

  role: 1,

  status: 1

});





module.exports = mongoose.model(

  'User',

  schema

);