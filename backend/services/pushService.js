const User=require('../models/User');
const DriverProfile=require('../models/DriverProfile');

/*
=========================================================
VEHICLE CAPACITY RULES
=========================================================
*/

const VEHICLE_CAPACITY = {

  bike: 1,

  keke: 4,

  car: 4,

  suv: 6

};


function getVehicleCapacity(vehicleType){

  return (
    VEHICLE_CAPACITY[vehicleType] ||
    1
  );

}

let messaging=null;
let initialized=false;

function initPush(){
  if(initialized)return !!messaging;
  initialized=true;
  const projectId=process.env.FIREBASE_PROJECT_ID;
  const clientEmail=process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey=(process.env.FIREBASE_PRIVATE_KEY||'').replace(/\\n/g,'\n');
  if(!projectId||!clientEmail||!privateKey){
    console.log('FCM push disabled: Firebase server credentials are not configured');
    return false;
  }
  try{
    const {initializeApp,cert,getApps}=require('firebase-admin/app');
    const {getMessaging}=require('firebase-admin/messaging');
    const app=getApps()[0]||initializeApp({credential:cert({projectId,clientEmail,privateKey}),projectId});
    messaging=getMessaging(app);
    console.log('FCM push notifications enabled');
    return true;
  }catch(error){
    console.error('FCM initialization failed:',error.message);
    messaging=null;
    return false;
  }
}

const pushEnabled=()=>initPush();
const cleanData=data=>Object.fromEntries(Object.entries(data||{}).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,String(v)]));

async function removeInvalidTokens(results,tokens){
  const invalid=[];
  results.forEach((r,i)=>{
    if(r.success)return;
    const code=r.error?.code||'';
    if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code))invalid.push(tokens[i]);
  });
  if(invalid.length)await User.updateMany({'pushTokens.token':{$in:invalid}},{$pull:{pushTokens:{token:{$in:invalid}}}});
}

async function sendTokens(tokens,{title,body,url='/',tag='kaduna-only',data={}}){
  if(!initPush()||!tokens?.length)return {sent:0,failed:0,enabled:!!messaging};
  const unique=[...new Set(tokens.filter(Boolean))];
  let sent=0,failed=0;
  for(let i=0;i<unique.length;i+=500){
    const batch=unique.slice(i,i+500);
    try{
      const response=await messaging.sendEachForMulticast({
        tokens:batch,
        data:cleanData({title,body,url,tag,...data}),
        webpush:{headers:{Urgency:'high'},fcmOptions:{link:url}}
      });
      sent+=response.successCount;failed+=response.failureCount;
      await removeInvalidTokens(response.responses,batch);
    }catch(error){
      failed+=batch.length;
      console.error('FCM multicast send failed:',error.message);
    }
  }
  return {sent,failed,enabled:true};
}

async function sendToUser(userId,payload){
  if(!userId)return {sent:0,failed:0,enabled:pushEnabled()};
  const user=await User.findById(userId).select('pushTokens');
  return sendTokens((user?.pushTokens||[]).map(x=>x.token),payload);
}

async function sendToMatchingDrivers(
  {
    vehicleType,
    rideType = 'single_seat'
  },
  payload
){

  if(!vehicleType){

    return {
      sent:0,
      failed:0,
      enabled:pushEnabled()
    };

  }


  /*
   =========================================================
   FIND ONLINE APPROVED DRIVERS
   =========================================================
  */

  const profiles =
    await DriverProfile.find({

      verificationStatus:
        'approved',

      online:
        true,

      vehicleType

    })
    .select('user');



  const driverIds =
    profiles.map(
      profile => profile.user
    );


  if(!driverIds.length){

    return {
      sent:0,
      failed:0,
      enabled:pushEnabled()
    };

  }



  /*
   =========================================================
   CHECK DRIVER CURRENT TRIP STATUS
   =========================================================
  */

  const Trip =
    require('../models/Trip');


  const activeTrips =
    await Trip.find({

      driver:{
        $in:driverIds
      },

      status:{
        $in:[

          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
          'TRIP_STARTED'

        ]
      }

    });



  const blockedDrivers =
    new Set();


  const driverSeats =
    {};



  activeTrips.forEach(trip => {


    const driverId =
      String(trip.driver);



    /*
     ---------------------------------------------
     PRIVATE KEKE
     ---------------------------------------------
     Driver cannot receive any more requests.
     */

    if(
      trip.vehicleType === 'keke' &&
      trip.rideType === 'private'
    ){

      blockedDrivers.add(
        driverId
      );

      return;

    }



    /*
     ---------------------------------------------
     OTHER VEHICLES
     ---------------------------------------------
     Only one active trip allowed.
     */

    if(
      trip.vehicleType !== 'keke'
    ){

      blockedDrivers.add(
        driverId
      );

      return;

    }



    /*
     ---------------------------------------------
     SHARED KEKE SEAT COUNT
     ---------------------------------------------
     */

    if(
      trip.vehicleType === 'keke' &&
      trip.rideType === 'single_seat'
    ){

      driverSeats[driverId] =
        (
          driverSeats[driverId] || 0
        )
        +
        Number(
          trip.seatsOccupied || 1
        );

    }

  });



  /*
   =========================================================
   BLOCK FULL KEKES
   =========================================================
  */

  Object.entries(driverSeats)
    .forEach(([driverId,seats]) => {

      if(
  seats >= getVehicleCapacity('keke')
){

  blockedDrivers.add(
    driverId
  );

}

    });



  /*
   =========================================================
   FINAL AVAILABLE DRIVERS
   =========================================================
  */

  const availableDriverIds =
    driverIds.filter(
      id =>
        !blockedDrivers.has(
          String(id)
        )
    );


  if(!availableDriverIds.length){

    return {
      sent:0,
      failed:0,
      enabled:pushEnabled()
    };

  }



  /*
   =========================================================
   SEND NOTIFICATION
   =========================================================
  */

  const users =
    await User.find({

      _id:{
        $in:availableDriverIds
      },

      status:
        'active',

      role:
        'driver'

    })
    .select('pushTokens');



  return sendTokens(

    users.flatMap(
      user =>
        (user.pushTokens || [])
        .map(
          token => token.token
        )
    ),

    payload

  );

}

module.exports={initPush,pushEnabled,sendToUser,sendToMatchingDrivers};
