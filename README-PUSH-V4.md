# Kaduna Only Push Notifications V4

This build keeps the existing Socket.IO/in-app alerts and adds Firebase Cloud Messaging (FCM) background web push.

## What works after Firebase is configured

- Online approved matching drivers receive a push when a rider creates a ride.
- The rider receives a push immediately after a driver accepts.
- Rider pushes are sent for driver-arriving, arrived, trip-started, and trip-completed states.
- A driver receives a push if an assigned ride is cancelled.
- Push tokens are stored per signed-in user and invalid tokens are cleaned automatically.
- Foreground tabs keep using the existing Socket.IO sound/toast alerts. The service worker suppresses duplicate system notifications when a Kaduna Only tab is visible.
- Clicking a system notification opens the relevant driver or trip screen.

## Firebase setup required

1. Create or select a Firebase project.
2. Add a Web app in Firebase Project Settings.
3. In Project Settings > Cloud Messaging, generate a Web Push certificate/VAPID key.
4. In Project Settings > Service Accounts, generate a private key for the backend.
5. Add the frontend Firebase web config and public VAPID key to `frontend/.env` using `frontend/.env.example`.
6. Add the service account project ID, client email and private key to `backend/.env` using `backend/.env.example`.
7. Do not commit either `.env` file or the downloaded service-account JSON file.
8. Run `npm install` in both backend and frontend, then restart both servers.

`localhost` can be used for service-worker development. A public deployment must use HTTPS for web push.
