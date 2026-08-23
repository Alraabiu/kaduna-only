# Kaduna Only Live Driver Tracking V2

Adds continuous driver GPS sharing on the active-trip screen and live rider tracking.

## Flow
1. Driver accepts a trip and is redirected to `/driver/trip/:id`.
2. The driver browser starts `navigator.geolocation.watchPosition`.
3. Coordinates are emitted over authenticated Socket.IO as `driver:location`.
4. Backend stores the latest coordinates and emits them only to the assigned rider and admins.
5. Rider trip page animates the driver marker and recalculates OSRM distance/ETA to pickup or destination.

The driver must keep location permission enabled and the active trip page open. Browsers can throttle or stop GPS when fully backgrounded. A native/mobile wrapper is required later for reliable background location tracking.
