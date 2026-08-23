# Kaduna Only Commission & Revenue V1

This build extends Manual Withdrawals V1 with a driver-friendly flat platform fee.

## Default commission

- `PLATFORM_COMMISSION_FLAT=50`
- One flat fee per completed trip, regardless of trip fare.
- Change the environment value to `35` later without changing application code.

## Wallet-paid rides

The rider pays the full fare from the wallet. On completion, Kaduna Only retains the flat fee and the driver's wallet receives the fare minus the flat fee.

Example: Fare ₦2,000 -> Kaduna Only ₦50 -> Driver ₦1,950.

## Cash rides

The driver collects the full fare from the rider. On completion, the platform attempts to collect the ₦50 fee from the driver's app wallet. If there is not enough wallet balance, the fee is marked `due` and is visible to admin. Outstanding cash-trip fees must be settled before driver withdrawal.

## Admin reporting

The admin dashboard distinguishes gross trip value from Kaduna Only commission revenue and shows outstanding cash-trip fees.
