const r=require('express').Router(),c=require('../controllers/mapsController'),{requireAuth}=require('../middleware/auth');
r.use(requireAuth);r.get('/search',c.search);r.post('/route',c.route);module.exports=r;
