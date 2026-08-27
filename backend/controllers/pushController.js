const User=require('../models/User');
const {pushEnabled}=require('../services/pushService');

async function status(req,res,next){
  try{
    const u=await User.findById(req.user._id).select('pushTokens');
    res.json({success:true,data:{serverConfigured:pushEnabled(),registeredDevices:u?.pushTokens?.length||0}});
  }catch(e){next(e)}
}

async function register(req,res,next){
  try{
    const token=String(req.body.token||'').trim();
    if(!token||token.length<40)return res.status(400).json({success:false,message:'Valid FCM token is required'});
    const deviceId=String(req.body.deviceId||'web').slice(0,120);
    await User.updateMany({_id:{$ne:req.user._id},'pushTokens.token':token},{$pull:{pushTokens:{token}}});
    await User.findByIdAndUpdate(req.user._id,{
      $pull:{pushTokens:{token}},
    });
    await User.findByIdAndUpdate(req.user._id,{
      $push:{pushTokens:{token,deviceId,platform:'web',updatedAt:new Date()}}
    });
    res.json({success:true,message:'Push notifications registered',data:{serverConfigured:pushEnabled()}});
  }catch(e){next(e)}
}

async function unregister(req,res,next){
  try{
    const token=String(req.body.token||'').trim();
    if(token)await User.findByIdAndUpdate(req.user._id,{$pull:{pushTokens:{token}}});
    res.json({success:true,message:'Push notifications unregistered'});
  }catch(e){next(e)}
}

module.exports={status,register,unregister};
