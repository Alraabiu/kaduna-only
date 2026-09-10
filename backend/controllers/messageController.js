const Message = require('../models/Message');
const Trip = require('../models/Trip');
const User = require('../models/User');

const ACTIVE_TRIP_STATUSES = [
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
];

function cleanText(value) {
  return String(value || '').trim();
}

function isObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
}


/*
=========================================================
GET CONVERSATION
=========================================================
*/

async function conversation(req, res, next) {
  try {
    const userId = req.user._id;
    const tripId = String(req.query.tripId || '').trim();

    if (tripId && !isObjectId(tripId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid trip ID',
      });
    }

    const filter = {
      $or: [
        {
          sender: userId,
        },
        {
          recipient: userId,
        },
      ],
    };

    if (tripId) {
      filter.trip = tripId;
    }

    const messages = await Message.find(filter)
      .populate('sender', 'fullName phone role')
      .populate('recipient', 'fullName phone role')
      .populate('trip', 'tripId status pickup destination')
      .sort({
        createdAt: 1,
      })
      .limit(300)
      .lean();

    res.json({
      success: true,
      data: {
        messages,
      },
    });
  } catch (e) {
    next(e);
  }
}


/*
=========================================================
CONVERSATION LIST
=========================================================
*/

async function listConversations(req, res, next) {
  try {
    const userId = req.user._id;

    const messages = await Message.find({
      $or: [
        {
          sender: userId,
        },
        {
          recipient: userId,
        },
      ],
    })
      .populate('sender', 'fullName phone role')
      .populate('recipient', 'fullName phone role')
      .populate('trip', 'tripId status')
      .sort({
        createdAt: -1,
      })
      .limit(500)
      .lean();

    const conversations = new Map();

    for (const message of messages) {
      const otherUser =
        String(message.sender?._id) === String(userId)
          ? message.recipient
          : message.sender;

      if (!otherUser) {
        continue;
      }

      const key =
        message.trip?._id
          ? `trip:${message.trip._id}`
          : `user:${otherUser._id}`;

      if (!conversations.has(key)) {
        conversations.set(key, {
          key,

          user: otherUser,

          trip: message.trip || null,

          lastMessage: message,

          unreadCount: 0,
        });
      }

      if (
        String(message.recipient?._id) === String(userId) &&
        !message.read
      ) {
        conversations.get(key).unreadCount += 1;
      }
    }

    res.json({
      success: true,
      data: {
        conversations: Array.from(
          conversations.values()
        ),
      },
    });
  } catch (e) {
    next(e);
  }
}


/*
=========================================================
SEND MESSAGE
=========================================================
*/

async function send(req, res, next) {
  try {
    const senderId = req.user._id;

    const recipientId =
      String(req.body.recipientId || '').trim();

    const tripId =
      String(req.body.tripId || '').trim();

    const text =
      cleanText(req.body.text);

    if (!recipientId || !isObjectId(recipientId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid recipient is required',
      });
    }

    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot be empty',
      });
    }

    if (text.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot exceed 1000 characters',
      });
    }

    if (String(senderId) === recipientId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot message yourself',
      });
    }

    const recipient =
      await User.findById(recipientId)
        .select('_id fullName phone role status')
        .lean();

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found',
      });
    }

    if (recipient.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Recipient account is not active',
      });
    }

    let trip = null;

    if (tripId) {
      if (!isObjectId(tripId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid trip ID',
        });
      }

      trip =
        await Trip.findById(tripId)
          .select(
            '_id tripId rider driver status pickup destination'
          )
          .lean();

      if (!trip) {
        return res.status(404).json({
          success: false,
          message: 'Trip not found',
        });
      }

      const riderMatches =
        String(trip.rider) === String(senderId) ||
        String(trip.rider) === recipientId;

      const driverMatches =
        String(trip.driver) === String(senderId) ||
        String(trip.driver) === recipientId;

      if (!riderMatches && !driverMatches) {
        return res.status(403).json({
          success: false,
          message: 'You are not part of this trip',
        });
      }

      const participants = [
        String(trip.rider || ''),
        String(trip.driver || ''),
      ];

      if (
        !participants.includes(String(senderId)) ||
        !participants.includes(recipientId)
      ) {
        return res.status(403).json({
          success: false,
          message: 'These users are not participants in this trip',
        });
      }
    }

    const message =
      await Message.create({
        trip: trip?._id || null,

        sender: senderId,

        recipient: recipientId,

        text,

        read: false,
      });

    const populated =
      await Message.findById(message._id)
        .populate(
          'sender',
          'fullName phone role'
        )
        .populate(
          'recipient',
          'fullName phone role'
        )
        .populate(
          'trip',
          'tripId status pickup destination'
        )
        .lean();

    /*
    =====================================================
    REALTIME DELIVERY
    =====================================================
    */

    if (req.app.locals.io) {
      req.app.locals.io
        .to(`user:${recipientId}`)
        .emit(
          'message:new',
          {
            message: populated,
          }
        );

      req.app.locals.io
        .to(`user:${senderId}`)
        .emit(
          'message:sent',
          {
            message: populated,
          }
        );
    }

    res.status(201).json({
      success: true,

      message: 'Message sent',

      data: {
        message: populated,
      },
    });
  } catch (e) {
    next(e);
  }
}


/*
=========================================================
MARK READ
=========================================================
*/

async function markRead(req, res, next) {
  try {
    const userId = req.user._id;

    const tripId =
      String(req.body.tripId || '').trim();

    const senderId =
      String(req.body.senderId || '').trim();

    const filter = {
      recipient: userId,
      read: false,
    };

    if (tripId) {
      if (!isObjectId(tripId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid trip ID',
        });
      }

      filter.trip = tripId;
    }

    if (senderId) {
      if (!isObjectId(senderId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid sender ID',
        });
      }

      filter.sender = senderId;
    }

    const result =
      await Message.updateMany(
        filter,
        {
          $set: {
            read: true,
          },
        }
      );

    if (req.app.locals.io) {
      req.app.locals.io
        .to(`user:${userId}`)
        .emit(
          'message:read',
          {
            tripId: tripId || null,
            senderId: senderId || null,
          }
        );
    }

    res.json({
      success: true,
      data: {
        modifiedCount:
          result.modifiedCount || 0,
      },
    });
  } catch (e) {
    next(e);
  }
}


/*
=========================================================
EXPORTS
=========================================================
*/

module.exports = {
  conversation,
  listConversations,
  send,
  markRead,
};
