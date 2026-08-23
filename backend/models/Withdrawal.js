const mongoose=require('mongoose');
const bankSnapshotSchema=new mongoose.Schema({
  bankName:{type:String,required:true,trim:true},
  accountName:{type:String,required:true,trim:true},
  accountNumber:{type:String,required:true,trim:true}
},{_id:false});
const schema=new mongoose.Schema({
  reference:{type:String,required:true,unique:true,index:true},
  driver:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
  amount:{type:Number,required:true,min:1},
  bank:bankSnapshotSchema,
  status:{type:String,enum:['pending','approved','paid','rejected'],default:'pending',index:true},
  adminNote:{type:String,trim:true},
  transferReference:{type:String,trim:true},
  fundsReservedAt:{type:Date,default:Date.now},
  approvedAt:Date,
  paidAt:Date,
  rejectedAt:Date,
  refundedAt:Date,
  reviewedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
module.exports=mongoose.model('Withdrawal',schema);
