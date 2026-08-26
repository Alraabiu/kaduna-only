const Payment = require('../models/Payment');

const {
  validWebhookSignature,
  fulfillWalletTopup
} = require('../services/paystackService');


async function paystackWebhook(req, res) {

  const signature =
    req.headers['x-paystack-signature'];


  try {

    console.log('[PAYSTACK WEBHOOK DEBUG]', {

      hasRawBody:
        !!req.rawBody,

      rawBodyLength:
        req.rawBody?.length || 0,

      hasSignature:
        !!signature,

      signatureLength:
        String(signature || '').length,

      event:
        req.body?.event || null,

      reference:
        req.body?.data?.reference || null

    });


    /*
     * -------------------------------------------------------
     * VERIFY PAYSTACK SIGNATURE
     * -------------------------------------------------------
     *
     * Paystack signs the original request body.
     * Never use JSON.stringify(req.body).
     *
     */

    const signatureValid =
      validWebhookSignature(
        req.rawBody,
        signature
      );


    if (!signatureValid) {

      console.error(
        '[PAYSTACK WEBHOOK] Invalid signature'
      );


      return res
        .status(401)
        .json({
          success:false,
          message:'Invalid webhook signature'
        });

    }


    /*
     * -------------------------------------------------------
     * ACKNOWLEDGE PAYSTACK
     * -------------------------------------------------------
     *
     * Paystack requires a fast 200 response.
     * Processing continues after acknowledgement.
     *
     */


    res.sendStatus(200);



    /*
     * -------------------------------------------------------
     * HANDLE EVENTS
     * -------------------------------------------------------
     */

    const event =
      req.body?.event;


    if (
      event !==
      'charge.success'
    ) {

      console.log(
        '[PAYSTACK WEBHOOK] Ignored event:',
        event
      );

      return;

    }



    const data =
      req.body?.data;


    if (!data) {

      console.error(
        '[PAYSTACK WEBHOOK] Missing data payload'
      );

      return;

    }



    const reference =
      String(
        data.reference || ''
      )
      .trim();



    if (!reference) {

      console.error(
        '[PAYSTACK WEBHOOK] Missing reference'
      );

      return;

    }



    /*
     * -------------------------------------------------------
     * FIND PAYMENT
     * -------------------------------------------------------
     */

    const payment =
      await Payment.findOne({
        reference
      });



    if (!payment) {

      console.error(
        '[PAYSTACK WEBHOOK] Payment not found',
        reference
      );

      return;

    }



    console.log(
      '[PAYSTACK WEBHOOK] Payment found',
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
     * -------------------------------------------------------
     * PROCESS WALLET CREDIT
     * -------------------------------------------------------
     *
     * fulfillWalletTopup handles:
     *
     * - duplicate webhook protection
     * - amount verification
     * - wallet crediting
     * - payment status update
     *
     */


    const result =
      await fulfillWalletTopup(
        payment,
        data
      );



    console.log(
      '[PAYSTACK WEBHOOK] Processing complete',
      {

        reference,

        status:
          result?.status,

        credited:
          result?.credited

      }
    );


  } catch(error) {


    console.error(
      '[PAYSTACK WEBHOOK ERROR]',
      error
    );


    /*
     * If signature already passed and response
     * was sent, do not send another response.
     */

    if (
      !res.headersSent
    ) {

      res
        .status(500)
        .json({
          success:false,
          message:'Webhook processing failed'
        });

    }

  }

}



module.exports = {
  paystackWebhook
};