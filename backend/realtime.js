let ioInstance = null;


/*
=========================================================
ID HELPER
=========================================================
*/

function idOf(value) {

  if (!value) {

    return null;

  }


  return String(
    value._id || value
  );

}



/*
=========================================================
SET SOCKET INSTANCE
=========================================================
*/

function setIO(io) {

  ioInstance = io;

}



/*
=========================================================
GET SOCKET INSTANCE
=========================================================
*/

function getIO() {

  return ioInstance;

}



/*
=========================================================
TRIP EVENT EMITTER
=========================================================
*/

function emitTrip(
  event,
  trip
) {


  if (
    !ioInstance ||
    !trip
  ) {

    return;

  }



  const payload = {

    event,

    trip

  };



  const rider =
    idOf(
      trip.rider
    );


  const driver =
    idOf(
      trip.driver
    );



  if (
    rider
  ) {

    ioInstance
      .to(
        `user:${rider}`
      )
      .emit(
        event,
        payload
      );

  }



  if (
    driver
  ) {

    ioInstance
      .to(
        `user:${driver}`
      )
      .emit(
        event,
        payload
      );

  }



  ioInstance
    .to(
      'role:admin'
    )
    .emit(
      event,
      payload
    );


}




/*
=========================================================
NEW TRIP NOTIFICATION
=========================================================
*/

function emitNewTrip(
  trip
) {


  if (
    !ioInstance ||
    !trip
  ) {

    return;

  }



  const vehicleType =
    String(
      trip.vehicleType || ''
    )
      .trim()
      .toLowerCase();



  const driverRoom =
    `drivers:online:${vehicleType}`;



  const payload = {

    event:
      'trip:new',

    trip

  };



  ioInstance
    .to(
      driverRoom
    )
    .emit(
      'trip:new',
      payload
    );



  ioInstance
    .to(
      'role:admin'
    )
    .emit(
      'trip:new',
      payload
    );


}




/*
=========================================================
TRIP TAKEN
=========================================================
*/

function emitTripTaken(
  trip
) {


  if (
    !ioInstance ||
    !trip
  ) {

    return;

  }



  ioInstance
    .to(
      'role:driver'
    )
    .emit(

      'trip:taken',

      {

        event:
          'trip:taken',


        tripId:
          idOf(
            trip
          ),


        vehicleType:
          trip.vehicleType

      }

    );


}




/*
=========================================================
DRIVER LIVE LOCATION
=========================================================
*/


function emitDriverLocation({

  driverId,

  riderId = null,

  tripId = null,

  location,

  driver = null,

  trip = null

}) {



  if (

    !ioInstance ||

    !driverId ||

    !location

  ) {

    return;

  }



  const payload = {


    event:
      'driver:location',



    driverId:
      String(
        driverId
      ),



    tripId:

      tripId

        ? String(
            tripId
          )

        : null,



    location: {


      latitude:
        Number(
          location.latitude
        ),



      longitude:
        Number(
          location.longitude
        ),



      accuracy:
        location.accuracy ||
        null,



      updatedAt:
        location.updatedAt ||
        new Date()

    },



    driver,

    trip

  };




  /*
  =======================================================
  ADMIN LIVE MONITORING
  =======================================================
  */


  ioInstance
    .to(
      'role:admin'
    )
    .emit(

      'driver:location',

      payload

    );






  /*
  =======================================================
  RIDER LIVE MAP
  =======================================================
  */


  if (
    riderId
  ) {


    ioInstance
      .to(
        `user:${String(riderId)}`
      )
      .emit(

        'driver:location',

        payload

      );


  }





  /*
  =======================================================
  DRIVER CONFIRMATION
  =======================================================
  */


  ioInstance
    .to(
      `user:${String(driverId)}`
    )
    .emit(

      'driver:location:sent',

      {

        success:
          true,

        tripId:
          tripId
            ? String(tripId)
            : null

      }

    );


}




module.exports = {


  setIO,

  getIO,

  emitTrip,

  emitNewTrip,

  emitTripTaken,

  emitDriverLocation


};