import React,{createContext,useContext,useEffect,useState}from'react';

import{
 enableFirebasePush,
 refreshFirebasePush,
 unregisterFirebasePush,
 firebasePushConfigured
}from'./push';

import{
 Link,
 useLocation,
 useNavigate
}from'react-router-dom';

import{
 Home,
 Car,
 ClipboardList,
 Wallet as WalletIcon,
 User,
 ShieldCheck,
 LogOut,
 Bell,
 Package,
 Truck,
 ShoppingBag,
 BarChart3,
 FileCheck2,
 Settings
}from'lucide-react';

import{io}from'socket.io-client';

/* =========================================================
   API CONFIGURATION
========================================================= */

export const API=
  import.meta.env.VITE_API_URL||
  'http://localhost:5000/api';

export const SOCKET_URL=
  import.meta.env.VITE_SOCKET_URL||
  API.replace(/\/api\/?$/,'');


/* =========================================================
   AUDIO ALERT SYSTEM
========================================================= */

let koAudio=null;

function audioContext(){
  if(typeof window==='undefined')return null;

  const AC=
    window.AudioContext||
    window.webkitAudioContext;

  if(!AC)return null;

  if(!koAudio)koAudio=new AC();

  return koAudio;
}

export async function unlockAlertAudio(){
  try{
    const c=audioContext();

    if(c?.state==='suspended'){
      await c.resume();
    }

    return c?.state==='running';
  }catch{
    return false;
  }
}

export function playAlert(kind='info'){
  try{
    const c=audioContext();

    if(!c||c.state!=='running'){
      return false;
    }

    const patterns={
      ride:[
        [784,0,.13],
        [988,.16,.13],
        [1175,.32,.22],
        [988,.58,.15]
      ],

      accepted:[
        [660,0,.12],
        [880,.15,.15],
        [1100,.34,.28]
      ],

      arrived:[
        [880,0,.14],
        [880,.20,.14],
        [1320,.40,.30]
      ],

      complete:[
        [523,0,.12],
        [659,.14,.12],
        [784,.28,.12],
        [1047,.44,.28]
      ],

      info:[
        [740,0,.12],
        [930,.15,.18]
      ],

      confirm:[
        [660,0,.08],
        [990,.11,.18]
      ]
    };

    const now=c.currentTime+.02;

    (patterns[kind]||patterns.info).forEach(
      ([freq,delay,duration])=>{
        const o=c.createOscillator();
        const g=c.createGain();

        o.type='sine';

        o.frequency.setValueAtTime(
          freq,
          now+delay
        );

        g.gain.setValueAtTime(
          .0001,
          now+delay
        );

        g.gain.exponentialRampToValueAtTime(
          .18,
          now+delay+.015
        );

        g.gain.exponentialRampToValueAtTime(
          .0001,
          now+delay+duration
        );

        o.connect(g);
        g.connect(c.destination);

        o.start(now+delay);
        o.stop(now+delay+duration+.03);
      }
    );

    return true;

  }catch{
    return false;
  }
}

export function playIncomingRideAlert(){
  playAlert('ride');

  setTimeout(
    ()=>playAlert('ride'),
    1050
  );

  setTimeout(
    ()=>playAlert('ride'),
    2100
  );

  try{
    navigator.vibrate?.([
      220,
      100,
      220,
      100,
      420
    ]);
  }catch{}
}


/* =========================================================
   BROWSER NOTIFICATIONS
========================================================= */

export function browserAlert(
  title,
  body,
  tag
){
  try{
    if(
      typeof Notification!=='undefined'&&
      Notification.permission==='granted'
    ){
      const n=new Notification(
        title,
        {
          body,
          tag,
          icon:'/favicon.ico',
          badge:'/favicon.ico',
          renotify:true
        }
      );

      setTimeout(
        ()=>n.close(),
        9000
      );

      return true;
    }
  }catch{}

  return false;
}


/* =========================================================
   API HELPER
========================================================= */

