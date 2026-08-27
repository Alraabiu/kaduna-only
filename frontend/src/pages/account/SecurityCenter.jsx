import React, {
  useEffect,
  useState
} from 'react';

import {
  ShieldCheck,
  Smartphone,
  Monitor,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Lock,
  Globe,
  RefreshCw
} from 'lucide-react';

import {
  api,
  PageHeader,
  Button,
  Empty,
  Badge,
  formatMoney
} from '../../shared';




/*
=========================================================
SECURITY CENTER
=========================================================

Features:

- Active devices
- Login history
- Security alerts
- Device trust management
- Remove sessions
- Resolve alerts

=========================================================
*/


export default function SecurityCenter(){


const [devices,setDevices]=useState([]);

const [history,setHistory]=useState([]);

const [alerts,setAlerts]=useState([]);

const [loading,setLoading]=useState(true);

const [error,setError]=useState('');

const [refreshing,setRefreshing]=useState(false);





/*
=========================================================
LOAD SECURITY DATA
=========================================================
*/


async function loadSecurity(){


try{


setLoading(true);


const [

deviceResponse,

historyResponse,

alertResponse

]=await Promise.all([


api('/security/devices'),


api('/security/login-history'),


api('/security/alerts')


]);



setDevices(
deviceResponse.devices || []
);



setHistory(
historyResponse.history || []
);



setAlerts(
alertResponse.alerts || []
);



setError('');



}catch(err){


setError(
err.message ||
'Unable to load security information'
);



}finally{


setLoading(false);


}


}








/*
=========================================================
INITIAL LOAD
=========================================================
*/


useEffect(()=>{


loadSecurity();


},[]);









/*
=========================================================
REFRESH
=========================================================
*/


async function refresh(){


setRefreshing(true);


await loadSecurity();


setRefreshing(false);


}








/*
=========================================================
TRUST DEVICE
=========================================================
*/


async function trustDevice(deviceId){


try{


await api(
`/security/devices/${deviceId}/trust`,
{
method:'PATCH'
}
);


await loadSecurity();


}catch(err){


alert(err.message);


}


}








/*
=========================================================
REMOVE DEVICE
=========================================================
*/


async function removeDevice(deviceId){


try{


await api(

`/security/devices/${deviceId}`,

{

method:'DELETE'

}

);



await loadSecurity();



}catch(err){


alert(err.message);


}


}








/*
=========================================================
MARK ALERT READ
=========================================================
*/


async function markRead(id){


try{


await api(

`/security/alerts/${id}/read`,

{

method:'PATCH'

}

);



await loadSecurity();


}catch(err){


alert(err.message);


}


}








/*
=========================================================
RESOLVE ALERT
=========================================================
*/


async function resolveAlert(id){


try{


await api(

`/security/alerts/${id}/resolve`,

{

method:'PATCH'

}

);



await loadSecurity();



}catch(err){


alert(err.message);


}


}








/*
=========================================================
MARK ALL ALERTS READ
=========================================================
*/


async function markAllRead(){


try{


await api(

'/security/alerts/read-all',

{

method:'POST'

}

);



await loadSecurity();


}catch(err){


alert(err.message);


}


}









if(loading){


return (

<div className="content-card">

<h3>
Loading security center...
</h3>

</div>

);


}







return (

<div>


<PageHeader

title="Security Center"

subtitle="Manage your devices, login activity and account security."

action={

<Button

onClick={refresh}

>

<RefreshCw size={16}/>

Refresh

</Button>

}

/>






{
error &&

<div className="notice danger">

<b>
Security Error
</b>

<p>
{error}
</p>

</div>

}









{/* =====================================================
    SECURITY SUMMARY
===================================================== */}


<div className="stats-grid">


<div className="stat-card">


<div className="stat-icon">

<ShieldCheck size={20}/>

</div>


<div>

<span>
Active Devices
</span>

<strong>
{devices.length}
</strong>


</div>


</div>







<div className="stat-card">


<div className="stat-icon">

<AlertTriangle size={20}/>

</div>


<div>

<span>
Security Alerts
</span>

<strong>
{
alerts.filter(
a=>!a.resolved
).length
}
</strong>


</div>


</div>







<div className="stat-card">


<div className="stat-icon">

<Clock size={20}/>

</div>


<div>

<span>
Recent Logins
</span>

<strong>
{history.length}
</strong>


</div>


</div>


</div>









{/* =====================================================
    DEVICES
===================================================== */}


<div className="content-card">


<h2>

<Smartphone size={20}/>

&nbsp;

Connected Devices

</h2>





{

devices.length===0 ?


<Empty

title="No devices found"

text="No active sessions are connected."

/>


:


devices.map(device=>(


<div

key={device.deviceId}

className="security-row"

>


<div>


<h4>

{
device.deviceName ||
'Unknown Device'
}

</h4>


<p>

<Monitor size={14}/>

{' '}

{
device.platform ||
'Unknown'
}

</p>


<p>

<Globe size={14}/>

{' '}

{
device.ipAddress ||
'No IP'
}

</p>


</div>





<div>


{

device.trusted &&

<Badge tone="success">

Trusted

</Badge>

}





<Button

variant=""

onClick={()=>{

device.trusted

?

api(

`/security/devices/${device.deviceId}/untrust`,

{
method:'PATCH'
}

).then(loadSecurity)

:

trustDevice(device.deviceId)

}}

>

<Lock size={15}/>

{

device.trusted

?

'Untrust'

:

'Trust'

}


</Button>





<Button

onClick={()=>removeDevice(device.deviceId)}

>

<Trash2 size={15}/>

Remove

</Button>



</div>


</div>


))


}


</div>









{/* =====================================================
    LOGIN HISTORY
===================================================== */}



<div className="content-card">


<h2>

<Clock size={20}/>

&nbsp;

Login History

</h2>





{

history.length===0 ?


<Empty

title="No login history"

text="Your login activity will appear here."

/>


:


history.map(item=>(


<div

className="security-row"

key={item._id}

>


<div>


<h4>

{item.deviceName || 'Browser'}

</h4>


<p>

{
item.platform
}

</p>


<p>

{
item.ipAddress
}

</p>


</div>



<div>


<Badge>

{
item.status
}

</Badge>


<p>

{
new Date(
item.createdAt
).toLocaleString()

}

</p>


</div>



</div>


))


}



</div>









{/* =====================================================
    SECURITY ALERTS
===================================================== */}



<div className="content-card">


<div className="card-header">


<h2>

<AlertTriangle size={20}/>

&nbsp;

Security Alerts

</h2>


<Button

onClick={markAllRead}

>

Mark all read

</Button>


</div>







{

alerts.length===0 ?


<Empty

title="No security alerts"

text="Your account has no security warnings."

/>


:


alerts.map(alert=>(



<div

className="security-row"

key={alert._id}

>


<div>


<h4>

{alert.message}

</h4>



<p>

{
alert.type
}

</p>


<p>

{
new Date(
alert.createdAt
).toLocaleString()

}

</p>



</div>





<div>


{

!alert.read &&

<Button

onClick={()=>markRead(alert._id)}

>

<CheckCircle size={15}/>

Read

</Button>

}





{

!alert.resolved &&

<Button

onClick={()=>resolveAlert(alert._id)}

>

Resolve

</Button>

}



</div>



</div>


))


}



</div>







</div>


);


}