const jwt=require('jsonwebtoken');const User=require('../models/User');
async function requireAuth(req,res,next){try{const h=req.headers.authorization||'';const token=h.startsWith('Bearer ')?h.slice(7):null;if(!token)return res.status(401).json({success:false,message:'Authentication required'});const p=jwt.verify(token,process.env.JWT_SECRET);const u=await User.findById(p.sub);if(!u||u.status!=='active')return res.status(401).json({success:false,message:'Account unavailable'});req.user=u;next()}catch(e){return res.status(401).json({success:false,message:'Invalid or expired token'})}}
function requireRole(...roles){return(req,res,next)=>roles.includes(req.user?.role)?next():res.status(403).json({success:false,message:'Forbidden'})}
module.exports={requireAuth,requireRole};
