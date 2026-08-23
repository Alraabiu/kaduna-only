import React,{useEffect,useRef,useState}from'react';
import{
  Phone,
  RefreshCw,
  XCircle,
  Radio,
  MapPin,
  Clock,
  Navigation2,
  CheckCircle,
  AlertTriangle
}from'lucide-react';
import{useParams}from'react-router-dom';

import{
  RiderLayout,
  PageHeader,
  api,
  Badge,
  statusTone,
  formatMoney,
  useApp,
  Button
}from'../../shared';

import LiveMap from'../../components/LiveMap';

const prePickup=[
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED'
];

export default function TripDetails(){

  const{id}=useParams();

  const[t,setT]=useState(null);
  const[loading,setLoading]=useState(true);
  const[driverLocation,setDriverLocation]=useState(null);
  const[route,setRoute]=useState(null);
  const[liveRoute,setLiveRoute]=useState(null);
  const[liveEta,setLiveEta]=useState(null);
  const[confirmOpen,setConfirmOpen]=useState(false);
  const[confirming,setConfirming]=useState(false);

  const{
    notify,
    socket
  }=useApp();

  const routeTimer=
    useRef(null);

  async function load(
    silent=false
  ){

    if(!silent)
      setLoading(true);

    try{

      const r=
        await api(
          `/trips/${id}`
        );

      setT(
        r.data.trip
      );

      if(
        r.data.driverLocation
      ){
        setDriverLocation(
          r.data.driverLocation
        );
      }

    }catch(e){

      notify(
        e.message
      );

    }finally{

      if(!silent)
        setLoading(false);

    }
  }

  useEffect(()=>{
    load();
  },[id]);

  useEffect(()=>{

    if(
      !t?.pickup?.lat||
      !t?.destination?.lat
    )
      return;

    api(
      '/maps/route',
      {
        method:'POST',
        body:JSON.stringify({
          pickup:t.pickup,
          destination:t.destination
        })
      }
    )
    .then(r=>
      setRoute(
        r.data.route.geometry
      )
    )
    .catch(()=>{});

  },[
    t?._id,
    t?.pickup?.lat,
    t?.destination?.lat
  ]);

  async function refreshDriverRoute(
    location,
    trip=t
  ){

    if(
      !location||
      !trip||
      ![
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'TRIP_STARTED'
      ].includes(trip.status)
    )
      return;

    const target=
      trip.status==='TRIP_STARTED'
        ?trip.destination
        :trip.pickup;

    try{

      const r=
        await api(
          '/maps/route',
          {
            method:'POST',
            body:JSON.stringify({
              pickup:{
                label:'Driver',
                lat:location.latitude,
                lng:location.longitude
              },
              destination:target
            })
          }
        );

      setLiveRoute(
        r.data.route.geometry
      );

      setLiveEta({
        minutes:
          r.data.route.durationMinutes,
        distanceKm:
          r.data.route.distanceKm,
        target:
          trip.status==='TRIP_STARTED'
            ?'destination'
            :'pickup'
      });

    }catch{}

  }

  useEffect(()=>{

    if(
      driverLocation&&
      t
    ){

      clearTimeout(
        routeTimer.current
      );

      routeTimer.current=
        setTimeout(
          ()=>{
            refreshDriverRoute(
              driverLocation,
              t
            );
          },
          400
        );

      return()=>{
        clearTimeout(
          routeTimer.current
        );
      };
    }

  },[
    driverLocation?.latitude,
    driverLocation?.longitude,
    t?.status
  ]);

  useEffect(()=>{

    if(!socket)
      return;

    const onTrip=
      payload=>{

        const trip=
          payload?.trip;

        if(
          trip&&
          String(trip._id)===
          String(id)
        ){

          setT(trip);

          if(
            trip.status===
            'TRIP_COMPLETED'
          ){

            setConfirmOpen(false);

            notify({
              title:'Destination reached',
              message:
                'Your trip has been completed successfully.',
              tone:'success'
            });
          }

          if(
            trip.riderArrivalConfirmed
          ){
            setConfirmOpen(false);
          }
        }
      };

    const onLocation=
      payload=>{

        if(
          String(payload?.tripId)===
          String(id)
        ){

          setDriverLocation(
            payload.location
          );
        }

      };

    socket.on(
      'trip:updated',
      onTrip
    );

    socket.on(
      'driver:location',
      onLocation
    );

    return()=>{

      socket.off(
        'trip:updated',
        onTrip
      );

      socket.off(
        'driver:location',
        onLocation
      );

    };

  },[
    socket,
    id
  ]);

  async function confirmArrival(){

    try{

      setConfirming(true);

      const r=
        await api(
          `/trips/${id}/destination/confirm`,
          {
            method:'POST'
          }
        );

      setT(
        r.data.trip
      );

      setConfirmOpen(false);

      notify({
        title:'Arrival confirmed',
        message:
          'The driver has been notified. You can now wait for the trip to be completed.',
        tone:'success',
        duration:7000
      });

    }catch(e){

      notify(
        e.message
      );

    }finally{

      setConfirming(false);

    }
  }

  async function disputeArrival(){

    try{

      const r=
        await api(
          `/trips/${id}/destination/dispute`,
          {
            method:'POST',
            body:JSON.stringify({
              reason:
                'Rider says destination has not yet been reached.'
            })
          }
        );

      setT(
        r.data.trip
      );

      setConfirmOpen(false);

      notify({
        title:'Trip remains active',
        message:
          'The driver has been notified to continue to the destination.',
        tone:'success'
      });

    }catch(e){

      notify(
        e.message
      );

    }
  }

  async function cancel(){

    try{

      const r=
        await api(
          `/trips/${id}/cancel`,
          {
            method:'PATCH'
          }
        );

      setT(
        r.data.trip
      );

      notify(
        'Trip cancelled'
      );

    }catch(e){

      notify(
        e.message
      );

    }
  }

  const driverComing=
    prePickup.includes(
      t?.status
    );

  const inTrip=
    t?.status===
    'TRIP_STARTED';

  const riderConfirmed=
    Boolean(
      t?.riderArrivalConfirmed
    )&&
    t?.arrivalStatus===
    'rider_confirmed';

  const canConfirmArrival=
    inTrip&&
    !riderConfirmed;

  return(

    <RiderLayout>

      <PageHeader
        title="Trip Details"
        subtitle="Track your driver live from acceptance to arrival."
        action={
          <Button
            variant="secondary"
            onClick={()=>load()}
          >
            <RefreshCw size={16}/>
            Refresh
          </Button>
        }
      />

      {loading ? (

        <div className="panel loading">
          Loading trip…
        </div>

      ):t ? (

        <>

          <div className="panel trip-map-panel">

            <LiveMap
              pickup={t.pickup}
              destination={t.destination}
              driverLocation={
                driverLocation
              }
              routeGeometry={route}
              liveRouteGeometry={
                liveRoute
              }
              height={430}
              followDriver={
                !!driverLocation
              }
            />

          </div>

          {driverLocation&&
            [
              'DRIVER_ASSIGNED',
              'DRIVER_ARRIVING',
              'DRIVER_ARRIVED',
              'TRIP_STARTED'
            ].includes(t.status)&&

            <div className="live-driver-card">

              <div className="live-driver-head">

                <span className="live-pulse"/>

                <div>

                  <b>
                    {
                      driverComing
                        ?'Driver is on the way to you'
                        :inTrip
                          ?'Trip in progress'
                          :'Driver location live'
                    }
                  </b>

                  <small>
                    Location updates automatically as the driver moves.
                  </small>

                </div>

                <Radio size={20}/>

              </div>

              {liveEta&&

                <div className="live-driver-metrics">

                  <span>
                    <Clock size={16}/>
                    <b>
                      {Math.max(
                        1,
                        Math.round(
                          liveEta.minutes
                        )
                      )} min
                    </b>
                    <small>
                      to {liveEta.target}
                    </small>
                  </span>

                  <span>
                    <Navigation2 size={16}/>
                    <b>
                      {Number(
                        liveEta.distanceKm
                      ).toFixed(1)} km
                    </b>
                    <small>
                      remaining
                    </small>
                  </span>

                  <span>
                    <MapPin size={16}/>
                    <b>LIVE</b>
                    <small>
                      {
                        new Date(
                          driverLocation.updatedAt||
                          Date.now()
                        ).toLocaleTimeString()
                      }
                    </small>
                  </span>

                </div>

              }

            </div>
          }

          <div className="panel">

            <div className="trip-top">

              <b>{t.tripId}</b>

              <Badge
                tone={statusTone(
                  t.status
                )}
              >
                {t.status.replaceAll(
                  '_',
                  ' '
                )}
              </Badge>

            </div>

            <h2>
              {t.pickup?.label}
              {' → '}
              {t.destination?.label}
            </h2>

            <p>
              Fare:
              {' '}
              <strong>
                {formatMoney(t.fare)}
              </strong>
            </p>

            <p>
              Distance:
              {' '}
              <strong>
                {t.distanceKm} km
              </strong>
              {' • '}
              ETA:
              {' '}
              <strong>
                {t.estimatedMinutes} min
              </strong>
            </p>

            <p>
              Payment:
              {' '}
              <strong>
                {t.paymentMethod}
              </strong>
            </p>

            <p>
              Driver:
              {' '}
              <strong>
                {
                  t.driver?.fullName||
                  'Searching for a driver…'
                }
              </strong>

              {' '}

              {t.driver?.phone&&

                <a
                  className="text-link"
                  href={`tel:${t.driver.phone}`}
                >
                  <Phone size={15}/>
                  Call driver
                </a>
              }

            </p>

            {driverLocation&&

              <div className="notice success">

                <b>
                  <Radio size={15}/>
                  Live driver tracking active
                </b>

                <p>
                  <MapPin size={14}/>
                  Last GPS update
                  {' '}
                  {
                    new Date(
                      driverLocation.updatedAt||
                      Date.now()
                    ).toLocaleTimeString()
                  }
                </p>

              </div>
            }

            {riderConfirmed&&

              <div className="notice success">

                <b>
                  <CheckCircle size={16}/>
                  You confirmed your arrival
                </b>

                <p>
                  The driver has been authorized
                  to complete the trip.
                </p>

              </div>
            }

            {canConfirmArrival&&

              <div className="destination-arrival-box">

                <div className="notice">

                  <b>
                    <MapPin size={16}/>
                    Have you reached your destination?
                  </b>

                  <p>
                    Please confirm only when you
                    are actually at your selected
                    destination.
                  </p>

                </div>

                <Button
                  full
                  onClick={()=>
                    setConfirmOpen(true)
                  }
                >
                  <CheckCircle size={16}/>
                  I've Arrived
                </Button>

              </div>
            }

            {[
              'SEARCHING_DRIVER',
              'DRIVER_ASSIGNED',
              'DRIVER_ARRIVING'
            ].includes(t.status)&&

              <Button
                variant="danger"
                onClick={cancel}
              >
                <XCircle size={16}/>
                Cancel Ride
              </Button>
            }

          </div>

        </>

      ): (

        <div className="panel">
          Trip not found.
        </div>

      )}

      {confirmOpen&&

        <div
          className="confirmation-overlay"
          role="dialog"
          aria-modal="true"
        >

          <div className="confirmation-modal">

            <div className="confirmation-icon">
              <AlertTriangle size={28}/>
            </div>

            <h2>
              Are you sure?
            </h2>

            <p>
              Please confirm that you have
              actually reached your destination.
              Your answer will determine whether
              the driver can complete this trip.
            </p>

            <div className="confirmation-actions">

              <Button
                variant="secondary"
                full
                onClick={()=>
                  setConfirmOpen(false)
                }
                disabled={confirming}
              >
                No, Not Yet
              </Button>

              <Button
                full
                onClick={
                  confirmArrival
                }
                disabled={confirming}
              >
                <CheckCircle size={16}/>

                {
                  confirming
                    ?'Confirming…'
                    :"Yes, I've Arrived"
                }

              </Button>

            </div>

          </div>

        </div>
      }

    </RiderLayout>
  );
}