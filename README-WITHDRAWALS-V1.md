# Kaduna Only Manual Driver Withdrawals V1

This build extends Payments V2 with a manual driver payout workflow that can be used before Paystack Transfers is available.

## Driver flow

1. Driver saves a bank name, account name, and 10-digit account number.
2. Driver requests a whole-naira withdrawal at or above the configured minimum.
3. The requested amount is immediately reserved by deducting it from the driver's available wallet balance.
4. Only one pending/approved withdrawal is allowed at a time.
5. Driver can monitor Pending, Approved, Paid, and Rejected states from Driver Wallet.

## Admin flow

1. Admin opens `/admin/withdrawals`.
2. Pending request can be Approved or Rejected.
3. After manually sending the bank transfer, Admin selects Mark Paid and records the transfer/reference number.
4. If a Pending or Approved withdrawal is rejected, the reserved amount is returned to the driver's wallet once using an idempotent refund reference.
5. Driver receives Firebase/notification updates for approval, payment, or rejection where push is configured.

## Safety rules

- Wallet balance is checked and deducted atomically when the withdrawal is requested.
- A driver cannot submit another withdrawal while one is Pending or Approved.
- Rejection refunds use a unique transaction reference to prevent duplicate refunds.
- Mark Paid does not deduct the wallet again because funds were already reserved at request time.
- Bank details are snapshotted onto each withdrawal so historical payout records remain accurate even if a driver later changes bank details.

## Configuration

Backend `.env` may optionally include:

`WITHDRAWAL_MINIMUM=1000`

The default is NGN 1,000 if omitted.

## Future Paystack Transfers upgrade

The Withdrawal model deliberately separates payout status from wallet accounting. When Kaduna Only becomes eligible for Paystack Transfers, the manual bank-transfer step can be replaced by Paystack recipient creation and transfer initiation without redesigning the driver wallet ledger.
