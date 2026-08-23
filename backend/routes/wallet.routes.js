const r=require('express').Router(),c=require('../controllers/walletController'),{requireAuth}=require('../middleware/auth');
r.use(requireAuth);
r.get('/',c.me);
r.get('/transactions',c.transactions);
r.get('/payments',c.paymentHistory);
r.post('/paystack/initialize',c.initializePaystack);
r.post('/paystack/verify',c.verifyPaystack);
module.exports=r;
