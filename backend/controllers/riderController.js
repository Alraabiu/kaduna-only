const User = require('../models/User');
const Trip = require('../models/Trip');
const Wallet = require('../models/Wallet');

const publicUser = u => ({ id:u._id, fullName:u.fullName, phone:u.phone, email:u.email, role:u.role, status:u.status });

async function dashboard(req,res,next){
  try{
    const [wallet, recentTrips, completedTrips, activeTrip] = await Promise.all([
      Wallet.findOne({user:req.user._id}).lean(),
      Trip.find({rider:req.user._id}).populate('driver','fullName phone').sort({createdAt:-1}).limit(5),
      Trip.countDocuments({rider:req.user._id,status:'TRIP_COMPLETED'}),
      Trip.findOne({rider:req.user._id,status:{$in:['SEARCHING_DRIVER','DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','TRIP_STARTED']}}).populate('driver','fullName phone').sort({createdAt:-1})
    ]);
    res.json({success:true,data:{
      rider: publicUser(req.user),
      wallet:{balance:wallet?.balance||0},
      completedTrips,
      activeTrip:activeTrip||null,
      recentTrips
    }});
  }catch(e){next(e)}
}

async function profile(req,res){
  res.json({success:true,data:{user:publicUser(req.user)}});
}

async function updateProfile(req,res,next){
  try{
    const fullName = String(req.body.fullName||'').trim();
    const email = String(req.body.email||'').trim().toLowerCase();
    if(!fullName) return res.status(400).json({success:false,message:'Full name is required'});
    if(email){
      const duplicate=await User.findOne({_id:{$ne:req.user._id},email});
      if(duplicate) return res.status(409).json({success:false,message:'Email is already in use'});
    }
    const user=await User.findByIdAndUpdate(req.user._id,{$set:{fullName,email:email||undefined}},{new:true,runValidators:true});
    res.json({success:true,message:'Profile updated',data:{user:publicUser(user)}});
  }catch(e){next(e)}
}

module.exports={dashboard,profile,updateProfile};
