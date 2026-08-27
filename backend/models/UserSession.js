const mongoose = require('mongoose');


const userSessionSchema = new mongoose.Schema(

{

user:{

type:mongoose.Schema.Types.ObjectId,

ref:'User',

required:true,

index:true

},


tokenId:{

type:String,

required:true,

unique:true,

index:true

},


deviceId:{

type:String,

index:true

},


ipAddress:String,


userAgent:String,


revoked:{

type:Boolean,

default:false,

index:true

},


expiresAt:{

type:Date,

required:true

}


},

{

timestamps:true

}

);



userSessionSchema.index({

expiresAt:1

},{

expireAfterSeconds:0

});



module.exports =
mongoose.model(
'UserSession',
userSessionSchema
);