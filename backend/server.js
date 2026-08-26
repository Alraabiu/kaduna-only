const dns = require('dns');

dns.setServers([
  '8.8.8.8',
  '1.1.1.1'
]);


require('dotenv').config();


const crypto = require('crypto');


const paystackKeyCheck =
  String(
    process.env.PAYSTACK_SECRET_KEY || ''
  ).trim();


console.log('[PAYSTACK CONFIG]', {

  configured:
    !!paystackKeyCheck,

  environment:
    paystackKeyCheck.startsWith('sk_live_')
      ? 'live'
      : paystackKeyCheck.startsWith('sk_test_')
        ? 'test'
        : 'unknown',

  length:
    paystackKeyCheck.length,

  fingerprint:
    paystackKeyCheck
      ? crypto
          .createHash('sha256')
          .update(paystackKeyCheck)
          .digest('hex')
      : ''

});

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const connect = require('./config/db');

const User = require('./models/User');
const DriverProfile = require('./models/DriverProfile');
const Trip = require('./models/Trip');

const {
  setIO,
  emitDriverLocation
} = require('./realtime');

const {
  processDriverLocation
} = require('./services/destinationArrivalService');

const {
  initPush
} = require('./services/pushService');

const app = express();

/* =========================================================
   HTTP CONFIGURATION
========================================================= */

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

/*
 * IMPORTANT:
 *
 * Paystack webhook signature verification requires
 * the ORIGINAL request body.
 *
 * Express normally parses JSON and removes access
 * to the original raw bytes.
 *
 * We preserve those bytes only for the Paystack webhook.
 */

app.use(
  express.json({
    verify: (req, res, buf) => {
      if (
        req.originalUrl ===
        '/api/payments/paystack/webhook'
      ) {
        req.rawBody = Buffer.from(buf);
      }
    }
  })
);

app.use(morgan('dev'));

/* =========================================================
   HEALTH CHECK
========================================================= */
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    application: 'Kaduna Only',
    status: 'online',
    api: true,
    realtime: true,
    timestamp: new Date().toISOString()
  });
});
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    message: 'Kaduna Only API is running',
    realtime: true,
    host: '0.0.0.0',
    port: process.env.PORT || 5000
  });
});

/* =========================================================
   API ROUTES
========================================================= */

app.use(
  '/api/auth',
  require('./routes/auth.routes')
);

app.use(
  '/api/rider',
  require('./routes/rider.routes')
);

app.use(
  '/api/drivers',
  require('./routes/driver.routes')
);

app.use(
  '/api/trips',
  require('./routes/trip.routes')
);

app.use(
  '/api/maps',
  require('./routes/maps.routes')
);

app.use(
  '/api/wallet',
  require('./routes/wallet.routes')
);

app.use(
  '/api/admin',
  require('./routes/admin.routes')
);

app.use(
  '/api/push',
  require('./routes/push.routes')
);

app.use(
  '/api/payments',
  require('./routes/payment.routes')
);

/* =========================================================
   HTTP ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
  console.error(
    '[HTTP ERROR]',
    err
  );

  res.status(
    err.statusCode || 500
  ).json({
    success: false,
    message:
      err.message ||
      'Server error'
  });
});

/* =========================================================
   HTTP + SOCKET SERVER
========================================================= */

const server =
  http.createServer(app);

const io =
  new Server(server, {
    cors: {
      origin: true,
      credentials: true,
      methods: [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS'
      ]
    },

    transports: [
      'websocket',
      'polling'
    ],

    allowEIO3: true
  });

setIO(io);

/* =========================================================
   SOCKET AUTHENTICATION
========================================================= */

io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token;

    if (!token) {
      return next(
        new Error(
          'Authentication required'
        )
      );
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    const id =
      decoded.sub ||
      decoded.id ||
      decoded.userId ||
      decoded._id;

    if (!id) {
      return next(
        new Error(
          'Invalid authentication token'
        )
      );
    }

    const user =
      await User.findById(id).select(
        '_id role status fullName phone'
      );

    if (
      !user ||
      user.status !== 'active'
    ) {
      return next(
        new Error(
          'Account unavailable'
        )
      );
    }

    socket.user = user;

    next();

  } catch (e) {

    console.error(
      '[SOCKET AUTH]',
      e.message
    );

    next(
      new Error(
        'Invalid authentication'
      )
    );
  }
});

