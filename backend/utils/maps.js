const NOMINATIM_URL=process.env.NOMINATIM_URL||'https://nominatim.openstreetmap.org';
const OSRM_URL=process.env.OSRM_URL||'https://router.project-osrm.org';
const USER_AGENT=process.env.MAPS_USER_AGENT||'KadunaOnly/1.0 (development; OpenStreetMap integration)';
const searchCache=new Map();
const routeCache=new Map();
let lastNominatimAt=0;
let nominatimQueue=Promise.resolve();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function validatePoint(p,name='Location'){
  const lat=n(p?.lat),lng=n(p?.lng);
  if(lat===null||lng===null||lat<-90||lat>90||lng<-180||lng>180){const e=new Error(`${name} requires valid coordinates`);e.statusCode=400;throw e}
  return {label:String(p?.label||name).trim()||name,lat,lng};
}
async function nominatimFetch(url){
  const task=async()=>{const gap=1100-(Date.now()-lastNominatimAt);if(gap>0)await wait(gap);lastNominatimAt=Date.now();const r=await fetch(url,{headers:{'User-Agent':USER_AGENT,'Accept':'application/json'}});if(!r.ok)throw new Error(`Location search unavailable (${r.status})`);return r.json()};
  const result=nominatimQueue.then(task,task);nominatimQueue=result.catch(()=>{});return result;
}
async function searchKaduna(q){
  q=String(q||'').trim();if(q.length<3){const e=new Error('Enter at least 3 characters to search');e.statusCode=400;throw e}
  const key=q.toLowerCase();if(searchCache.has(key))return searchCache.get(key);
  const params=new URLSearchParams({q:`${q}, Kaduna, Nigeria`,format:'jsonv2',limit:'6',countrycodes:'ng',addressdetails:'1','accept-language':'en',viewbox:'7.30,10.68,7.58,10.35',bounded:'1'});
  const data=await nominatimFetch(`${NOMINATIM_URL}/search?${params}`);
  const out=(Array.isArray(data)?data:[]).map(x=>({placeId:String(x.place_id),label:x.display_name,shortLabel:x.name||x.display_name.split(',')[0],lat:Number(x.lat),lng:Number(x.lon),type:x.type||x.addresstype||'place'})).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lng));
  searchCache.set(key,out);setTimeout(()=>searchCache.delete(key),30*60*1000).unref?.();return out;
}
function routeKey(a,b){return `${a.lat.toFixed(5)},${a.lng.toFixed(5)}:${b.lat.toFixed(5)},${b.lng.toFixed(5)}`}
async function getRoute(pickup,destination){
  const a=validatePoint(pickup,'Pickup'),b=validatePoint(destination,'Destination');const key=routeKey(a,b);if(routeCache.has(key))return routeCache.get(key);
  const url=`${OSRM_URL}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&steps=false`;
  const r=await fetch(url,{headers:{'User-Agent':USER_AGENT,'Accept':'application/json'}});if(!r.ok){const e=new Error(`Routing service unavailable (${r.status})`);e.statusCode=502;throw e}
  const data=await r.json();const route=data?.routes?.[0];if(data?.code!=='Ok'||!route){const e=new Error(data?.message||'No drivable route was found between these locations');e.statusCode=400;throw e}
  const out={distanceKm:Number((route.distance/1000).toFixed(1)),durationMinutes:Math.max(1,Math.ceil(route.duration/60)),geometry:route.geometry,source:'osrm'};
  routeCache.set(key,out);setTimeout(()=>routeCache.delete(key),10*60*1000).unref?.();return out;
}
module.exports={searchKaduna,getRoute,validatePoint};
