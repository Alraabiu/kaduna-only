const mongoose=require('mongoose');
const pushTokenSchema=new mongoose.Schema({
  token:{type:String,required:true},
  deviceId:{type:String,default:'web'},
  platform:{type:String,default:'web'},
  updatedAt:{type:Date,default:Date.now}
},{_id:false});
const schema=new mongoose.Schema({
  fullName:{type:String,required:true,trim:true},
  phone:{type:String,unique:true,required:true,trim:true},
  email:{type:String,lowercase:true,trim:true},
  passwordHash:{type:String,required:true,select:false},
  role:{type:String,enum:['rider','driver','admin'],default:'rider'},
  status:{type:String,enum:['active','suspended'],default:'active'},
  pushTokens:{type:[pushTokenSchema],default:[]}
},{timestamps:true});
module.exports=mongoose.model('User',schema);
