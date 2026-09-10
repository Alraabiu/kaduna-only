require('dotenv').config();
const mongoose=require('mongoose');
const bcrypt=require('bcryptjs');
const User=require('./models/User');
const Wallet=require('./models/Wallet');

(async()=>{
  try{
    const {MONGO_URI,ADMIN_PHONE,ADMIN_NAME,ADMIN_EMAIL,ADMIN_PASSWORD}=process.env;
    if(!MONGO_URI) throw new Error('MONGO_URI is required');
    if(!ADMIN_PHONE||!ADMIN_NAME||!ADMIN_EMAIL||!ADMIN_PASSWORD) throw new Error('Set ADMIN_PHONE, ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in the environment before running create-admin');
    if(ADMIN_PASSWORD.length<12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
    await mongoose.connect(MONGO_URI);
    const passwordHash=await bcrypt.hash(ADMIN_PASSWORD,12);
    const user=await User.findOneAndUpdate({phone:ADMIN_PHONE.trim()},{$set:{fullName:ADMIN_NAME.trim(),email:ADMIN_EMAIL.trim().toLowerCase(),passwordHash,role:'admin',status:'active'}},{upsert:true,new:true,setDefaultsOnInsert:true});
    await Wallet.findOneAndUpdate({user:user._id},{$setOnInsert:{user:user._id,balance:0,transactions:[]}},{upsert:true});
    console.log(`Admin account ready: ${user.phone}`);
    await mongoose.disconnect();
  }catch(e){console.error('ADMIN SETUP FAILED:',e.message);process.exit(1)}
})();
