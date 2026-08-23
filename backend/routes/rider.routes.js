const r=require('express').Router();
const c=require('../controllers/riderController');
const {requireAuth,requireRole}=require('../middleware/auth');
r.use(requireAuth,requireRole('rider'));
r.get('/dashboard',c.dashboard);
r.get('/profile',c.profile);
r.patch('/profile',c.updateProfile);
module.exports=r;
