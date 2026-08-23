import React,{useEffect,useState}from'react';
import{useNavigate}from'react-router-dom';
import{
  Car,
  Bike,
  ArrowRight,
  Wallet,
  CircleDollarSign,
  Clock3,
  Route,
  Users,
  ShieldCheck
}from'lucide-react';
import{
  RiderLayout,
  PageHeader,
  Button,
  useApp,
  api,
  Notice,
  formatMoney
}from'../../shared';
import LiveMap from'../../components/LiveMap';
import PlaceSearch from'../../components/PlaceSearch';

export default function BookRide(){

  const{notify}=useApp();
  const nav=useNavigate();

  const[form,setForm]=useState({
    vehicleType:'keke',
    kekeRideType:'single_seat',
    pickup:null,
    destination:null,
    paymentMethod:'cash'
  });

  const[walletBalance,setWalletBalance]=useState(0);
  const[quote,setQuote]=useState(null);
  const[busy,setBusy]=useState(false);
  const[quoting,setQuoting]=useState(false);
  const[error,setError]=useState('');

  /*
   * ----------------------------------------------------
   * GET QUOTE
   * ----------------------------------------------------
   *
   * Keke now carries the selected ride mode.
   */
  async function getQuote(){

    if(
      !form.pickup||
      !form.destination
    ){
      setQuote(null);
      return;
    }

    setQuoting(true);
    setError('');

    try{

      const r=await api(
        '/trips/quote',
        {
          method:'POST',
          body:JSON.stringify({
            vehicleType:form.vehicleType,
            kekeRideType:
              form.vehicleType==='keke'
                ?form.kekeRideType
                :undefined,
            pickup:form.pickup,
            destination:form.destination
          })
        }
      );

      setQuote(r.data.quote);

    }catch(err){

      setQuote(null);
      setError(err.message);

    }finally{

      setQuoting(false);

    }

  }

  /*
   * Recalculate whenever the vehicle,
   * Keke ride mode or route changes.
   */
  useEffect(()=>{
    getQuote();
  },[
    form.vehicleType,
    form.kekeRideType,
    form.pickup?.lat,
    form.pickup?.lng,
    form.destination?.lat,
    form.destination?.lng
  ]);

  /*
   * Load wallet balance.
   */
  useEffect(()=>{

    api('/wallet')
      .then(r=>
        setWalletBalance(
          Number(
            r.data.wallet?.balance||0
          )
        )
      )
      .catch(()=>{});

  },[]);

  /*
   * ----------------------------------------------------
   * SUBMIT RIDE
   * ----------------------------------------------------
   */
  async function submit(e){

    e.preventDefault();

    if(
      !form.pickup||
      !form.destination
    ){

      setError(
        'Select both pickup and destination'
      );

      return;

    }

    if(
      form.paymentMethod==='wallet'&&
      quote&&
      walletBalance<quote.fare
    ){

      setError(
        `Insufficient wallet balance. You have ${formatMoney(walletBalance)} but this ride costs ${formatMoney(quote.fare)}.`
      );

      return;

    }

    setBusy(true);
    setError('');

    try{

      await api(
        '/trips',
        {
          method:'POST',
          body:JSON.stringify({

            vehicleType:
              form.vehicleType,

            /*
             * Only Keke uses this field.
             */
            kekeRideType:
              form.vehicleType==='keke'
                ?form.kekeRideType
                :undefined,

            pickup:
              form.pickup,

            destination:
              form.destination,

            paymentMethod:
              form.paymentMethod

          })
        }
      );

      notify(
        form.vehicleType==='keke'
          ?form.kekeRideType==='private'
            ?'Private Keke ride requested successfully'
            :'Single-seat Keke ride requested successfully'
          :'Ride requested successfully'
      );

      nav('/searching');

    }catch(err){

      setError(err.message);

    }finally{

      setBusy(false);

    }

  }

  /*
   * ----------------------------------------------------
   * VEHICLE SELECTION
   * ----------------------------------------------------
   */
  function selectVehicle(vehicleType){

    setForm(v=>({
      ...v,
      vehicleType
    }));

  }

  /*
   * ----------------------------------------------------
   * KEKE RIDE MODE
   * ----------------------------------------------------
   */
  function selectKekeRideType(kekeRideType){

    setForm(v=>({
      ...v,
      kekeRideType
    }));

  }

  const isKeke=
    form.vehicleType==='keke';

  return(

    <RiderLayout>

      <PageHeader
        title="Book a Ride"
        subtitle="Search real Kaduna locations. Distance and ETA use OpenStreetMap routing."
      />

      <div className="book-layout">

        {/* MAP */}

        <div className="panel map-panel">

          <LiveMap
            pickup={form.pickup}
            destination={form.destination}
            routeGeometry={
              quote?.routeGeometry
            }
            height={400}
          />

          {quote&&(

            <div className="quote-strip">

              <b>
                {formatMoney(
                  quote.fare
                )}
              </b>

              <span>
                <Route size={15}/>
                {quote.distanceKm} km
              </span>

              <span>
                <Clock3 size={15}/>
                {quote.estimatedMinutes} min
              </span>

            </div>

          )}

        </div>

        {/* BOOKING FORM */}

        <form
          className="panel form ride-form"
          onSubmit={submit}
        >

          {error&&(

            <Notice
              title="Ride request"
              text={error}
              tone="danger"
            />

          )}

          <PlaceSearch
            label="Pickup"
            value={form.pickup}
            allowCurrent
            onSelect={pickup=>
              setForm(v=>({
                ...v,
                pickup
              }))
            }
          />

          <PlaceSearch
            label="Destination"
            value={form.destination}
            onSelect={destination=>
              setForm(v=>({
                ...v,
                destination
              }))
            }
          />

          {/* VEHICLE */}

          <div>

            <h3>
              Choose your ride
            </h3>

            <div className="vehicle-picker">

              {[
                ['keke','Keke',Car],
                ['bike','Bike',Bike],
                ['car','Car',Car],
                ['suv','SUV',Car]
              ].map(
                ([v,l,I])=>(

                  <button
                    type="button"
                    key={v}
                    className={
                      form.vehicleType===v
                        ?'selected'
                        :''
                    }
                    onClick={()=>
                      selectVehicle(v)
                    }
                  >

                    <I/>

                    <b>{l}</b>

                    <small>
                      {
                        form.vehicleType===v&&
                        quote
                          ?formatMoney(
                              quote.fare
                            )
                          :'Get quote'
                      }
                    </small>

                  </button>

                )
              )}

            </div>

          </div>

          {/* KEKE MODE */}

          {isKeke&&(

            <div className="keke-mode-section">

              <h3>
                Choose Keke ride type
              </h3>

              <p className="muted">
                Select whether you want one seat
                or the entire Keke privately.
              </p>

              <div className="ride-mode-picker">

                {/* SINGLE SEAT */}

                <button
                  type="button"
                  className={
                    form.kekeRideType===
                    'single_seat'
                      ?'selected'
                      :''
                  }
                  onClick={()=>
                    selectKekeRideType(
                      'single_seat'
                    )
                  }
                >

                  <Users size={22}/>

                  <div>

                    <b>
                      Single Seat
                    </b>

                    <small>
                      Book one seat in the Keke.
                    </small>

                    <span>
                      Another compatible rider
                      may share the Keke.
                    </span>

                  </div>

                  {form.kekeRideType===
                    'single_seat'&&quote&&(

                    <strong>
                      {formatMoney(
                        quote.fare
                      )}
                    </strong>

                  )}

                </button>

                {/* PRIVATE */}

                <button
                  type="button"
                  className={
                    form.kekeRideType===
                    'private'
                      ?'selected'
                      :''
                  }
                  onClick={()=>
                    selectKekeRideType(
                      'private'
                    )
                  }
                >

                  <ShieldCheck size={22}/>

                  <div>

                    <b>
                      Private Ride
                    </b>

                    <small>
                      Reserve the entire Keke.
                    </small>

                    <span>
                      No additional rider will
                      be added to your trip.
                    </span>

                  </div>

                  {form.kekeRideType===
                    'private'&&quote&&(

                    <strong>
                      {formatMoney(
                        quote.fare
                      )}
                    </strong>

                  )}

                </button>

              </div>

            </div>

          )}

          {/* PAYMENT */}

          <div>

            <h3>
              Payment
            </h3>

            <div className="payment-picker">

              <button
                type="button"
                className={
                  form.paymentMethod===
                  'cash'
                    ?'selected'
                    :''
                }
                onClick={()=>
                  setForm(v=>({
                    ...v,
                    paymentMethod:'cash'
                  }))
                }
              >

                <CircleDollarSign/>

                Cash

              </button>

              <button
                type="button"
                className={
                  form.paymentMethod===
                  'wallet'
                    ?'selected'
                    :''
                }
                onClick={()=>
                  setForm(v=>({
                    ...v,
                    paymentMethod:'wallet'
                  }))
                }
              >

                <Wallet/>

                Wallet

              </button>

            </div>

          </div>

          {/* WALLET */}

          {form.paymentMethod===
            'wallet'&&(

            <Notice
              title={
                `Wallet balance ${formatMoney(
                  walletBalance
                )}`
              }
              text={
                quote&&
                walletBalance>=quote.fare
                  ?'The fare will be reserved immediately when you request the ride. If you cancel before the trip starts, it will be refunded automatically.'
                  :quote
                    ?'Your wallet does not have enough balance for this ride. Fund your wallet first.'
                    :'Choose pickup and destination to calculate the fare.'
              }
              tone={
                quote&&
                walletBalance<quote.fare
                  ?'warning'
                  :undefined
              }
            />

          )}

          {/* ROUTING */}

          {quoting&&(

            <Notice
              title="Calculating route"
              text="Getting the road route, distance and ETA..."
            />

          )}

          {quote&&(

            <Notice
              title={
                `Estimated fare ${formatMoney(
                  quote.fare
                )}`
              }
              text={
                `${quote.distanceKm} km • about ${quote.estimatedMinutes} minutes • ${quote.routingSource==='osrm'?'live road routing':'estimated routing'}.`
              }
            />

          )}

          {/* REQUEST */}

          <Button
            type="submit"
            full
            disabled={
              busy||
              quoting||
              !quote
            }
          >

            {
              busy
                ?'Requesting...'
                :quoting
                  ?'Calculating...'
                  :'Request Ride'
            }

            <ArrowRight size={17}/>

          </Button>

        </form>

      </div>

    </RiderLayout>

  );

}