export async function api(
  path,
  opts={},
  token=localStorage.getItem('ko-token')
){
  const headers={
    'Content-Type':'application/json',
    ...(opts.headers||{})
  };

  if(token){
    headers.Authorization=
      `Bearer ${token}`;
  }

  const res=await fetch(
    `${API}${path}`,
    {
      ...opts,
      headers
    }
  );

  const body=
    await res.json().catch(
      ()=>({})
    );

  if(!res.ok){
    throw new Error(
      body.message||
      `Request failed (${res.status})`
    );
  }

  return body;
}


/* =========================================================
   APP CONTEXT
========================================================= */

const C=createContext(null);

export const useApp=()=>useContext(C);


/* =========================================================
   APP PROVIDER
========================================================= */

export function AppProvider({children}){

  const[user,setUser]=useState(
    ()=>JSON.parse(
      localStorage.getItem('ko-user')||
      'null'
    )
  );

  const[token,setToken]=useState(
    ()=>localStorage.getItem('ko-token')||
    ''
  );

  const[toast,setToast]=useState(null);

  const[socket,setSocket]=useState(null);

  const[alertsEnabled,setAlertsEnabled]=useState(
    ()=>(
      typeof Notification!=='undefined'&&
      Notification.permission==='granted'
    )
  );


  /* =======================================================
     NOTIFICATIONS
  ======================================================= */

  const notify=m=>{
    const data=
      typeof m==='string'
        ?{
            title:m,
            message:''
          }
        :m;

    setToast(data);

    setTimeout(
      ()=>setToast(null),
      data?.duration||4200
    );
  };


  /* =======================================================
     ENABLE ALERTS
  ======================================================= */

  const requestAlerts=async()=>{

    await unlockAlertAudio();

    if(
      typeof Notification==='undefined'
    ){
      notify({
        title:'Sound alerts enabled',
        message:
          'Browser notifications are unavailable on this browser.'
      });

      playAlert('confirm');

      return false;
    }

    try{

      const p=
        await Notification.requestPermission();

      if(p!=='granted'){

        setAlertsEnabled(false);

        notify({
          title:
            'Notification permission not enabled',
          message:
            'In-app sound and visual alerts will still work while Kaduna Only is open.'
        });

        return false;
      }

      let push={
        enabled:false,
        configured:false
      };

      try{
        push=
          await enableFirebasePush(api);
      }catch(e){
        console.warn(
          'Push registration failed',
          e
        );
      }

      setAlertsEnabled(true);

      playAlert('confirm');

      notify({
        title:
          push.enabled
            ?'Push notifications enabled'
            :'Notifications enabled',

        message:
          push.enabled
            ?'Ride alerts can reach this device even when Kaduna Only is in the background.'
            :push.configured
              ?'Browser alerts are enabled, but Firebase push registration could not complete.'
              :'Browser alerts are enabled. Add Firebase configuration to enable background push.'
      });

      return true;

    }catch{
      return false;
    }
  };


  /* =======================================================
     AUTHENTICATION
  ======================================================= */

  const login=async d=>{

    const r=
      await api(
        '/auth/login',
        {
          method:'POST',
          body:JSON.stringify(d)
        },
        null
      );

    setUser(r.data.user);
    setToken(r.data.token);

    return r.data.user;
  };


  const register=async d=>{

    const r=
      await api(
        '/auth/register',
        {
          method:'POST',
          body:JSON.stringify(d)
        },
        null
      );

    setUser(r.data.user);
    setToken(r.data.token);

    return r.data.user;
  };


  const refreshUser=async()=>{

    const r=
      await api('/auth/me');

    setUser(r.data.user);

    return r.data.user;
  };


  const logout=()=>{

    unregisterFirebasePush(api)
      .catch(()=>{});

    socket?.disconnect();

    setSocket(null);
    setUser(null);
    setToken('');

    localStorage.removeItem(
      'ko-user'
    );

    localStorage.removeItem(
      'ko-token'
    );
  };


  /* =======================================================
     UNLOCK AUDIO AFTER USER INTERACTION
  ======================================================= */

  useEffect(()=>{

    const unlock=
      ()=>unlockAlertAudio();

    window.addEventListener(
      'pointerdown',
      unlock,
      {once:true}
    );

    window.addEventListener(
      'keydown',
      unlock,
      {once:true}
    );

    return()=>{
      window.removeEventListener(
        'pointerdown',
        unlock
      );

      window.removeEventListener(
        'keydown',
        unlock
      );
    };

  },[]);


  /* =======================================================
     PERSIST USER
  ======================================================= */

  useEffect(()=>{

    if(user){

      localStorage.setItem(
        'ko-user',
        JSON.stringify(user)
      );

    }else{

      localStorage.removeItem(
        'ko-user'
      );

    }

  },[user]);


  /* =======================================================
     SOCKET CONNECTION
  ======================================================= */

  useEffect(()=>{

    if(token){

      localStorage.setItem(
        'ko-token',
        token
      );

    }else{

      localStorage.removeItem(
        'ko-token'
      );

      socket?.disconnect();

      setSocket(null);

      return;
    }


    const s=io(
      SOCKET_URL,
      {
        auth:{token},
        transports:[
          'websocket',
          'polling'
        ]
      }
    );

    setSocket(s);

    return()=>{
      s.disconnect();

      setSocket(
        v=>v===s
          ?null
          :v
      );
    };

  },[token]);


  /* =======================================================
     REFRESH FIREBASE PUSH
  ======================================================= */

  useEffect(()=>{

    if(
      !token||
      !user||
      typeof Notification==='undefined'||
      Notification.permission!=='granted'||
      !firebasePushConfigured()
    ){
      return;
    }

    const timer=
      setTimeout(
        ()=>{
          refreshFirebasePush(api)
            .catch(()=>{});
        },
        1200
      );

    return()=>{
      clearTimeout(timer);
    };

  },[
    token,
    user?._id
  ]);


  /* =======================================================
     SOCKET EVENTS
  ======================================================= */

  useEffect(()=>{

    if(!socket||!user)return;


    /* -----------------------------------------------------
       NEW DRIVER RIDE
    ----------------------------------------------------- */

    const onNewRide=p=>{

      if(user.role!=='driver')return;

      const t=p?.trip;

      if(!t)return;

      playIncomingRideAlert();

      const route=
        `${t.pickup?.label||'Pickup'} → ${
          t.destination?.label||
          'Destination'
        }`;

      notify({
        title:'New ride request',

        message:
          `${route} · ${formatMoney(t.fare)}`,

        tone:'ride',

        duration:7500
      });

      browserAlert(
        'New Kaduna Only ride',
        `${route} · ${formatMoney(t.fare)}`,
        `new-${t._id}`
      );
    };


    /* -----------------------------------------------------
       RIDER TRIP UPDATES
    ----------------------------------------------------- */

    const onTrip=p=>{

      if(user.role!=='rider')return;

      const t=p?.trip;

      if(!t)return;


      if(t.status==='DRIVER_ASSIGNED'){

        playAlert('accepted');

        try{
          navigator.vibrate?.([
            160,
            80,
            160
          ]);
        }catch{}

        notify({
          title:'Driver found',

          message:
            'Your driver accepted the ride and is on the way to your pickup.',

          tone:'success',

          duration:7000
        });

        browserAlert(
          'Driver is on the way',
          'Your Kaduna Only driver has accepted your ride.',
          `accepted-${t._id}`
        );

      }


      else if(
        t.status==='DRIVER_ARRIVED'
      ){

        playAlert('arrived');

        notify({
          title:'Driver has arrived',

          message:
            'Your driver is waiting at the pickup point.',

          tone:'success',

          duration:7000
        });

        browserAlert(
          'Your driver has arrived',
          'Please meet your driver at the pickup point.',
          `arrived-${t._id}`
        );

      }


      else if(
        t.status==='TRIP_COMPLETED'
      ){

        playAlert('complete');

        notify({
          title:'Trip completed',

          message:
            'Thank you for riding with Kaduna Only.',

          tone:'success'
        });

        browserAlert(
          'Trip completed',
          'Thank you for riding with Kaduna Only.',
          `done-${t._id}`
        );
      }
    };


    socket.on(
      'trip:new',
      onNewRide
    );

    socket.on(
      'trip:updated',
      onTrip
    );


    return()=>{

      socket.off(
        'trip:new',
        onNewRide
      );

      socket.off(
        'trip:updated',
        onTrip
      );

    };

  },[
    socket,
    user?.role
  ]);


  /* =======================================================
     PROVIDER
  ======================================================= */

  return(
    <C.Provider
      value={{
        user,
        token,
        socket,
        login,
        register,
        refreshUser,
        logout,
        notify,
        requestAlerts,
        alertsEnabled
      }}
    >

      {children}

      {toast&&(
        <div
          className={`toast-pro ${
            toast.tone||''
          }`}
          role="status"
        >

          <span className="toast-dot"/>

          <div>
            <b>
              {toast.title}
            </b>

            {toast.message&&(
              <small>
                {toast.message}
              </small>
            )}
          </div>

        </div>
      )}

    </C.Provider>
  );
}


