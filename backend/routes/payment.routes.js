const r=require('express').Router();const c=require('../controllers/paymentController');
r.post('/paystack/webhook',c.paystackWebhook);
module.exports=r;
