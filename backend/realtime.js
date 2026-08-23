let ioInstance = null;

function idOf(v) {
  return v ? String(v._id || v) : null;
}

function setIO(io) {
  ioInstance = io;
}

function getIO() {
  return ioInstance;
}

function emitTrip(event, trip) {
  if (!ioInstance || !trip) return;

  const payload = { event, trip };

  const rider = idOf(trip.rider);
  const driver = idOf(trip.driver);

  if (rider) {
    ioInstance.to(`user:${rider}`).emit(event, payload);
  }

  if (driver) {
    ioInstance.to(`user:${driver}`).emit(event, payload);
  }

  ioInstance.to('role:admin').emit(event, payload);
}

function emitNewTrip(trip) {
  if (!ioInstance || !trip) return;

  ioInstance
    .to(`drivers:online:${trip.vehicleType}`)
    .emit('trip:new', {
      event: 'trip:new',
      trip
    });

  ioInstance.to('role:admin').emit('trip:new', {
    event: 'trip:new',
    trip
  });
}

function emitTripTaken(trip) {
  if (!ioInstance) return;

  ioInstance.to('role:driver').emit('trip:taken', {
    event: 'trip:taken',
    tripId: idOf(trip),
    vehicleType: trip?.vehicleType
  });
}

/**
 * Broadcast the latest driver location.
 *
 * Admin receives every approved driver's location.
 * Rider receives location only when the driver is assigned
 * to that rider's active trip.
 */
function emitDriverLocation({
  driverId,
  riderId = null,
  tripId = null,
  location,
  driver = null,
  trip = null
}) {
  if (!ioInstance || !driverId || !location) return;

  const payload = {
    driverId: String(driverId),
    tripId: tripId ? String(tripId) : null,
    location,
    driver,
    trip
  };

  // Admin receives every driver's live position.
  ioInstance.to('role:admin').emit('driver:location', payload);

  // Rider only receives the location of their assigned driver.
  if (riderId) {
    ioInstance
      .to(`user:${String(riderId)}`)
      .emit('driver:location', payload);
  }
}

module.exports = {
  setIO,
  getIO,
  emitTrip,
  emitNewTrip,
  emitTripTaken,
  emitDriverLocation
};