/* =========================================================
   BRAND
========================================================= */

export function Brand({light=false}){

  return(
    <Link
      to="/"
      className={`brand ${
        light?'brand-light':''
      }`}
    >

      <span>K</span>

      <div>
        <b>KADUNA ONLY</b>
        <small>
          Your City. Your Ride.
        </small>
      </div>

    </Link>
  );
}


/* =========================================================
   BUTTON
========================================================= */

export function Button({
  children,
  to,
  onClick,
  type='button',
  variant='',
  disabled=false,
  full=false
}){

  const cls=
    `btn ${variant} ${
      full?'full':''
    }`;

  if(to){

    return(
      <Link
        className={cls}
        to={to}
      >
        {children}
      </Link>
    );
  }

  return(
    <button
      className={cls}
      onClick={onClick}
      type={type}
      disabled={disabled}
    >
      {children}
    </button>
  );
}


/* =========================================================
   BADGE
========================================================= */

export function Badge({
  children,
  tone=''
}){

  return(
    <span
      className={`badge ${tone}`}
    >
      {children}
    </span>
  );
}


/* =========================================================
   PAGE HEADER
========================================================= */

export function PageHeader({
  title,
  subtitle,
  action
}){

  return(
    <div className="page-head">

      <div>

        <div className="eyebrow">
          KADUNA ONLY
        </div>

        <h1>
          {title}
        </h1>

        {subtitle&&(
          <p>
            {subtitle}
          </p>
        )}

      </div>

      {action}

    </div>
  );
}


