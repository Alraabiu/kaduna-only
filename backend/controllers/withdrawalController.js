const DriverProfile=require('../models/DriverProfile');
const Wallet=require('../models/Wallet');
const Withdrawal=require('../models/Withdrawal');
const {sendToUser}=require('../services/pushService');
const {collectOutstandingCashCommissions,outstandingCommission,flatCommission}=require('../services/platformCommissionService');

const minimum=()=>Math.max(100,Number(process.env.WITHDRAWAL_MINIMUM||1000));
const ref=()=>`WD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
const clean=v=>String(v||'').trim();
function validateBank(body){
  const bankName=clean(body.bankName),accountName=clean(body.accountName),accountNumber=clean(body.accountNumber).replace(/\s+/g,'');
  if(bankName.length<2)return{error:'Bank name is required'};
  if(accountName.length<2)return{error:'Account name is required'};
  if(!/^\d{10}$/.test(accountNumber))return{error:'Account number must be exactly 10 digits'};
  return{bankName,accountName,accountNumber};
}
async function getBankAccount(req,res,next){try{
  const p=await DriverProfile.findOne({user:req.user._id}).select('payoutAccount verificationStatus');
  if(!p)return res.status(404).json({success:false,message:'Driver profile not found'});
  res.json({success:true,data:{bankAccount:p.payoutAccount||null,minimumWithdrawal:minimum(),platformCommission:flatCommission()}});
}catch(e){next(e)}}
async function saveBankAccount(req,res,next){try{
  const bank=validateBank(req.body);if(bank.error)return res.status(400).json({success:false,message:bank.error});
  const p=await DriverProfile.findOneAndUpdate({user:req.user._id},{$set:{payoutAccount:bank}},{returnDocument:'after',runValidators:true}).select('payoutAccount');
  if(!p)return res.status(404).json({success:false,message:'Driver profile not found'});
  res.json({success:true,message:'Withdrawal bank account saved',data:{bankAccount:p.payoutAccount}});
}catch(e){next(e)}}
async function driverList(req,res,next){try{
  const items=await Withdrawal.find({driver:req.user._id}).sort({createdAt:-1}).limit(100);
  const due=await outstandingCommission(req.user._id);res.json({success:true,data:{withdrawals:items,minimumWithdrawal:minimum(),platformCommission:flatCommission(),outstandingCommission:due}});
}catch(e){next(e)}}
async function requestWithdrawal(req,res,next){
  let withdrawal=null;
  try{
    const amount=Number(req.body.amount);
    if(!Number.isInteger(amount)||amount<minimum())return res.status(400).json({success:false,message:`Minimum withdrawal is ₦${minimum().toLocaleString('en-NG')}`});
    const p=await DriverProfile.findOne({user:req.user._id,verificationStatus:'approved'}).select('payoutAccount');
    if(!p)return res.status(403).json({success:false,message:'Only approved drivers can withdraw earnings'});
    const bank=validateBank(p.payoutAccount||{});if(bank.error)return res.status(400).json({success:false,message:'Save a valid withdrawal bank account first'});
    const pending=await Withdrawal.exists({driver:req.user._id,status:{$in:['pending','approved']}});
    if(pending)return res.status(409).json({success:false,message:'You already have a withdrawal awaiting completion'});
    // Collect any unpaid flat commissions from earlier cash trips before allowing a withdrawal.
    await collectOutstandingCashCommissions(req.user._id);
    const due=await outstandingCommission(req.user._id);
    if(due.amount>0)return res.status(409).json({success:false,message:`You have ₦${due.amount.toLocaleString('en-NG')} in outstanding Kaduna Only trip fees. Complete a wallet-paid trip or contact admin before withdrawing.`});
    const reference=ref();
    withdrawal=await Withdrawal.create({reference,driver:req.user._id,amount,bank,status:'pending',fundsReservedAt:new Date()});
    const wallet=await Wallet.findOneAndUpdate(
      {user:req.user._id,balance:{$gte:amount},'transactions.reference':{$ne:reference}},
      {$inc:{balance:-amount},$push:{transactions:{type:'debit',amount,description:'Driver withdrawal requested',reference,provider:'manual_withdrawal',status:'pending'}}},
      {returnDocument:'after'}
    );
    if(!wallet){await Withdrawal.deleteOne({_id:withdrawal._id,status:'pending'});return res.status(402).json({success:false,message:'Insufficient available wallet balance'});}
    res.status(201).json({success:true,message:'Withdrawal request submitted for admin review',data:{withdrawal,wallet}});
  }catch(e){if(withdrawal){try{await Withdrawal.deleteOne({_id:withdrawal._id,status:'pending'})}catch{}}next(e)}
}
async function adminList(req,res,next){try{
  const q={};if(req.query.status&&['pending','approved','paid','rejected'].includes(req.query.status))q.status=req.query.status;
  const items=await Withdrawal.find(q).populate('driver','fullName phone email status').populate('reviewedBy','fullName').sort({createdAt:-1}).limit(250);
  const summary=await Withdrawal.aggregate([{$group:{_id:'$status',amount:{$sum:'$amount'},count:{$sum:1}}}]);
  res.json({success:true,data:{withdrawals:items,summary}});
}catch(e){next(e)}}
async function approve(req,res,next){try{
  const w=await Withdrawal.findOneAndUpdate({_id:req.params.id,status:'pending'},{$set:{status:'approved',approvedAt:new Date(),reviewedBy:req.user._id,adminNote:clean(req.body.adminNote)}},{returnDocument:'after'}).populate('driver','fullName phone email');
  if(!w)return res.status(409).json({success:false,message:'Withdrawal is no longer pending'});
  await Wallet.updateOne({user:w.driver._id,'transactions.reference':w.reference},{$set:{'transactions.$.status':'approved'}});
  sendToUser(w.driver._id,{title:'Withdrawal approved',body:`Your ₦${w.amount.toLocaleString('en-NG')} withdrawal was approved and is awaiting bank payment.`,url:'/driver/wallet',tag:`withdrawal-approved-${w._id}`,data:{type:'WITHDRAWAL_APPROVED',withdrawalId:w._id}}).catch(()=>{});
  res.json({success:true,message:'Withdrawal approved',data:{withdrawal:w}});
}catch(e){next(e)}}
async function markPaid(req,res,next){try{
  const transferReference=clean(req.body.transferReference);if(transferReference.length<3)return res.status(400).json({success:false,message:'Enter the bank transfer/reference number'});
  const w=await Withdrawal.findOneAndUpdate({_id:req.params.id,status:'approved'},{$set:{status:'paid',paidAt:new Date(),transferReference,reviewedBy:req.user._id,adminNote:clean(req.body.adminNote)}},{returnDocument:'after'}).populate('driver','fullName phone email');
  if(!w)return res.status(409).json({success:false,message:'Withdrawal must be approved before it can be marked paid'});
  await Wallet.updateOne({user:w.driver._id,'transactions.reference':w.reference},{$set:{'transactions.$.status':'paid','transactions.$.description':'Driver withdrawal paid'}});
  sendToUser(w.driver._id,{title:'Withdrawal paid',body:`₦${w.amount.toLocaleString('en-NG')} has been marked paid to ${w.bank.bankName} ••••${w.bank.accountNumber.slice(-4)}.`,url:'/driver/wallet',tag:`withdrawal-paid-${w._id}`,data:{type:'WITHDRAWAL_PAID',withdrawalId:w._id}}).catch(()=>{});
  res.json({success:true,message:'Withdrawal marked paid',data:{withdrawal:w}});
}catch(e){next(e)}}
async function reject(req,res,next){try{
  let w=await Withdrawal.findOne({_id:req.params.id,status:{$in:['pending','approved','rejected']}}).populate('driver','fullName phone email');
  if(!w)return res.status(409).json({success:false,message:'Paid or unavailable withdrawal cannot be rejected'});
  if(w.status!=='rejected'){
    w.status='rejected';w.rejectedAt=new Date();w.reviewedBy=req.user._id;w.adminNote=clean(req.body.adminNote)||'Withdrawal rejected by admin';await w.save();
  }
  if(!w.refundedAt){
    const refundReference=`WITHDRAWAL-REFUND-${w.reference}`;
    const wallet=await Wallet.findOneAndUpdate(
      {user:w.driver._id,'transactions.reference':{$ne:refundReference}},
      {$inc:{balance:w.amount},$push:{transactions:{type:'credit',amount:w.amount,description:'Rejected withdrawal refund',reference:refundReference,provider:'manual_withdrawal',status:'refunded'}}},
      {returnDocument:'after'}
    );
    if(wallet){w.refundedAt=new Date();await w.save();}
  }
  await Wallet.updateOne({user:w.driver._id,'transactions.reference':w.reference},{$set:{'transactions.$.status':'rejected'}});
  sendToUser(w.driver._id,{title:'Withdrawal returned',body:`Your ₦${w.amount.toLocaleString('en-NG')} withdrawal was not paid. The funds have been returned to your Kaduna Only wallet.`,url:'/driver/wallet',tag:`withdrawal-rejected-${w._id}`,data:{type:'WITHDRAWAL_REJECTED',withdrawalId:w._id}}).catch(()=>{});
  res.json({success:true,message:'Withdrawal rejected and funds returned to driver wallet',data:{withdrawal:w}});
}catch(e){next(e)}}
module.exports={getBankAccount,saveBankAccount,driverList,requestWithdrawal,adminList,approve,markPaid,reject};
