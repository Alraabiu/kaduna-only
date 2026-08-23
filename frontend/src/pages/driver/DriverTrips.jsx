import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  Navigation,
  Map,
  Play,
  CheckCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  DriverLayout,
  PageHeader,
  Badge,
  api,
  formatMoney,
  statusTone,
  Button,
  useApp,
  Empty
} from '../../shared';


const ACTIVE_STATUSES = [
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'TRIP_STARTED'
];


const NEXT_STATUS = {
  DRIVER_ASSIGNED: 'DRIVER_ARRIVING',
  DRIVER_ARRIVING: 'DRIVER_ARRIVED',
  DRIVER_ARRIVED: 'TRIP_STARTED'
};


const STATUS_LABEL = {
  DRIVER_ASSIGNED: 'Start Arrival',
  DRIVER_ARRIVING: 'Mark Arrived',
  DRIVER_ARRIVED: 'Start Trip'
};


export default function DriverTrips() {

  const { notify, socket } = useApp();

  const [trips, setTrips] = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyTrip, setBusyTrip] = useState(null);


  /*
   * =========================================================
   * LOAD DRIVER TRIPS
   * =========================================================
   *
   * This is ONLY the Driver Trips LIST page.
   *
   * It deliberately does NOT use:
   *
   * useParams()
   * /trips/:id
   * /completion-request
   *
   * Individual trip operations belong to DriverTrip.jsx.
   */
  async function load(silent = false) {

    if (!silent) {
      setLoading(true);
    }

    try {

      const [
        historyResponse,
        availableResponse
      ] = await Promise.all([

        api('/trips'),

        api('/trips/available').catch(() => ({
          data: {
            trips: []
          }
        }))

      ]);


      setTrips(
        historyResponse?.data?.trips || []
      );


      setAvailable(
        availableResponse?.data?.trips || []
      );


    } catch (e) {

      notify({
        title: 'Unable to load trips',
        message:
          e?.message ||
          'Trips could not be loaded.',
        tone: 'error',
        duration: 6000
      });


    } finally {

      if (!silent) {
        setLoading(false);
      }

    }

  }


  /*
   * =========================================================
   * INITIAL LOAD
   * =========================================================
   */
  useEffect(() => {

    load();

  }, []);


  /*
   * =========================================================
   * REALTIME TRIP REFRESH
   * =========================================================
   */
  useEffect(() => {

    if (!socket) {
      return;
    }


    const refreshTrips = () => {
      load(true);
    };


    socket.on(
      'trip:new',
      refreshTrips
    );

    socket.on(
      'trip:taken',
      refreshTrips
    );

    socket.on(
      'trip:updated',
      refreshTrips
    );


    return () => {

      socket.off(
        'trip:new',
        refreshTrips
      );

      socket.off(
        'trip:taken',
        refreshTrips
      );

      socket.off(
        'trip:updated',
        refreshTrips
      );

    };

  }, [socket]);


  /*
   * =========================================================
   * ACCEPT AVAILABLE TRIP
   * =========================================================
   */
  async function acceptTrip(tripId) {

    if (!tripId || busyTrip) {
      return;
    }


    setBusyTrip(tripId);


    try {

      const response = await api(
        `/trips/${tripId}/accept`,
        {
          method: 'POST'
        }
      );


      const trip =
        response?.data?.trip;


      if (!trip?._id) {

        throw new Error(
          'The server did not return the accepted trip.'
        );

      }


      notify({
        title: 'Ride accepted',
        message:
          'The ride has been assigned to you.',
        tone: 'success',
        duration: 5000
      });


      /*
       * Open the individual active-trip page.
       */
      window.location.href =
        `/driver/trip/${trip._id}`;


    } catch (e) {

      notify({
        title: 'Unable to accept trip',
        message:
          e?.message ||
          'The ride could not be accepted.',
        tone: 'error',
        duration: 6000
      });


      await load(true);


    } finally {

      setBusyTrip(null);

    }

  }


  /*
   * =========================================================
   * NORMAL TRIP PROGRESSION
   * =========================================================
   *
   * Only:
   *
   * DRIVER_ASSIGNED
   * DRIVER_ARRIVING
   * DRIVER_ARRIVED
   *
   * use /advance from this page.
   *
   * TRIP_STARTED is completed from DriverTrip.jsx,
   * where GPS and rider confirmation are handled.
   */
  async function advanceTrip(trip) {

    if (
      !trip?._id ||
      !NEXT_STATUS[trip.status] ||
      busyTrip
    ) {
      return;
    }


    setBusyTrip(trip._id);


    try {

      const response = await api(
        `/trips/${trip._id}/advance`,
        {
          method: 'PATCH',

          body: JSON.stringify({
            from: trip.status
          })
        }
      );


      const updatedTrip =
        response?.data?.trip;


      if (!updatedTrip) {

        throw new Error(
          'The server did not return the updated trip.'
        );

      }


      setTrips(previousTrips =>
        previousTrips.map(item =>
          String(item._id) ===
          String(updatedTrip._id)
            ? updatedTrip
            : item
        )
      );


      notify(
        updatedTrip.status
          .replaceAll('_', ' ')
      );


    } catch (e) {

      notify({
        title: 'Unable to update trip',
        message:
          e?.message ||
          'Trip status could not be updated.',
        tone: 'error',
        duration: 6000
      });


      await load(true);


    } finally {

      setBusyTrip(null);

    }

  }


  /*
   * =========================================================
   * LOADING STATE
   * =========================================================
   */
  if (loading) {

    return (
      <DriverLayout>

        <PageHeader
          title="Trips"
          subtitle="Available rides, active trips and trip history."
          action={
            <Button
              variant="secondary"
              onClick={() => load()}
            >
              <RefreshCw size={16} />
              Refresh
            </Button>
          }
        />

        <div className="panel loading">
          Loading trips...
        </div>

      </DriverLayout>
    );

  }


  /*
   * =========================================================
   * ACTIVE TRIPS
   * =========================================================
   */
  const activeTrips =
    trips.filter(trip =>
      ACTIVE_STATUSES.includes(
        trip.status
      )
    );


  /*
   * =========================================================
   * HISTORY
   * =========================================================
   */
  const historyTrips =
    trips.filter(trip =>
      !ACTIVE_STATUSES.includes(
        trip.status
      )
    );


  /*
   * =========================================================
   * DRIVER TRIPS PAGE
   * =========================================================
   */
  return (
    <DriverLayout>

      <PageHeader
        title="Trips"
        subtitle="Available rides, active trips and your trip history."
        action={
          <Button
            variant="secondary"
            onClick={() => load()}
          >
            <RefreshCw size={16} />
            Refresh
          </Button>
        }
      />


      {/* =====================================================
          AVAILABLE RIDE REQUESTS
          ===================================================== */}
      <div className="panel">

        <div className="panel-title">

          <div>

            <h3>
              Available ride requests
            </h3>

            <p>
              New matching ride requests appear here automatically.
            </p>

          </div>

          <Badge>
            {available.length} available
          </Badge>

        </div>


        {available.length === 0 ? (

          <div className="empty">

            <Navigation size={32} />

            <h3>
              No available requests
            </h3>

            <p className="muted">
              Matching ride requests will appear here
              when you are online.
            </p>

          </div>

        ) : (

          <div className="request-list">

            {available.map(trip => (

              <div
                className="request-row"
                key={trip._id}
              >

                <div className="request-icon">
                  <Navigation size={19} />
                </div>


                <div>

                  <b>
                    {trip.pickup?.label}
                    {' → '}
                    {trip.destination?.label}
                  </b>

                  <small>
                    {trip.rider?.fullName || 'Rider'}
                    {' · '}
                    {trip.tripId}
                  </small>

                </div>


                <strong>
                  {formatMoney(trip.fare)}
                </strong>


                <Button
                  onClick={() =>
                    acceptTrip(trip._id)
                  }
                  disabled={
                    busyTrip === trip._id
                  }
                >
                  {busyTrip === trip._id
                    ? 'Accepting...'
                    : 'Accept'}
                </Button>

              </div>

            ))}

          </div>

        )}

      </div>


      {/* =====================================================
          ACTIVE TRIPS
          ===================================================== */}
      <div className="panel">

        <div className="panel-title">

          <div>

            <h3>
              Active trips
            </h3>

            <p>
              Trips currently assigned to you.
            </p>

          </div>

          <Badge tone="warning">
            {activeTrips.length} active
          </Badge>

        </div>


        {activeTrips.length === 0 ? (

          <p className="muted">
            You have no active trips.
          </p>

        ) : (

          <div className="trip-list">

            {activeTrips.map(trip => (

              <div
                className="trip-card"
                key={trip._id}
              >

                <div className="trip-icon">
                  <Navigation size={19} />
                </div>


                <div className="trip-main">

                  <div className="trip-top">

                    <b>
                      {trip.tripId}
                    </b>

                    <Badge
                      tone={statusTone(
                        trip.status
                      )}
                    >
                      {trip.status.replaceAll(
                        '_',
                        ' '
                      )}
                    </Badge>

                  </div>


                  <p>
                    {trip.pickup?.label}
                    {' → '}
                    {trip.destination?.label}
                  </p>


                  <small>
                    {trip.rider?.fullName || 'Rider'}
                    {' · '}
                    {formatMoney(trip.fare)}
                  </small>

                </div>


                <div className="action-row">

                  <Link
                    className="btn secondary"
                    to={`/driver/trip/${trip._id}`}
                  >
                    <Map size={14} />
                    Open Trip
                  </Link>


                  {NEXT_STATUS[
                    trip.status
                  ] && (

                    <Button
                      variant="secondary"
                      onClick={() =>
                        advanceTrip(trip)
                      }
                      disabled={
                        busyTrip === trip._id
                      }
                    >
                      <Play size={14} />

                      {busyTrip === trip._id
                        ? 'Updating...'
                        : STATUS_LABEL[
                            trip.status
                          ]}
                    </Button>

                  )}

                </div>

              </div>

            ))}

          </div>

        )}

      </div>


      {/* =====================================================
          TRIP HISTORY
          ===================================================== */}
      <div className="panel">

        <div className="panel-title">

          <div>

            <h3>
              Trip history
            </h3>

            <p>
              Completed and previous trips assigned to you.
            </p>

          </div>

          <Badge>
            {historyTrips.length} trips
          </Badge>

        </div>


        {historyTrips.length === 0 ? (

          <Empty
            title="No trip history"
            text="Your completed trips will appear here."
          />

        ) : (

          <div className="table-wrap">

            <table>

              <thead>

                <tr>

                  <th>
                    Trip
                  </th>

                  <th>
                    Route
                  </th>

                  <th>
                    Rider
                  </th>

                  <th>
                    Fare
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Action
                  </th>

                </tr>

              </thead>


              <tbody>

                {historyTrips.map(trip => (

                  <tr
                    key={trip._id}
                  >

                    <td>

                      <strong>
                        {trip.tripId}
                      </strong>

                    </td>


                    <td>

                      {trip.pickup?.label}
                      {' → '}
                      {trip.destination?.label}

                    </td>


                    <td>

                      {trip.rider?.fullName || '—'}

                    </td>


                    <td>

                      {formatMoney(
                        trip.fare
                      )}

                    </td>


                    <td>

                      <Badge
                        tone={statusTone(
                          trip.status
                        )}
                      >
                        {trip.status.replaceAll(
                          '_',
                          ' '
                        )}
                      </Badge>

                    </td>


                    <td>

                      {trip.status ===
                      'TRIP_COMPLETED' ? (

                        <span className="muted">

                          <CheckCircle
                            size={14}
                          />

                          Completed

                        </span>

                      ) : (

                        <span className="muted">
                          —
                        </span>

                      )}

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </DriverLayout>
  );

}