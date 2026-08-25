const Wallet=require('../models/Wallet');
const Trip=require('../models/Trip');
const PlatformRevenue=require('../models/PlatformRevenue');

const flatCommission=()=>Math.max(0,Math.round(Number(process.env.PLATFORM_COMMISSION_FLAT||50)));
const commissionForFare=fare=>Math.min(flatCommission(),Math.max(0,Number(fare)||0));

async function ensureDriverWallet(userId){
  let wallet=await Wallet.findOne({user:userId});
  if(!wallet)wallet=await Wallet.create({user:userId,balance:0,transactions:[]});
  return wallet;
}

async function markPlatformRevenueCollected(trip,amount){
  if(!trip?._id||!trip?.tripId){
    throw new Error('Trip is required to collect platform revenue');
  }

  const commission=Number(amount);

  if(!Number.isFinite(commission)||commission<0){
    throw new Error(`Invalid platform revenue amount for trip ${trip.tripId}`);
  }

  const reference=`PLATFORM-REV-${trip.tripId}`;

  const existing=await PlatformRevenue.findOne({
    trip:trip._id,
    reference
  });

  if(!existing){
    throw new Error(`Platform revenue record is missing for trip ${trip.tripId}`);
  }

  if(Number(existing.amount||0)!==commission){
    throw new Error(`Platform revenue amount mismatch for trip ${trip.tripId}`);
  }

  if(existing.status==='collected'){
    return existing;
  }

  if(existing.status!=='due'){
    throw new Error(`Invalid PlatformRevenue state for trip ${trip.tripId}: ${existing.status}`);
  }

  const revenue=await PlatformRevenue.findOneAndUpdate(
    {
      _id:existing._id,
      trip:trip._id,
      reference,
      status:'due'
    },
    {
      $set:{
        status:'collected',
        collectedAt:new Date()
      }
    },
    {
      returnDocument:'after'
    }
  );

  if(revenue){
    return revenue;
  }

  const current=await PlatformRevenue.findOne({
    _id:existing._id,
    trip:trip._id,
    reference
  });

  if(
    current &&
    current.status==='collected' &&
    Number(current.amount||0)===commission
  ){
    return current;
  }

  throw new Error(`Platform revenue could not be marked collected for trip ${trip.tripId}`);
}

async function collectCashCommission(trip){
  const driverId=trip.driver?._id||trip.driver;
  if(!driverId)return{collected:false,commission:0};

  const commission=commissionForFare(trip.fare);

  if(commission<=0)return{collected:true,commission:0};

  const reference=`PLATFORM-FEE-${trip.tripId}`;

  await ensureDriverWallet(driverId);

  const wallet=await Wallet.findOneAndUpdate(
    {
      user:driverId,
      balance:{$gte:commission},
      'transactions.reference':{$ne:reference}
    },
    {
      $inc:{balance:-commission},
      $push:{
        transactions:{
          type:'debit',
          amount:commission,
          description:`Kaduna Only trip fee ${trip.tripId}`,
          trip:trip._id,
          reference,
          provider:'platform_commission',
          status:'paid'
        }
      }
    },
    {
      returnDocument:'after'
    }
  );

  return{
    collected:!!wallet,
    commission,
    wallet,
    reference
  };
}

async function collectOutstandingCashCommissions(driverId,maxAmount=Infinity){
  await ensureDriverWallet(driverId);

  const wallet=await Wallet.findOne({
    user:driverId
  });

  let available=Math.min(
    Number(wallet?.balance||0),
    Number.isFinite(maxAmount)
      ? Number(maxAmount)
      : Number(wallet?.balance||0)
  );

  if(available<=0){
    return{
      collected:0,
      amount:0
    };
  }

  const due=await Trip.find({
    driver:driverId,
    status:'TRIP_COMPLETED',
    paymentMethod:'cash',
    commissionStatus:'due'
  })
  .sort({
    completedAt:1,
    createdAt:1
  })
  .limit(200);

  let amount=0;
  let count=0;

  for(const trip of due){

    const fee=Number(
      trip.platformCommission||
      commissionForFare(trip.fare)
    );

    /*
     * Zero-fee trips require no wallet debit.
     */

    if(fee<=0){

      trip.platformCommission=0;
      trip.driverNetEarning=Math.max(
        0,
        Number(trip.fare||0)
      );
      trip.commissionStatus='collected';
      trip.commissionCollectedAt=
        trip.commissionCollectedAt||new Date();

      await trip.save();

      await markPlatformRevenueCollected(
        trip,
        fee
      );

      count++;
      continue;
    }

    if(available<fee){
      break;
    }

    const reference=`PLATFORM-FEE-${trip.tripId}`;

    const updated=await Wallet.findOneAndUpdate(
      {
        user:driverId,
        balance:{$gte:fee},
        'transactions.reference':{$ne:reference}
      },
      {
        $inc:{balance:-fee},
        $push:{
          transactions:{
            type:'debit',
            amount:fee,
            description:`Kaduna Only trip fee ${trip.tripId}`,
            trip:trip._id,
            reference,
            provider:'platform_commission',
            status:'paid'
          }
        }
      },
      {
        returnDocument:'after'
      }
    );

    /*
     * Another request may already have collected this fee.
     */

    if(!updated){

      const existing=await Wallet.exists({
        user:driverId,
        'transactions.reference':reference
      });

      if(!existing){
        break;
      }

      trip.platformCommission=fee;
      trip.driverNetEarning=Math.max(
        0,
        Number(trip.fare||0)-fee
      );
      trip.commissionStatus='collected';
      trip.commissionCollectedAt=
        trip.commissionCollectedAt||new Date();

      await trip.save();

      await markPlatformRevenueCollected(
        trip,
        fee
      );

      available=Math.max(
        0,
        available-fee
      );

      amount+=fee;
      count++;

      continue;
    }

    /*
     * New commission debit succeeded.
     */

    trip.platformCommission=fee;
    trip.driverNetEarning=Math.max(
      0,
      Number(trip.fare||0)-fee
    );
    trip.commissionStatus='collected';
    trip.commissionCollectedAt=
      trip.commissionCollectedAt||new Date();

    await trip.save();

    /*
     * Synchronize the corresponding PlatformRevenue record.
     */

    await markPlatformRevenueCollected(
      trip,
      fee
    );

    available-=fee;
    amount+=fee;
    count++;
  }

  return{
    collected:count,
    amount
  };
}

async function outstandingCommission(driverId){
  const result=await Trip.aggregate([
    {
      $match:{
        driver:driverId,
        status:'TRIP_COMPLETED',
        commissionStatus:'due'
      }
    },
    {
      $group:{
        _id:null,
        total:{$sum:'$platformCommission'},
        count:{$sum:1}
      }
    }
  ]);

  return{
    amount:result[0]?.total||0,
    count:result[0]?.count||0
  };
}

module.exports={
  flatCommission,
  commissionForFare,
  collectCashCommission,
  collectOutstandingCashCommissions,
  outstandingCommission
};
