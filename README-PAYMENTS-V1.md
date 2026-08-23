# Kaduna Only Payments V1 - Paystack Wallet Funding

This build extends Push Notifications V4 with server-verified Paystack wallet funding.

## Added

- Rider wallet funding through Paystack Checkout
- Paystack transaction initialization only from the backend
- Server-side Paystack verification before wallet credit
- MongoDB Payment records with unique references
- Idempotent wallet credit protection using transaction references
- Test/live Paystack mode detection from the secret-key prefix
- Rider payment callback page
- Payment history endpoint
- Paystack webhook endpoint for production deployment
- Existing cash and wallet ride payment options retained

## Backend environment

Keep your existing backend variables and add:

PAYSTACK_SECRET_KEY=sk_test_YOUR_TEST_SECRET_KEY

Do not put the Paystack secret key in the frontend.

## Local test

1. Run backend and frontend.
2. Ensure the rider account has an email address in Profile.
3. Open Wallet and choose an amount.
4. Click Fund Wallet with Paystack.
5. Complete a Paystack test payment.
6. Paystack redirects to `/wallet/paystack/callback`.
7. Kaduna Only verifies the reference with Paystack and credits the wallet once.

## Production webhook

Set the Paystack webhook URL after deployment to:

https://YOUR-API-DOMAIN/api/payments/paystack/webhook

Public Paystack webhooks cannot call localhost. The callback + verify flow is sufficient for local Test Mode testing.
