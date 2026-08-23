# Kaduna Only Realtime V1

This build extends the working Rider + Driver + Admin backend with authenticated Socket.IO realtime events.

## Added
- Authenticated Socket.IO connection using the existing JWT
- Rider ride requests pushed to drivers immediately
- Atomic driver acceptance still enforced by MongoDB
- Trip status updates pushed to rider, driver and admin
- Driver GPS updates streamed to the rider during active trips
- Driver request lists refresh automatically
- Rider trip details update automatically
- Admin dashboard refreshes on trip activity
- Fixed rider trip-detail route navigation to `/trip/:id`

## Install
Run `npm install` in both backend and frontend because this build adds `socket.io` and `socket.io-client`.

Backend `.env` should retain the existing values:
- PORT=5000
- MONGO_URI=...
- JWT_SECRET=...
- CLIENT_URL=http://localhost:5173

Frontend can optionally use:
- VITE_API_URL=http://localhost:5000/api
- VITE_SOCKET_URL=http://localhost:5000

`VITE_SOCKET_URL` is optional. If omitted, the frontend derives it from `VITE_API_URL`.

## Driver GPS
When an approved driver goes online, the browser requests location permission and starts watching GPS position. On localhost this works in modern browsers. Production deployment should use HTTPS.
