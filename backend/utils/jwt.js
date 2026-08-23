const jwt=require('jsonwebtoken');
module.exports=(user)=>jwt.sign({sub:user._id.toString(),role:user.role},process.env.JWT_SECRET,{expiresIn:'7d'});
