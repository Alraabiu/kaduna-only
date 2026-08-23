const mongoose=require('mongoose');
const transactionSchema=new mongoose.Schema({
  type:{type:String,enum:['credit','debit']},
  amount:Number,
  description:String,
  trip:{type:mongoose.Schema.Types.ObjectId,ref:'Trip'},
  reference:String,
  provider:String,
  status:String,
  createdAt:{type:Date,default:Date.now}
},{_id:false});
const schema=new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,unique:true},balance:{type:Number,default:0,min:0},transactions:{type:[transactionSchema],default:[]}},{timestamps:true});
module.exports=mongoose.model('Wallet',schema);
