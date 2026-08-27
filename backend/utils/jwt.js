const jwt=require('jsonwebtoken');

const crypto=require('crypto');


module.exports=(user)=>{


const tokenId =
crypto.randomBytes(32)
.toString('hex');



const token =

jwt.sign(

{

sub:user._id.toString(),

role:user.role,

tokenId

},

process.env.JWT_SECRET,

{

expiresIn:'7d'

}

);



return {

token,

tokenId

};


};