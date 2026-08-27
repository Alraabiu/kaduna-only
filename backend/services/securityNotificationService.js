const SecurityAlert = require('../models/SecurityAlert');



async function sendSecurityAlert({

io,

userId,

alert

}){


if(!io){

return;

}



if(!userId){

return;

}



io.to(

`user_${userId}`

)

.emit(

'security_alert',

{

success:true,

alert

}

);


}




async function createAndNotify({

io,

userId,

alertData

}){


const alert =

await SecurityAlert.create({

user:userId,

...alertData

});



await sendSecurityAlert({

io,

userId,

alert

});



return alert;

}





module.exports = {


sendSecurityAlert,

createAndNotify


};