/* =========================================================
   MAIN APPLICATION LAYOUT
========================================================= */

function Layout({
  children,
  role
}){

  const{
    user,
    logout,
    requestAlerts,
    alertsEnabled
  }=useApp();

  const loc=useLocation();


  /* =======================================================
     NAVIGATION
  ======================================================= */

  const nav=
    role==='driver'
      ?[
          [
            '/driver',
            Home,
            'Dashboard'
          ],

          [
            '/driver/trips',
            ClipboardList,
            'Trips'
          ],

          [
            '/driver/earnings',
            BarChart3,
            'Earnings'
          ],

          [
            '/driver/wallet',
            WalletIcon,
            'Wallet'
          ],

          [
            '/driver/profile',
            User,
            'Profile'
          ],

          [
            '/driver/verification',
            FileCheck2,
            'Verification'
          ]
        ]

      :role==='admin'
      ?[
          [
            '/admin',
            Home,
            'Dashboard'
          ],

          [
            '/admin/drivers',
            User,
            'Drivers'
          ],

          [
            '/admin/users',
            User,
            'Users'
          ],

          [
            '/admin/trips',
            ClipboardList,
            'Trips'
          ],

          [
            '/admin/payments',
            WalletIcon,
            'Payments'
          ],

          [
            '/admin/withdrawals',
            WalletIcon,
            'Withdrawals'
          ],

          /* -------------------------------------------------
             NEW PLATFORM COMMISSION SECTION
          ------------------------------------------------- */

          [
            '/admin/platform-revenue',
            WalletIcon,
            'Platform Commission'
          ],

          [
            '/admin/pricing',
            Settings,
            'Pricing'
          ],

          [
            '/admin/audit',
            ShieldCheck,
            'Audit'
          ]
        ]

      :[
          [
            '/home',
            Home,
            'Home'
          ],

          [
            '/book-ride',
            Car,
            'Book Ride'
          ],

          [
            '/trips',
            ClipboardList,
            'Trips'
          ],

          [
            '/wallet',
            WalletIcon,
            'Wallet'
          ],

          [
            '/profile',
            User,
            'Profile'
          ],

          [
            '/package',
            Package,
            'Package'
          ],

          [
            '/truck',
            Truck,
            'Hire Truck'
          ],

          [
            '/market',
            ShoppingBag,
            'Market'
          ]
        ];


  /* =======================================================
     USER INITIALS
  ======================================================= */

  const initials=
    (user?.fullName||'KO')
      .split(' ')
      .map(x=>x[0])
      .slice(0,2)
      .join('')
      .toUpperCase();


  /* =======================================================
     ACTIVE NAVIGATION
  ======================================================= */

  const isActive=path=>{

    /* DRIVER */
    if(role==='driver'){

      if(path==='/driver'){
        return loc.pathname==='/driver';
      }

      if(path==='/driver/trips'){

        return(
          loc.pathname==='/driver/trips'||
          loc.pathname.startsWith(
            '/driver/trip/'
          )
        );
      }

      return loc.pathname===path;
    }


    /* ADMIN */
    if(role==='admin'){

      if(path==='/admin'){
        return loc.pathname==='/admin';
      }


      /* Platform commission page and
         all of its child pages */

      if(
        path==='/admin/platform-revenue'
      ){

        return(
          loc.pathname===
            '/admin/platform-revenue'||
          loc.pathname.startsWith(
            '/admin/platform-revenue/'
          )
        );
      }


      return loc.pathname===path;
    }


    /* RIDER */

    return loc.pathname===path;
  };


  /* =======================================================
     RENDER
  ======================================================= */

  return(
    <div
      className={`app-shell ${role}`}
    >

      {/* =================================================
          SIDEBAR
      ================================================= */}

      <aside className="sidebar">

        <Brand/>

        <div className="role-title">
          {role.toUpperCase()} PORTAL
        </div>


        {/* ===============================================
            NAVIGATION
        =============================================== */}

        <nav>

          {nav.map(
            ([path,Icon,label])=>(
              <Link
                key={path}
                to={path}
                className={
                  isActive(path)
                    ?'active'
                    :''
                }
              >

                <Icon size={18}/>

                <span>
                  {label}
                </span>

              </Link>
            )
          )}

        </nav>


        {/* ===============================================
            SIDEBAR BOTTOM
        =============================================== */}

        <div className="side-bottom">

          <button
            onClick={()=>notifyNoop()}
            className="side-help"
          >

            <Settings size={17}/>

            Settings

          </button>


          <button
            onClick={logout}
            className="logout"
          >

            <LogOut size={17}/>

            Logout

          </button>

        </div>

      </aside>


      {/* =================================================
          MAIN
      ================================================= */}

      <main className="main">


        {/* ===============================================
            TOP BAR
        =============================================== */}

        <header className="topbar">

          <div>

            <span>

              {role==='driver'
                ?'Driver Portal'
                :role==='admin'
                  ?'Admin Portal'
                  :'Rider Portal'}

            </span>

            <h2>
              Good morning,{' '}
              {user?.fullName||'there'}
            </h2>

          </div>


          <div className="top-actions">

            <button
              className={
                `icon-btn alert-bell ${
                  alertsEnabled
                    ?'enabled'
                    :''
                }`
              }
              onClick={requestAlerts}
              title={
                alertsEnabled
                  ?'Ride notifications enabled'
                  :'Enable ride notifications'
              }
            >

              <Bell size={19}/>

              <span/>

            </button>


            <div className="avatar">
              {initials}
            </div>

          </div>

        </header>


        {/* ===============================================
            PAGE CONTENT
        =============================================== */}

        <section className="content">

          {children}

        </section>

      </main>

    </div>
  );
}