/* =========================================================
   ACTIVE TRIP STATUSES
========================================================= */

const ACTIVE_TRIP_STATUSES = [
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'TRIP_STARTED'
];

/* =========================================================
   BUILD ADMIN DRIVER SNAPSHOT
========================================================= */

async function getOnlineDriverSnapshot() {

  const onlineDrivers =
    await DriverProfile.find({
      online: true,
      verificationStatus:
        'approved'
    })
      .populate(
        'user',
        'fullName phone role status'
      )
      .lean();

  const activeTrips =
    await Trip.find({
      status: {
        $in:
          ACTIVE_TRIP_STATUSES
      }
    })
      .populate(
        'rider',
        'fullName phone'
      )
      .lean();

  const tripByDriver =
    new Map(
      activeTrips.map(
        trip => [
          String(
            trip.driver
          ),
          trip
        ]
      )
    );

  return onlineDrivers.map(
    profile => {

      const driverId =
        String(
          profile.user?._id ||
          profile.user
        );

      return {

        driverId,

        driver:
          profile.user
            ? {
                id: driverId,

                name:
                  profile.user
                    .fullName,

                phone:
                  profile.user
                    .phone,

                role:
                  profile.user
                    .role,

                status:
                  profile.user
                    .status
              }
            : null,

        vehicleType:
          profile.vehicleType,

        location:
          profile.location ||
          null,

        trip:
          tripByDriver.get(
            driverId
          ) || null
      };
    }
  );
}

/* =========================================================
   BROADCAST ADMIN DRIVER SNAPSHOT
========================================================= */

async function broadcastDriverSnapshot() {

  try {

    const drivers =
      await getOnlineDriverSnapshot();

    io
      .to('role:admin')
      .emit(
        'drivers:locations',
        {
          drivers,

          updatedAt:
            new Date()
        }
      );

  } catch (e) {

    console.error(
      '[DRIVER SNAPSHOT]',
      e
    );
  }
}

/* =========================================================
   SOCKET CONNECTION
========================================================= */

