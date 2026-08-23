const Wallet=require('../models/Wallet');
const Trip=require('../models/Trip');

const flatCommission=()=>Math.max(0,Math.round(Number(process.env.PLATFORM_COMMISSION_FLAT||50)));
const commissionForFare=fare=>Math.min(flatCommission(),Math.max(0,Number(fare)||0));

async function ensureDriverWallet(userId){
  let wallet=await Wallet.findOne({user:userId});
  if(!wallet)wallet=await Wallet.create({user:userId,balance:0,transactions:[]});
  return wallet;
}

async function collectCashCommission(trip){
  const driverId=trip.driver?._id||trip.driver;
  if(!driverId)return{collected:false,commission:0};
  const commission=commissionForFare(trip.fare);
  if(commission<=0)return{collected:true,commission:0};
  const reference=`PLATFORM-FEE-${trip.tripId}`;
  await ensureDriverWallet(driverId);
  const wallet=await Wallet.findOneAndUpdate(
    {user:driverId,balance:{$gte:commission},'transactions.reference':{$ne:reference}},
    {$inc:{balance:-commission},$push:{transactions:{type:'debit',amount:commission,description:`Kaduna Only trip fee ${trip.tripId}`,trip:trip._id,reference,provider:'platform_commission',status:'paid'}}},
    {returnDocument:'after'}
  );
  return{collected:!!wallet,commission,wallet,reference};
}

async function collectOutstandingCashCommissions(driverId,maxAmount=Infinity){
  await ensureDriverWallet(driverId);
  const wallet=await Wallet.findOne({user:driverId});
  let available=Math.min(Number(wallet?.balance||0),Number.isFinite(maxAmount)?maxAmount:Number(wallet?.balance||0));
  if(available<=0)return{collected:0,amount:0};
  const due=await Trip.find({driver:driverId,status:'TRIP_COMPLETED',paymentMethod:'cash',commissionStatus:'due'}).sort({completedAt:1,createdAt:1}).limit(200);
  let amount=0,count=0;
  for(const trip of due){
    const fee=Number(trip.platformCommission||commissionForFare(trip.fare));
    if(fee<=0){trip.commissionStatus='collected';trip.commissionCollectedAt=new Date();await trip.save();continue}
    if(available<fee)break;
    const reference=`PLATFORM-FEE-${trip.tripId}`;
    const updated=await Wallet.findOneAndUpdate(
      {user:driverId,balance:{$gte:fee},'transactions.reference':{$ne:reference}},
      {$inc:{balance:-fee},$push:{transactions:{type:'debit',amount:fee,description:`Kaduna Only trip fee ${trip.tripId}`,trip:trip._id,reference,provider:'platform_commission',status:'paid'}}},
      {returnDocument:'after'}
    );
    if(!updated){
      const existing=await Wallet.exists({user:driverId,'transactions.reference':reference});
      if(!existing)break;
      // The wallet was already debited in an earlier attempt; only repair the trip's commission state.
      trip.platformCommission=fee;trip.driverNetEarning=Math.max(0,Number(trip.fare||0)-fee);trip.commissionStatus='collected';trip.commissionCollectedAt=new Date();await trip.save();
      amount+=fee;count++;continue;
    }
    trip.platformCommission=fee;trip.driverNetEarning=Math.max(0,Number(trip.fare||0)-fee);trip.commissionStatus='collected';trip.commissionCollectedAt=new Date();await trip.save();
    available-=fee;amount+=fee;count++;
  }
  return{collected:count,amount};
}

async function outstandingCommission(driverId){
  const result=await Trip.aggregate([
    {$match:{driver:driverId,status:'TRIP_COMPLETED',commissionStatus:'due'}},
    {$group:{_id:null,total:{$sum:'$platformCommission'},count:{$sum:1}}}
  ]);
  return{amount:result[0]?.total||0,count:result[0]?.count||0};
}

module.exports={flatCommission,commissionForFare,collectCashCommission,collectOutstandingCashCommissions,outstandingCommission};