/* =========================================================
   SETTINGS PLACEHOLDER
========================================================= */

const notifyNoop=()=>{};


/* =========================================================
   ROLE-SPECIFIC LAYOUTS
========================================================= */

export const RiderLayout=({
  children
})=>(
  <Layout role="rider">
    {children}
  </Layout>
);


export const DriverLayout=({
  children
})=>(
  <Layout role="driver">
    {children}
  </Layout>
);


export const AdminLayout=({
  children
})=>(
  <Layout role="admin">
    {children}
  </Layout>
);


/* =========================================================
   STAT CARD
========================================================= */

export function Stat({
  title,
  value,
  icon:Icon,
  meta
}){

  return(
    <div className="stat-card">

      <div className="stat-icon">
        <Icon size={19}/>
      </div>

      <div>

        <span>
          {title}
        </span>

        <strong>
          {value}
        </strong>

        {meta&&(
          <small>
            {meta}
          </small>
        )}

      </div>

    </div>
  );
}


/* =========================================================
   EMPTY STATE
========================================================= */

export function Empty({
  title,
  text,
  action
}){

  return(
    <div className="empty">

      <div className="empty-mark">
        ⌁
      </div>

      <h3>
        {title}
      </h3>

      <p>
        {text}
      </p>

      {action}

    </div>
  );
}


