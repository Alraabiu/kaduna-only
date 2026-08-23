const {searchKaduna,getRoute}=require('../utils/maps');
async function search(req,res,next){try{const results=await searchKaduna(req.query.q);res.json({success:true,data:{results}})}catch(e){e.statusCode?res.status(e.statusCode).json({success:false,message:e.message}):next(e)}}
async function route(req,res,next){try{const result=await getRoute(req.body.pickup,req.body.destination);res.json({success:true,data:{route:result}})}catch(e){e.statusCode?res.status(e.statusCode).json({success:false,message:e.message}):next(e)}}
module.exports={search,route};
