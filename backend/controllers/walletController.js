const Wallet=require('../models/Wallet');
const Payment=require('../models/Payment');
const {initializeWalletTopup,verifyReference,fulfillWalletTopup,mode}=require('../services/paystackService');

async function me(req,res,next){try{const w=await Wallet.findOne({user:req.user._id}).populate('transactions.trip','tripId');if(!w)return res.json({success:true,data:{wallet:{balance:0,transactions:[]},paystackMode:mode()}});res.json({success:true,data:{wallet:w,paystackMode:mode()}})}catch(e){next(e)}}
async function transactions(req,res,next){try{const w=await Wallet.findOne({user:req.user._id}).populate('transactions.trip','tripId');const items=[...(w?.transactions||[])].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));res.json({success:true,data:{transactions:items}})}catch(e){next(e)}}
async function initializePaystack(req,res,next){try{
  if(req.user.role!=='rider')return res.status(403).json({success:false,message:'Wallet funding is available to rider accounts'});
  const amount=Number(req.body.amount);
  if(!Number.isFinite(amount)||amount<100)return res.status(400).json({success:false,message:'Minimum wallet funding amount is ₦100'});
  if(!Number.isInteger(amount))return res.status(400).json({success:false,message:'Enter the amount in whole naira'});
  const data=await initializeWalletTopup({user:req.user,amount});
  res.status(201).json({success:true,message:'Payment initialized',data:{...data,amount,paystackMode:mode()}});
}catch(e){next(e)}}
async function verifyPaystack(req,res,next){try{
  const reference=String(req.body.reference||req.query.reference||'').trim();if(!reference)return res.status(400).json({success:false,message:'Payment reference is required'});
  const payment=await Payment.findOne({reference,user:req.user._id});if(!payment)return res.status(404).json({success:false,message:'Payment record not found'});
  if(payment.status==='success'&&payment.creditedAt){const wallet=await Wallet.findOne({user:req.user._id});return res.json({success:true,message:'Wallet already credited',data:{payment,wallet}})}
  const verified=await verifyReference(reference);const result=await fulfillWalletTopup(payment,verified.data);
  if(result.status!=='success')return res.status(409).json({success:false,message:`Payment is ${result.status}. Complete the Paystack payment and try again.`,data:{status:result.status}});
  const updated=await Payment.findOne({reference});res.json({success:true,message:result.credited?'Payment verified and wallet credited':'Payment already processed',data:{payment:updated,wallet:result.wallet}});
}catch(e){next(e)}}
async function paymentHistory(req,res,next){try{const payments=await Payment.find({user:req.user._id,purpose:'wallet_topup'}).sort({createdAt:-1}).limit(100);res.json({success:true,data:{payments}})}catch(e){next(e)}}
module.exports={me,transactions,initializePaystack,verifyPaystack,paymentHistory};