/* =========================================================
   NOTICE
========================================================= */

export function Notice({
  title,
  text,
  tone=''
}){

  return(
    <div
      className={`notice ${tone}`}
    >

      <b>
        {title}
      </b>

      <p>
        {text}
      </p>

    </div>
  );
}


/* =========================================================
   MONEY FORMATTER
========================================================= */

export function formatMoney(n){

  return `₦${
    Number(n||0).toLocaleString(
      'en-NG',
      {
        minimumFractionDigits:0
      }
    )
  }`;
}


/* =========================================================
   STATUS TONE
========================================================= */

export function statusTone(s){

  return[
    'TRIP_COMPLETED',
    'approved',
    'DRIVER_ARRIVED'
  ].includes(s)

    ?'success'

    :[
        'CANCELLED',
        'rejected',
        'suspended'
      ].includes(s)

      ?'danger'

      :[
          'SEARCHING_DRIVER',
          'pending'
        ].includes(s)

        ?'warning'

        :'';
}


/* =========================================================
   AUTH GUARD
========================================================= */

export function Guard({
  role,
  children
}){

  const{user}=useApp();

  if(!user){
    return(
      <NavigateTo
        path="/welcome"
      />
    );
  }


  if(
    role&&
    user.role!==role
  ){

    return(
      <NavigateTo
        path={
          user.role==='admin'
            ?'/admin'
            :user.role==='driver'
              ?'/driver'
              :'/home'
        }
      />
    );
  }


  return children;
}


/* =========================================================
   NAVIGATION HELPER
========================================================= */

function NavigateTo({
  path
}){

  const n=useNavigate();

  useEffect(
    ()=>{
      n(
        path,
        {
          replace:true
        }
      );
    },
    [
      n,
      path
    ]
  );

  return null;
}