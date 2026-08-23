self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let payload={};
    try{payload=event.data?event.data.json():{}}catch{try{payload={data:{body:event.data?.text?.()||''}}}catch{}}
    const data=payload.data||payload;
    const title=data.title||payload.notification?.title||'Kaduna Only';
    const body=data.body||payload.notification?.body||'You have a new update.';
    const url=data.url||'/';
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    if(windows.some(c=>c.visibilityState==='visible'))return;
    await self.registration.showNotification(title,{
      body,
      icon:'/favicon.ico',
      badge:'/favicon.ico',
      tag:data.tag||'kaduna-only',
      renotify:true,
      data:{url,tripId:data.tripId||null,type:data.type||null}
    });
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/',self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('focus'in client){await client.focus();if('navigate'in client)await client.navigate(target);return}
    }
    if(clients.openWindow)return clients.openWindow(target);
  })());
});
