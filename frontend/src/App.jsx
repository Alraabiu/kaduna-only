import React from 'react';

import {
  Routes,
  Route,
  Navigate
} from 'react-router-dom';

/*
=========================================================
GLOBAL PROVIDER
=========================================================
*/

import {
  AppProvider,
  useApp
} from './shared';





/*
=========================================================
AUTH PAGES
=========================================================
*/

import Login from './pages/auth/Login';

import Register from './pages/auth/Register';

import WelcomePage from './pages/auth/WelcomePage';






/*
=========================================================
RIDER PAGES
=========================================================
*/

import HomePage from './pages/rider/HomePage';

import BookRide from './pages/rider/BookRide';

import Trips from './pages/rider/Trips';

import TripDetails from './pages/rider/TripDetails';

import WalletPage from './pages/rider/WalletPage';

import Profile from './pages/rider/Profile';

import Notifications from './pages/rider/Notifications';

import Messages from './pages/rider/Messages';






/*
=========================================================
DRIVER PAGES
=========================================================
*/

import DriverDashboard from './pages/driver/DriverDashboard';

import DriverTrips from './pages/driver/DriverTrips';

import DriverWallet from './pages/driver/DriverWallet';

import DriverProfile from './pages/driver/DriverProfile';

import DriverVerification from './pages/driver/DriverVerification';






/*
=========================================================
ADMIN PAGES
=========================================================
*/

import AdminDashboard from './pages/admin/AdminDashboard';

import AdminTrips from './pages/admin/AdminTrips';

import AdminPayments from './pages/admin/AdminPayments';

import AdminWithdrawals from './pages/admin/AdminWithdrawals';

import AdminPricing from './pages/admin/AdminPricing';

import AdminWorkspace from './pages/admin/AdminWorkspace';

import AdminNotifications from './pages/admin/AdminNotifications';

import AdminAudit from './pages/admin/AdminAudit';






/*
=========================================================
ACCOUNT SECURITY
=========================================================
*/

import SecurityCenter from './pages/account/SecurityCenter';







/*
=========================================================
AUTH GUARD
=========================================================
*/


function Guard({children}){


const {
  token
}=useApp();



if(!token){

return (

<Navigate
to="/login"
replace
/>

);

}


return children;


}









/*
=========================================================
ROLE GUARD
=========================================================
*/


function RoleGuard({

role,

children

}){


const {
user
}=useApp();



if(!user){

return (

<Navigate
to="/login"
replace
/>

);

}



if(user.role!==role){

return (

<Navigate
to="/"
replace
/>

);

}



return children;


}









/*
=========================================================
APP ROUTER
=========================================================
*/


function AppRoutes(){


return (

<Routes>



{/* =====================================================
    PUBLIC
===================================================== */}


<Route

path="/"

element={

<WelcomePage/>

}

/>


<Route

path="/login"

element={

<Login/>

}

/>


<Route

path="/register"

element={

<Register/>

}

/>






{/* =====================================================
    RIDER
===================================================== */}



<Route

path="/rider"

element={

<Guard>

<HomePage/>

</Guard>

}

/>


<Route

path="/rider/book"

element={

<Guard>

<BookRide/>

</Guard>

}

/>


<Route

path="/rider/trips"

element={

<Guard>

<Trips/>

</Guard>

}

/>


<Route

path="/rider/trip/:id"

element={

<Guard>

<TripDetails/>

</Guard>

}

/>


<Route

path="/rider/wallet"

element={

<Guard>

<WalletPage/>

</Guard>

}

/>


<Route

path="/rider/profile"

element={

<Guard>

<Profile/>

</Guard>

}

/>


<Route

path="/rider/notifications"

element={

<Guard>

<Notifications/>

</Guard>

}

/>


<Route

path="/rider/messages"

element={

<Guard>

<Messages/>

</Guard>

}

/>







{/* =====================================================
    DRIVER
===================================================== */}



<Route

path="/driver"

element={

<RoleGuard role="driver">

<DriverDashboard/>

</RoleGuard>

}

/>


<Route

path="/driver/trips"

element={

<RoleGuard role="driver">

<DriverTrips/>

</RoleGuard>

}

/>


<Route

path="/driver/wallet"

element={

<RoleGuard role="driver">

<DriverWallet/>

</RoleGuard>

}

/>


<Route

path="/driver/profile"

element={

<RoleGuard role="driver">

<DriverProfile/>

</RoleGuard>

}

/>


<Route

path="/driver/verification"

element={

<RoleGuard role="driver">

<DriverVerification/>

</RoleGuard>

}

/>







{/* =====================================================
    ADMIN
===================================================== */}



<Route

path="/admin"

element={

<RoleGuard role="admin">

<AdminDashboard/>

</RoleGuard>

}

/>


<Route

path="/admin/workspace"

element={

<RoleGuard role="admin">

<AdminWorkspace/>

</RoleGuard>

}

/>


<Route

path="/admin/trips"

element={

<RoleGuard role="admin">

<AdminTrips/>

</RoleGuard>

}

/>


<Route

path="/admin/payments"

element={

<RoleGuard role="admin">

<AdminPayments/>

</RoleGuard>

}

/>


<Route

path="/admin/withdrawals"

element={

<RoleGuard role="admin">

<AdminWithdrawals/>

</RoleGuard>

}

/>


<Route

path="/admin/pricing"

element={

<RoleGuard role="admin">

<AdminPricing/>

</RoleGuard>

}

/>


<Route

path="/admin/notifications"

element={

<RoleGuard role="admin">

<AdminNotifications/>

</RoleGuard>

}

/>


<Route

path="/admin/audit"

element={

<RoleGuard role="admin">

<AdminAudit/>

</RoleGuard>

}

/>







{/* =====================================================
    SECURITY CENTER
===================================================== */}



<Route

path="/security"

element={

<Guard>

<SecurityCenter/>

</Guard>

}

/>







{/* =====================================================
    FALLBACK
===================================================== */}



<Route

path="*"

element={

<Navigate

to="/"

replace

/>

}

/>



</Routes>

);

}









/*
=========================================================
ROOT APP
=========================================================
*/


export default function App(){

return (

<AppProvider>

<AppRoutes/>

</AppProvider>

);

}
