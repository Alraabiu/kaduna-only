const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
  provider:{type:String,enum:['paystack'],default:'paystack'},
  purpose:{type:String,enum:['wallet_topup'],default:'wallet_topup'},
  reference:{type:String,required:true,unique:true,index:true},
  accessCode:String,
  amount:{type:Number,required:true,min:0},
  currency:{type:String,default:'NGN'},
  status:{type:String,enum:['initialized','pending','success','failed','abandoned','reversed'],default:'initialized',index:true},
  channel:String,
  gatewayResponse:String,
  paystackTransactionId:String,
  paidAt:Date,
  creditedAt:Date,
  metadata:{type:mongoose.Schema.Types.Mixed,default:{}}
},{timestamps:true});
module.exports=mongoose.model('Payment',schema);
