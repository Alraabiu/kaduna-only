# KADUNA ONLY — Phase 9.5 Real Full Stack

Separate React/Vite frontend and Node/Express/MongoDB backend.

## Backend
1. `cd backend`
2. `Copy-Item .env.example .env`
3. Edit `.env` if MongoDB is not local.
4. `npm install`
5. `npm run seed`
6. `npm run dev`

Health: http://localhost:5000/api/health

## Frontend
1. Open another PowerShell.
2. `cd frontend`
3. `Copy-Item .env.example .env`
4. `npm install`
5. `npm run dev`

Open http://localhost:5173

## Seed accounts
Admin: 08000000001 / ChangeMe123!
Driver: 08000000003 / ChangeMe123! (approved + online)
Rider: 08000000004 / ChangeMe123!

Change seed passwords before any real deployment.

## Rider Backend V1
This build moves rider-critical logic to the backend:
- Server-side fare, distance and ETA quotes: `POST /api/trips/quote`
- Server-side trip creation and wallet validation: `POST /api/trips`
- One active trip per rider
- Active trip lookup: `GET /api/trips/active`
- Secure trip lookup: `GET /api/trips/:id`
- Paginated trip history: `GET /api/trips?page=1&limit=20`
- Rider dashboard: `GET /api/rider/dashboard`
- Rider profile update: `PATCH /api/rider/profile`
- Wallet transaction endpoint: `GET /api/wallet/transactions`
- Demo wallet funding is disabled unless `ALLOW_DEMO_TOPUP=true`

The current distance engine uses configured Kaduna locations and a road-distance approximation. A live maps/routing provider should replace it in the mapping phase.

## Driver Backend V1
Driver functions are now database-backed: approved online status, validated GPS updates, available requests filtered by vehicle, atomic trip acceptance, one active trip per driver, controlled trip-state transitions with timestamps, completed-trip counters, and wallet earnings credits. New endpoint: `GET /api/drivers/dashboard`.


## Maps V1
This build adds OpenStreetMap + Leaflet map display, Nominatim location search through the backend, OSRM road routing, real pickup/destination coordinates, server-side route fare calculation, and live driver tracking on rider trip maps.

For local development, the default public Nominatim and OSRM endpoints are used. Do not implement client-side autocomplete against the public Nominatim service. For production/commercial scale, configure your own or a suitable hosted geocoder/router and tile provider through environment variables.
