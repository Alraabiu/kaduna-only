const r = require('express').Router();

const c =
  require('../controllers/messageController');

const {
  requireAuth,
} = require('../middleware/auth');

r.use(requireAuth);


/*
=========================================================
MESSAGES
=========================================================
*/

r.get(
  '/',
  c.listConversations
);

r.get(
  '/conversation',
  c.conversation
);

r.post(
  '/',
  c.send
);

r.patch(
  '/read',
  c.markRead
);

module.exports = r;