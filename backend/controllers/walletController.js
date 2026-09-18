const bcrypt=require('bcryptjs');
const mongoose=require('mongoose');
const Wallet=require('../models/Wallet');
const Payment=require('../models/Payment');
const User=require('../models/User');
const {initializeWalletTopup,verifyReference,fulfillWalletTopup,mode}=require('../services/paystackService');

const walletOf=async userId=>{let w=await Wallet.findOne({user:userId});if(!w)w=await Wallet.create({user:userId,balance:0,transactions:[]});return w;};
const ref=(prefix)=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

async function me(req, res, next) {
  try {
    const w = await walletOf(req.user._id);

    w.transactions?.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const user = await User.findById(req.user._id).select('+walletPinHash');
    const hasTransactionPin = Boolean(user?.walletPinHash);

    res.json({
      success: true,
      data: {
        wallet: w,
        hasTransactionPin,
        paystackMode: mode()
      }
    });
  } catch (e) {
    next(e);
  }
}
async function transactions(req,res,next){try{const w=await walletOf(req.user._id);const items=[...(w.transactions||[])].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));res.json({success:true,data:{transactions:items}})}catch(e){next(e)}}
async function initializePaystack(req,res,next){try{const amount=Number(req.body.amount);if(!Number.isInteger(amount)||amount<100)return res.status(400).json({success:false,message:'Minimum wallet funding amount is ₦100'});const data=await initializeWalletTopup({user:req.user,amount});res.status(201).json({success:true,message:'Payment initialized',data:{...data,amount,paystackMode:mode()}})}catch(e){next(e)}}
async function verifyPaystack(req,res,next){try{const reference=String(req.body.reference||req.query.reference||'').trim();if(!reference)return res.status(400).json({success:false,message:'Payment reference is required'});const payment=await Payment.findOne({reference,user:req.user._id});if(!payment)return res.status(404).json({success:false,message:'Payment record not found'});if(payment.status==='success'&&payment.creditedAt)return res.json({success:true,message:'Wallet already credited',data:{payment,wallet:await walletOf(req.user._id)}});const verified=await verifyReference(reference);const result=await fulfillWalletTopup(payment,verified.data);if(result.status!=='success')return res.status(409).json({success:false,message:`Payment is ${result.status}`,data:{status:result.status}});res.json({success:true,message:result.credited?'Payment verified and wallet credited':'Payment already processed',data:{payment:await Payment.findOne({reference}),wallet:result.wallet}})}catch(e){next(e)}}
async function paymentHistory(req,res,next){try{const payments=await Payment.find({user:req.user._id,purpose:'wallet_topup'}).sort({createdAt:-1}).limit(100);res.json({success:true,data:{payments}})}catch(e){next(e)}}

async function setPin(req, res, next) {
  try {
    const pin = String(req.body.pin || '').trim();

    if (!/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: 'Transaction PIN must contain 4 to 6 digits'
      });
    }

    const user = await User.findById(req.user._id).select('+walletPinHash');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    if (user.walletPinHash) {
      return res.status(409).json({
        success: false,
        message: 'Transaction PIN has already been created'
      });
    }

    user.walletPinHash = await bcrypt.hash(pin, 12);
    await user.save();

    return res.json({
      success: true,
      message: 'Transaction PIN created successfully',
      data: {
        hasTransactionPin: true
      }
    });
  } catch (e) {
    next(e);
  }
}
async function transfer(req,res,next){let debitDone=false;let amount=0;try{amount=Number(req.body.amount);const pin=String(req.body.pin||'');const recipientPhone=String(req.body.phone||'').trim();if(!Number.isInteger(amount)||amount<1)return res.status(400).json({success:false,message:'Transfer amount must be a whole naira amount greater than zero'});if(!/^\d{4,6}$/.test(pin))return res.status(400).json({success:false,message:'Valid wallet PIN is required'});if(!recipientPhone)return res.status(400).json({success:false,message:'Recipient phone number is required'});if(recipientPhone===req.user.phone)return res.status(400).json({success:false,message:'You cannot transfer to your own wallet'});const sender=await User.findById(req.user._id).select('+walletPinHash');if(!sender?.walletPinHash)return res.status(400).json({success:false,message:'Set your wallet PIN before making transfers'});if(!(await bcrypt.compare(pin,sender.walletPinHash)))return res.status(401).json({success:false,message:'Incorrect wallet PIN'});const recipient=await User.findOne({phone:recipientPhone}).select('_id fullName phone role status');if(!recipient||recipient.status!=='active')return res.status(404).json({success:false,message:'Recipient account not found'});const debitRef=ref('TRANSFER-DEBIT'),creditRef=ref('TRANSFER-CREDIT');const senderWallet=await Wallet.findOneAndUpdate({user:sender._id,balance:{$gte:amount},'transactions.reference':{$ne:debitRef}},{$inc:{balance:-amount},$push:{transactions:{type:'debit',amount,description:`Transfer to ${recipient.fullName}`,reference:debitRef,provider:'wallet_transfer',status:'success'}}},{new:true});if(!senderWallet)return res.status(402).json({success:false,message:'Insufficient wallet balance'});debitDone=true;try{await walletOf(recipient._id);await Wallet.updateOne({user:recipient._id,'transactions.reference':{$ne:creditRef}},{$inc:{balance:amount},$push:{transactions:{type:'credit',amount,description:`Transfer from ${sender.fullName}`,reference:creditRef,provider:'wallet_transfer',status:'success'}}});}catch(err){await Wallet.updateOne({user:sender._id,'transactions.reference':{$ne:ref(`TRANSFER-ROLLBACK-${debitRef}`)}},{$inc:{balance:amount},$push:{transactions:{type:'credit',amount,description:`Transfer rollback ${debitRef}`,reference:ref(`TRANSFER-ROLLBACK-${debitRef}`),provider:'wallet_transfer',status:'refunded'}}});throw err;}res.status(201).json({success:true,message:`₦${amount.toLocaleString('en-NG')} transferred successfully`,data:{recipient:{id:recipient._id,fullName:recipient.fullName,phone:recipient.phone,role:recipient.role},wallet:senderWallet}})}catch(e){if(!debitDone){}next(e)}}
module.exports={me,transactions,initializePaystack,verifyPaystack,paymentHistory,setPin,transfer};
