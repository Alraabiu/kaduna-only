# Kaduna Only Professional Notifications V3

Adds role-targeted realtime alerts on top of Live Tracking V2.

## Driver
- Only approved, online drivers in the matching vehicle room receive `trip:new`.
- A distinctive incoming-ride chime plays.
- A polished in-app notification shows route and fare.
- Browser notification is shown when permission has been granted.

## Rider
- Driver acceptance triggers a confirmation chime and `Driver is on the way` notification.
- Driver arrival and trip completion have distinct alerts.
- Existing live map tracking remains active.

## Browser permission
The bell in the top bar requests browser notification permission. Audio is unlocked after the first click/tap/key interaction due to browser autoplay rules.

For production mobile apps, add native push notifications (FCM/APNs) because web notifications cannot guarantee delivery after a browser is fully closed.
