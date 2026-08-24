const Payment=require('../models/Payment');
const {validWebhookSignature,fulfillWalletTopup}=require('../services/paystackService');
async function paystackWebhook(req,res){
  try{
    if (
  !validWebhookSignature(
    req.rawBody,
    req.headers['x-paystack-signature']
  )
) {
  return res.status(401).send('invalid signature');
}
    res.sendStatus(200);
    if(req.body?.event!=='charge.success')return;
    const data=req.body.data||{};const payment=await Payment.findOne({reference:data.reference});if(!payment)return;
    await fulfillWalletTopup(payment,data);
  }catch(e){console.error('Paystack webhook error:',e.message);if(!res.headersSent)res.sendStatus(200)}
}
module.exports={paystackWebhook};
