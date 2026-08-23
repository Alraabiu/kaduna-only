# Kaduna Only Admin Backend V1

This build extends the working Rider + Driver project with a real MongoDB-backed admin operations layer.

Admin capabilities:
- Live dashboard statistics and recent trips
- User listing and account suspension/reactivation
- Driver verification/approval/rejection/suspension
- All-trip monitoring and administrative cancellation before trip start
- Completed-trip payment reporting by cash/wallet
- Wallet overview API
- Server pricing visibility

Admin API routes are protected by JWT authentication and the admin role.
