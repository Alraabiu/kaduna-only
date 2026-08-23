import React,{useEffect,useState}from'react';
import{useParams,useNavigate}from'react-router-dom';
import{Play,RefreshCw,Radio,MapPin,CheckCircle,Clock,ShieldCheck}from'lucide-react';
import{DriverLayout,PageHeader,api,useApp,Button,Badge,statusTone,formatMoney}from'../../shared';
import LiveMap from'../../components/LiveMap';

const next={
  DRIVER_ASSIGNED:'DRIVER_ARRIVING',
  DRIVER_ARRIVING:'DRIVER_ARRIVED',
  DRIVER_ARRIVED:'TRIP_STARTED'
};

const label={
  DRIVER_ASSIGNED:'Start Arrival',
  DRIVER_ARRIVING:'Mark Arrived',
  DRIVER_ARRIVED:'Start Trip'
};

const activeStatuses=[
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'TRIP_STARTED'
];

export default function DriverTrip(){

  const{id}=useParams();
  const nav=useNavigate();
  const{notify,socket}=useApp();

  const[t,setT]=useState(null);
  const[route,setRoute]=useState(null);
  const[me,setMe]=useState(null);
  const[gps,setGps]=useState('starting');
  const[completionRequested,setCompletionRequested]=useState(false);
  const[completionBusy,setCompletionBusy]=useState(false);

  async function load(){

    try{

      const r=await api(`/trips/${id}`);

      const trip=r.data.trip;

      setT(trip);

      if(
        trip?.riderArrivalConfirmed===true||
        trip?.arrivalStatus==='rider_confirmed'
      ){
        setCompletionRequested(true);
      }

      const d=await api('/drivers/me');

      setMe(d.data.profile?.location||null);

    }catch(e){

      notify(e.message);

    }

  }

  useEffect(()=>{
    load();
  },[id]);

  useEffect(()=>{

    if(!t?.pickup?.lat||!t?.destination?.lat)return;

    api('/maps/route',{
      method:'POST',
      body:JSON.stringify({
        pickup:t.pickup,
        destination:t.destination
      })
    })
    .then(r=>setRoute(r.data.route.geometry))
    .catch(()=>{});

  },[
    t?._id,
    t?.pickup?.lat,
    t?.destination?.lat
  ]);

  useEffect(()=>{

    if(!socket)return;

    const onTripUpdated=p=>{

      if(String(p?.trip?._id)!==String(id))return;

      const trip=p.trip;

      setT(trip);

      if(
        trip?.riderArrivalConfirmed===true||
        trip?.arrivalStatus==='rider_confirmed'
      ){
        setCompletionRequested(true);
      }

      if(trip?.status==='TRIP_COMPLETED'){

        notify({
          title:'Trip completed',
          message:'The trip has been completed successfully.',
          tone:'success',
          duration:6000
        });

        setTimeout(()=>{
          nav('/driver');
        },800);

      }

    };

    const onDestinationConfirmed=p=>{

      if(String(p?.trip?._id)!==String(id))return;

      const trip=p.trip;

      setT(trip);
      setCompletionRequested(true);

      notify({
        title:'Rider confirmed arrival',
        message:'The rider has confirmed that they reached the destination. You can now complete the trip.',
        tone:'success',
        duration:7000
      });

    };

    socket.on('trip:updated',onTripUpdated);
    socket.on('destination:confirmed',onDestinationConfirmed);

    return()=>{

      socket.off('trip:updated',onTripUpdated);
      socket.off('destination:confirmed',onDestinationConfirmed);

    };

  },[socket,id,nav]);

  useEffect(()=>{

    if(
      !socket||
      !navigator.geolocation||
      !t||
      !activeStatuses.includes(t.status)
    ){
      return;
    }

    setGps('starting');

    const wid=navigator.geolocation.watchPosition(

      pos=>{

        const loc={
          latitude:pos.coords.latitude,
          longitude:pos.coords.longitude,
          accuracy:pos.coords.accuracy,
          updatedAt:new Date().toISOString()
        };

        setMe(loc);
        setGps('live');

        socket.emit(
          'driver:location',
          {
            latitude:loc.latitude,
            longitude:loc.longitude,
            accuracy:loc.accuracy
          },
          ack=>{

            if(ack&&!ack.success){

              setGps('error');

              notify(
                ack.message||
                'GPS update failed'
              );

            }

          }
        );

      },

      err=>{

        setGps('error');

        notify(
          err.code===1
            ?'Please allow location access so the rider can track you.'
            :'Unable to read your current GPS location.'
        );

      },

      {
        enableHighAccuracy:true,
        maximumAge:2000,
        timeout:15000
      }

    );

    return()=>{
      navigator.geolocation.clearWatch(wid);
    };

  },[
    socket,
    t?._id,
    t?.status
  ]);

  /*
   * NORMAL PROGRESSION:
   * DRIVER_ASSIGNED -> DRIVER_ARRIVING
   * DRIVER_ARRIVING -> DRIVER_ARRIVED
   * DRIVER_ARRIVED -> TRIP_STARTED
   *
   * TRIP_STARTED is intentionally NOT handled
   * by /advance.
   */
  async function advance(){

    if(!t)return;

    /*
     * PROTECTED COMPLETION FLOW
     */
    if(t.status==='TRIP_STARTED'){

      if(completionBusy)return;

      if(
        !me||
        !Number.isFinite(Number(me.latitude))||
        !Number.isFinite(Number(me.longitude))
      ){

        notify({
          title:'Driver location unavailable',
          message:'Please wait for your live GPS location before requesting trip completion.',
          tone:'error',
          duration:6000
        });

        return;
      }

      setCompletionBusy(true);

      try{

        const r=await api(
          `/trips/${id}/completion-request`,
          {
            method:'POST',
            body:JSON.stringify({
              latitude:Number(me.latitude),
              longitude:Number(me.longitude),
              accuracy:
                me.accuracy==null
                  ?undefined
                  :Number(me.accuracy)
            })
          }
        );

        const trip=r.data?.trip;

        if(trip){
          setT(trip);
        }

        if(
          r.data?.requiresRiderConfirmation===true
        ){

          setCompletionRequested(true);

          notify({
            title:'Arrival confirmation requested',
            message:'The rider has been asked to confirm that they have reached the destination.',
            tone:'success',
            duration:7000
          });

          return;
        }

        if(
          trip?.status==='TRIP_COMPLETED'
        ){

          notify({
            title:'Trip completed',
            message:'The rider confirmed arrival and the trip has been completed.',
            tone:'success',
            duration:6000
          });

          setTimeout(()=>{
            nav('/driver');
          },800);

          return;
        }

      }catch(e){

        notify({
          title:'Unable to complete trip',
          message:e.message,
          tone:'error',
          duration:7000
        });

      }finally{

        setCompletionBusy(false);

      }

      return;
    }

    /*
     * NORMAL STATE PROGRESSION
     */
    try{

      const r=await api(
        `/trips/${id}/advance`,
        {
          method:'PATCH',
          body:JSON.stringify({
            from:t.status
          })
        }
      );

      setT(r.data.trip);

      notify(
        r.data.trip.status.replaceAll('_',' ')
      );

    }catch(e){

      notify(e.message);

    }

  }

  if(!t){

    return(
      <DriverLayout>

        <PageHeader
          title="Active Trip"
          subtitle="Loading trip..."
          action={
            <Button
              variant="secondary"
              onClick={load}
            >
              <RefreshCw size={16}/>
              Refresh
            </Button>
          }
        />

        <div className="panel loading">
          Loading trip...
        </div>

      </DriverLayout>
    );

  }

  const riderConfirmed=
    t.riderArrivalConfirmed===true||
    t.arrivalStatus==='rider_confirmed';

  const isTripStarted=
    t.status==='TRIP_STARTED';

  const needsRiderConfirmation=
    isTripStarted&&!riderConfirmed;

  const canComplete=
    isTripStarted&&riderConfirmed;

  return(

    <DriverLayout>

      <PageHeader
        title="Active Trip"
        subtitle="Your GPS is shared live with the rider during this trip."
        action={
          <Button
            variant="secondary"
            onClick={load}
          >
            <RefreshCw size={16}/>
            Refresh
          </Button>
        }
      />

      <div
        className={`driver-gps-strip ${
          gps==='live'?'is-live':''
        }`}
      >

        <Radio size={17}/>

        <div>

          <b>
            {
              gps==='live'
                ?'Live location sharing ON'
                :gps==='error'
                  ?'Location sharing needs attention'
                  :'Starting live GPS...'
            }
          </b>

          <small>
            {
              gps==='live'
                ?'The rider can see your movement in real time.'
                :'Keep this page open and allow browser location permission.'
            }
          </small>

        </div>

      </div>

      <div className="panel">

        <LiveMap
          pickup={t.pickup}
          destination={t.destination}
          driverLocation={me}
          routeGeometry={route}
          height={420}
          followDriver={true}
        />

      </div>

      <div className="panel">

        <div className="trip-top">

          <b>{t.tripId}</b>

          <Badge tone={statusTone(t.status)}>
            {t.status.replaceAll('_',' ')}
          </Badge>

        </div>

        <h2>
          {t.pickup.label}
          {' → '}
          {t.destination.label}
        </h2>

        <p>
          Rider:
          {' '}
          <strong>
            {t.rider?.fullName}
          </strong>
        </p>

        <p>
          {t.distanceKm}
          {' '}km
          {' • '}
          {t.estimatedMinutes}
          {' '}min
          {' • '}
          <strong>
            {formatMoney(t.fare)}
          </strong>
        </p>

        {me&&(

          <p className="muted">

            <MapPin size={14}/>

            GPS updated
            {' '}
            {new Date(
              me.updatedAt||Date.now()
            ).toLocaleTimeString()}

          </p>

        )}

        {isTripStarted&&(

          <div
            className={
              riderConfirmed
                ?'notice success'
                :'notice'
            }
            style={{
              marginTop:16,
              marginBottom:16
            }}
          >

            {riderConfirmed?(

              <>

                <b>
                  <CheckCircle size={16}/>
                  Rider confirmed arrival
                </b>

                <p>
                  The rider has confirmed that they have
                  reached the destination. You may now
                  complete the trip.
                </p>

              </>

            ):(

              <>

                <b>
                  <Clock size={16}/>
                  Rider confirmation required
                </b>

                <p>
                  The rider must confirm that they have
                  reached the destination before you can
                  complete this trip.
                </p>

              </>

            )}

          </div>

        )}

        {isTripStarted&&!riderConfirmed&&(

          <div
            className="notice"
            style={{
              marginBottom:16
            }}
          >

            <b>
              <ShieldCheck size={16}/>
              Protected trip completion
            </b>

            <p>
              This protects both the rider and driver.
              The trip cannot be completed until the
              rider confirms arrival.
            </p>

          </div>

        )}

        {next[t.status]&&(

          <Button
            full
            onClick={advance}
            disabled={completionBusy}
          >

            <Play size={16}/>

            {label[t.status]}

          </Button>

        )}

        {needsRiderConfirmation&&(

          <Button
            full
            onClick={advance}
            disabled={
              completionBusy||
              completionRequested
            }
          >

            <Clock size={16}/>

            {
              completionBusy
                ?'Requesting confirmation...'
                :completionRequested
                  ?'Waiting for Rider Confirmation'
                  :'Request Rider Confirmation'
            }

          </Button>

        )}

        {canComplete&&(

          <Button
            full
            onClick={advance}
            disabled={completionBusy}
          >

            <CheckCircle size={16}/>

            {
              completionBusy
                ?'Completing Trip...'
                :'Complete Trip'
            }

          </Button>

        )}

      </div>

    </DriverLayout>

  );

}

