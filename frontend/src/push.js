import {initializeApp,getApps} from 'firebase/app';
import {getMessaging,getToken,isSupported} from 'firebase/messaging';

const config={
  apiKey:import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:import.meta.env.VITE_FIREBASE_APP_ID
};
const vapidKey=import.meta.env.VITE_FIREBASE_VAPID_KEY;
const configured=()=>Boolean(config.apiKey&&config.projectId&&config.messagingSenderId&&config.appId&&vapidKey);
const deviceId=()=>{let id=localStorage.getItem('ko-device-id');if(!id){id=crypto?.randomUUID?.()||`web-${Date.now()}-${Math.random().toString(36).slice(2)}`;localStorage.setItem('ko-device-id',id)}return id};

export async function enableFirebasePush(api){
  if(!configured())return {enabled:false,configured:false,message:'Firebase web configuration has not been added yet.'};
  if(!('serviceWorker'in navigator)||!('Notification'in window))return {enabled:false,configured:true,message:'Push notifications are not supported in this browser.'};
  if(!(await isSupported()))return {enabled:false,configured:true,message:'Firebase messaging is not supported in this browser.'};
  const permission=await Notification.requestPermission();
  if(permission!=='granted')return {enabled:false,configured:true,message:'Notification permission was not granted.'};
  const registration=await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  const app=getApps()[0]||initializeApp(config);
  const messaging=getMessaging(app);
  const token=await getToken(messaging,{vapidKey,serviceWorkerRegistration:registration});
  if(!token)return {enabled:false,configured:true,message:'Firebase did not return a push token.'};
  await api('/push/register',{method:'POST',body:JSON.stringify({token,deviceId:deviceId()})});
  localStorage.setItem('ko-fcm-token',token);
  return {enabled:true,configured:true,token};
}

export async function unregisterFirebasePush(api){
  const token=localStorage.getItem('ko-fcm-token');
  if(token){try{await api('/push/unregister',{method:'DELETE',body:JSON.stringify({token})})}catch{}}
  localStorage.removeItem('ko-fcm-token');
}

export async function refreshFirebasePush(api){
  if(typeof Notification==='undefined'||Notification.permission!=='granted'||!configured())return false;
  try{return (await enableFirebasePush(api)).enabled}catch{return false}
}

export const firebasePushConfigured=configured;
