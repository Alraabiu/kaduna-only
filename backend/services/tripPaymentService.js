const Wallet=require('../models/Wallet');
const {commissionForFare,collectCashCommission}=require('./platformCommissionService');

const reserveReference=trip=>`RIDE-RESERVE-${trip.tripId}`;
const refundReference=trip=>`RIDE-REFUND-${trip.tripId}`;
const earningReference=trip=>`RIDE-EARNING-${trip.tripId}`;

async function reserveRiderWallet({userId,fare,tripId,tripMongoId}){
  const reference=`RIDE-RESERVE-${tripId}`;
  const wallet=await Wallet.findOneAndUpdate(
    {user:userId,balance:{$gte:fare},'transactions.reference':{$ne:reference}},
    {$inc:{balance:-fare},$push:{transactions:{type:'debit',amount:fare,description:`Ride payment reserved ${tripId}`,trip:tripMongoId,reference,provider:'wallet',status:'reserved'}}},
    {returnDocument:'after'}
  );
  if(!wallet){const e=new Error(`Insufficient wallet balance. This ride costs ₦${Number(fare).toLocaleString('en-NG')}.`);e.statusCode=402;throw e}
  return{wallet,reference};
}

async function rollbackReservation({userId,fare,tripId,tripMongoId}){
  const reference=`RIDE-ROLLBACK-${tripId}`;
  return Wallet.findOneAndUpdate(
    {user:userId,'transactions.reference':{$ne:reference}},
    {$inc:{balance:fare},$push:{transactions:{type:'credit',amount:fare,description:`Ride reservation rollback ${tripId}`,trip:tripMongoId,reference,provider:'wallet',status:'refunded'}}},
    {returnDocument:'after'}
  );
}

async function refundRiderWallet(trip){
  if(trip.paymentMethod!=='wallet'||!trip.walletReservedAt||trip.walletRefundedAt)return{refunded:false};
  const reference=refundReference(trip);
  const wallet=await Wallet.findOneAndUpdate(
    {user:trip.rider?._id||trip.rider,'transactions.reference':{$ne:reference}},
    {$inc:{balance:trip.fare},$push:{transactions:{type:'credit',amount:trip.fare,description:`Refund ${trip.tripId}`,trip:trip._id,reference,provider:'wallet',status:'refunded'}}},
    {returnDocument:'after'}
  );
  return{refunded:!!wallet,wallet,reference};
}

async function settleDriverEarning(trip){
  if(!trip.driver)return{credited:false};
  const userId=trip.driver?._id||trip.driver;
  const commission=commissionForFare(trip.fare);
  const net=Math.max(0,Number(trip.fare||0)-commission);
  trip.platformCommission=commission;
  trip.driverNetEarning=net;

  if(trip.paymentMethod==='cash'){
    const fee=await collectCashCommission(trip);
    trip.commissionStatus=fee.collected?'collected':'due';
    if(fee.collected)trip.commissionCollectedAt=new Date();
    await trip.save();
    return{credited:false,cashCollected:true,commission,commissionCollected:fee.collected,driverNetEarning:net};
  }

  const reference=earningReference(trip);
  let existing=await Wallet.findOne({user:userId});
  if(!existing)existing=await Wallet.create({user:userId,balance:0,transactions:[]});
  if(existing.transactions?.some(x=>x.reference===reference)){
    trip.commissionStatus='collected';if(!trip.commissionCollectedAt)trip.commissionCollectedAt=new Date();await trip.save();
    return{credited:false,wallet:existing,reference,commission,driverNetEarning:net};
  }
  const wallet=await Wallet.findOneAndUpdate(
    {user:userId,'transactions.reference':{$ne:reference}},
    {$inc:{balance:net},$push:{transactions:{type:'credit',amount:net,description:`Wallet ride earnings ${trip.tripId} after ₦${commission.toLocaleString('en-NG')} Kaduna Only fee`,trip:trip._id,reference,provider:'ride',status:'paid'}}},
    {returnDocument:'after'}
  );
  trip.commissionStatus='collected';trip.commissionCollectedAt=new Date();await trip.save();
  return{credited:!!wallet,wallet,reference,commission,driverNetEarning:net};
}

async function legacyWalletDebit(trip){
  const reference=reserveReference(trip);
  const wallet=await Wallet.findOneAndUpdate(
    {user:trip.rider?._id||trip.rider,balance:{$gte:trip.fare},'transactions.reference':{$ne:reference}},
    {$inc:{balance:-trip.fare},$push:{transactions:{type:'debit',amount:trip.fare,description:`Ride payment ${trip.tripId}`,trip:trip._id,reference,provider:'wallet',status:'reserved'}}},
    {returnDocument:'after'}
  );
  if(!wallet){const e=new Error('Rider wallet no longer has enough balance to complete this payment');e.statusCode=402;throw e}
  return{wallet,reference};
}

module.exports={reserveRiderWallet,rollbackReservation,refundRiderWallet,settleDriverEarning,legacyWalletDebit};
