# Kaduna Only Payments V2

This build extends Payments V1 with safer wallet-paid rides.

## Wallet ride lifecycle

- Wallet fare is atomically reserved when the rider requests the ride.
- The rider cannot book a wallet ride without enough balance.
- The fare is not charged again when the trip completes.
- Eligible cancellations automatically refund a previously reserved fare.
- Wallet-paid driver earnings use an idempotent transaction reference so completion cannot credit the same ride twice.
- Cash fares are not also credited to the driver app wallet, preventing double payment when cash was already collected directly.
- Trips created by older builds remain compatible and are debited once at completion if no reservation exists.
- Wallet transaction history records reservation, refund and driver earning references.

## Test

1. Fund a rider wallet with Paystack Test Mode.
2. Book a ride using Wallet. Balance should decrease immediately.
3. Cancel before the trip starts. Balance should return automatically.
4. Book again, let the driver accept and complete the trip. The rider must not be debited twice and the driver's wallet should receive the fare once.
