const r=require('express').Router();
const c=require('../controllers/tripController');
const {requireAuth,requireRole}=require('../middleware/auth');

r.use(requireAuth);

r.get('/',c.list);
r.get('/active',c.active);

r.get(
  '/available',
  requireRole('driver'),
  c.available
);

r.get(
  '/:id',
  c.getOne
);

r.post(
  '/quote',
  requireRole('rider'),
  c.quote
);

r.post(
  '/',
  requireRole('rider'),
  c.create
);

r.post(
  '/:id/accept',
  requireRole('driver'),
  c.accept
);

r.patch(
  '/:id/advance',
  requireRole('driver'),
  c.advance
);

/*
 * Driver confirms that they have reached /
 * are requesting completion at the destination.
 *
 * This does NOT complete the trip by itself.
 */
r.post(
  '/:id/completion-request',
  requireRole('driver'),
  c.requestCompletion
);

/*
 * Rider confirms that the destination has
 * actually been reached.
 */
r.post(
  '/:id/destination/confirm',
  requireRole('rider'),
  c.confirmDestination
);

/*
 * Rider disputes automatic GPS arrival detection.
 */
r.post(
  '/:id/destination/dispute',
  requireRole('rider'),
  c.disputeDestination
);

r.patch(
  '/:id/cancel',
  requireRole('rider'),
  c.cancel
);

module.exports=r;