io.on(
  'connection',
  async socket => {

    const user =
      socket.user;

    const userId =
      String(user._id);

    console.log(
      `[SOCKET CONNECTED] ${user.role} ${user.fullName} (${userId})`
    );

    socket.join(
      `user:${userId}`
    );

    socket.join(
      `role:${user.role}`
    );

    /* =====================================================
       ADMIN INITIAL DRIVER SNAPSHOT
    ===================================================== */

    if (
      user.role === 'admin'
    ) {

      try {

        const drivers =
          await getOnlineDriverSnapshot();

        socket.emit(
          'drivers:locations',
          {
            drivers,

            updatedAt:
              new Date()
          }
        );

      } catch (e) {

        console.error(
          '[ADMIN SNAPSHOT]',
          e
        );
      }
    }

    /* =====================================================
       DRIVER ROOM INITIALIZATION
    ===================================================== */

    if (
      user.role === 'driver'
    ) {

      try {

        const profile =
          await DriverProfile.findOne(
            {
              user: user._id
            }
          ).select(
            'online verificationStatus vehicleType'
          );

        if (
          profile?.online &&
          profile.verificationStatus ===
            'approved'
        ) {

          socket.join(
            `drivers:online:${profile.vehicleType}`
          );
        }

      } catch (e) {

        console.error(
          '[DRIVER ROOM]',
          e
        );
      }
    }

    /* =====================================================
       REALTIME READY
    ===================================================== */

    socket.emit(
      'realtime:ready',
      {
        connected: true,

        userId,

        role:
          user.role,

        serverTime:
          new Date()
      }
    );

    /* =====================================================
       DRIVER AVAILABILITY
    ===================================================== */

    socket.on(
      'driver:availability',

      async (
        payload = {},
        ack = () => {}
      ) => {

        try {

          if (
            user.role !==
            'driver'
          ) {

            throw new Error(
              'Driver access required'
            );
          }

          const profile =
            await DriverProfile.findOne(
              {
                user: user._id
              }
            ).select(
              'online verificationStatus vehicleType'
            );

          if (
            !profile ||
            profile.verificationStatus !==
              'approved'
          ) {

            throw new Error(
              'Approved driver profile required'
            );
          }

          for (
            const room of [
              'bike',
              'keke',
              'car',
              'suv'
            ].map(
              v =>
                `drivers:online:${v}`
            )
          ) {

            socket.leave(
              room
            );
          }

          if (
            profile.online
          ) {

            socket.join(
              `drivers:online:${profile.vehicleType}`
            );
          }

          ack({
            success: true,

            online:
              profile.online,

            vehicleType:
              profile.vehicleType
          });

          await broadcastDriverSnapshot();

        } catch (e) {

          console.error(
            '[DRIVER AVAILABILITY]',
            e.message
          );

          ack({
            success: false,

            message:
              e.message
          });
        }
      }
    );

    /* =====================================================
       DRIVER GPS LOCATION
    ===================================================== */

    socket.on(
      'driver:location',

      async (
        payload = {},
        ack = () => {}
      ) => {

        try {

          if (
            user.role !==
            'driver'
          ) {

            throw new Error(
              'Driver access required'
            );
          }

          const latitude =
            Number(
              payload.latitude
            );

          const longitude =
            Number(
              payload.longitude
            );

          const accuracy =
            payload.accuracy == null
              ? undefined
              : Number(
                  payload.accuracy
                );

          if (
            !Number.isFinite(
              latitude
            ) ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(
              longitude
            ) ||
            longitude < -180 ||
            longitude > 180
          ) {

            throw new Error(
              'Valid latitude and longitude are required'
            );
          }

          const profile =
            await DriverProfile.findOneAndUpdate(
              {
                user:
                  user._id,

                verificationStatus:
                  'approved'
              },

              {
                $set: {
                  location: {
                    latitude,

                    longitude,

                    ...(Number.isFinite(
                      accuracy
                    )
                      ? {
                          accuracy
                        }
                      : {}),

                    updatedAt:
                      new Date()
                  }
                }
              },

              {
                returnDocument:
                  'after'
              }
            );

          if (!profile) {

            throw new Error(
              'Approved driver profile required'
            );
          }

          const active =
            await Trip.findOne({
              driver:
                user._id,

              status: {
                $in:
                  ACTIVE_TRIP_STATUSES
              }
            })
              .populate(
                'rider',
                'fullName phone'
              )
              .select(
                '_id tripId rider vehicleType pickup destination fare status arrivalStatus'
              );

          let arrival =
            null;

          if (active) {

            arrival =
              await processDriverLocation({
                trip:
                  active,

                latitude,

                longitude,

                accuracy
              });
          }

          emitDriverLocation({

            driverId:
              user._id,

            riderId:
              active?.rider?._id ||
              active?.rider ||
              null,

            tripId:
              active?._id ||
              null,

            location:
              profile.location,

            driver: {
              id:
                String(
                  user._id
                ),

              name:
                user.fullName,

              role:
                user.role
            },

            trip:
              active ||
              null
          });

          ack({

            success: true,

            location:
              profile.location,

            tripId:
              active?._id ||
              null,

            arrival:
              arrival
                ? {
                    state:
                      arrival.state,

                    distanceMeters:
                      arrival.distanceMeters
                  }
                : null
          });

        } catch (e) {

          console.error(
            '[DRIVER LOCATION]',
            e.message
          );

          ack({

            success: false,

            message:
              e.message
          });
        }
      }
    );

    /* =====================================================
       SOCKET DISCONNECT
    ===================================================== */

    socket.on(
      'disconnect',
      reason => {

        console.log(
          `[SOCKET DISCONNECTED] ${user.role} ${user.fullName} (${userId}) - ${reason}`
        );
      }
    );
  }
);

/* =========================================================
   SERVER STARTUP
========================================================= */

const port =
  Number(
    process.env.PORT
  ) || 5000;

const HOST =
  process.env.HOST ||
  '0.0.0.0';

connect()
  .then(() => {

    initPush();

    server.listen(
      port,
      HOST,
      () => {

        console.log(
          `Kaduna Only API + realtime + push running on http://${HOST}:${port}`
        );

        console.log(
          `Health check: http://localhost:${port}/api/health`
        );

        console.log(
          `LAN health check: http://<YOUR-PC-IP>:${port}/api/health`
        );
      }
    );

  })
  .catch(e => {

    console.error(
      'MongoDB connection failed',
      e
    );

    process.exit(1);
  });