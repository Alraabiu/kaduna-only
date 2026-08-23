const r=require('express').Router();
const c=require('../controllers/pushController');
const {requireAuth}=require('../middleware/auth');
r.use(requireAuth);
r.get('/status',c.status);
r.post('/register',c.register);
r.delete('/unregister',c.unregister);
module.exports=r;
