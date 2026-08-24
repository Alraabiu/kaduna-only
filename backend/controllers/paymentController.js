const Payment = require('../models/Payment');

const {
  validWebhookSignature,
  fulfillWalletTopup
} = require('../services/paystackService');

async function paystackWebhook(req, res) {
  try {
    const signature =
      req.headers['x-paystack-signature'];

    console.log('[PAYSTACK WEBHOOK DEBUG]', {
      hasRawBody: !!req.rawBody,
      rawBodyLength: req.rawBody?.length || 0,
      hasSignature: !!signature,
      signatureLength: String(signature || '').length,
      event: req.body?.event || null,
      reference: req.body?.data?.reference || null
    });

    /*
     * Verify Paystack using the ORIGINAL raw request body.
     */
    if (
      !validWebhookSignature(
        req.rawBody,
        signature
      )
    ) {
      console.error(
        '[PAYSTACK WEBHOOK] Invalid signature'
      );

      return res
        .status(401)
        .send('invalid signature');
    }

    /*
     * Acknowledge the webhook after successful
     * signature validation.
     */
    res.sendStatus(200);

    /*
     * We only need to process successful charges.
     */
    if (
      req.body?.event !==
      'charge.success'
    ) {
      console.log(
        '[PAYSTACK WEBHOOK] Ignoring event:',
        req.body?.event
      );

      return;
    }

    const data =
      req.body.data || {};

    const reference =
      String(
        data.reference || ''
      ).trim();

    if (!reference) {
      console.error(
        '[PAYSTACK WEBHOOK] Missing payment reference'
      );

      return;
    }

    /*
     * Find the payment created when the rider
     * initialized the wallet funding.
     */
    const payment =
      await Payment.findOne({
        reference
      });

    if (!payment) {
      console.error(
        '[PAYSTACK WEBHOOK] Payment not found:',
        reference
      );

      return;
    }

    console.log(
      '[PAYSTACK WEBHOOK] Payment found:',
      {
        paymentId:
          String(payment._id),

        reference:
          payment.reference,

        amount:
          payment.amount,

        status:
          payment.status
      }
    );

    /*
     * This function performs the amount/currency checks,
     * prevents duplicate credits and updates the wallet.
     */
    const result =
      await fulfillWalletTopup(
        payment,
        data
      );

    console.log(
      '[PAYSTACK WEBHOOK] Wallet processing complete:',
      {
        reference,
        status:
          result?.status,
        credited:
          result?.credited
      }
    );

  } catch (e) {

    console.error(
      '[PAYSTACK WEBHOOK ERROR]',
      e
    );

    /*
     * Paystack has already received a 200 response
     * if signature validation succeeded, so don't
     * attempt to send another response.
     */
    if (!res.headersSent) {
      res.sendStatus(200);
    }
  }
}

module.exports = {
  paystackWebhook
};