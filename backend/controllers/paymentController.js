const Payment = require('../models/Payment');

const {
  validWebhookSignature,
  fulfillWalletTopup
} = require('../services/paystackService');



async function paystackWebhook(req, res) {

  const signature =
    req.headers['x-paystack-signature'];


  try {


    /*
     * =======================================================
     * HANDLE RAW BODY PAYLOAD
     * =======================================================
     *
     * If express.raw() is used, req.body becomes Buffer.
     * Convert it back to JSON after signature validation
     * preparation.
     *
     */


    let body =
      req.body;



    if (
      Buffer.isBuffer(body)
    ) {

      try {

        body =
          JSON.parse(
            body.toString('utf8')
          );

      } catch(error) {

        console.error(
          '[PAYSTACK WEBHOOK] Invalid JSON body'
        );

        return res
          .status(400)
          .json({
            success:false,
            message:'Invalid webhook payload'
          });

      }

    }




    console.log(
      '[PAYSTACK WEBHOOK DEBUG]',
      {

        hasRawBody:
          !!req.rawBody,


        rawBodyLength:
          req.rawBody?.length || 0,


        hasSignature:
          !!signature,


        signatureLength:
          String(signature || '').length,


        event:
          body?.event || null,


        reference:
          body?.data?.reference || null

      }
    );




    /*
     * =======================================================
     * VERIFY PAYSTACK SIGNATURE
     * =======================================================
     *
     * Must use original raw request bytes.
     *
     */


    const signatureValid =
      validWebhookSignature(
        req.rawBody,
        signature
      );



    if (
      !signatureValid
    ) {


      console.error(
        '[PAYSTACK WEBHOOK] Invalid signature'
      );


      return res
        .status(401)
        .json({

          success:false,

          message:
            'Invalid webhook signature'

        });

    }




    /*
     * =======================================================
     * ACKNOWLEDGE PAYSTACK
     * =======================================================
     */


    res.sendStatus(200);




    /*
     * =======================================================
     * HANDLE ONLY SUCCESSFUL PAYMENTS
     * =======================================================
     */


    if (
      body?.event !==
      'charge.success'
    ) {


      console.log(
        '[PAYSTACK WEBHOOK] Ignoring event:',
        body?.event
      );


      return;

    }




    const data =
      body.data;



    if (
      !data
    ) {


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




    if (
      !reference
    ) {


      console.error(
        '[PAYSTACK WEBHOOK] Missing reference'
      );


      return;

    }




    /*
     * =======================================================
     * FIND PAYMENT RECORD
     * =======================================================
     */


    const payment =
      await Payment.findOne({
        reference
      });




    if (
      !payment
    ) {


      console.error(
        '[PAYSTACK WEBHOOK] Payment not found:',
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
     * =======================================================
     * CREDIT WALLET
     * =======================================================
     *
     * Handles:
     *
     * - duplicate webhook protection
     * - amount verification
     * - wallet update
     * - payment completion
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



    if (
      !res.headersSent
    ) {


      res
        .status(500)
        .json({

          success:false,

          message:
            'Webhook processing failed'

        });

    }

  }

}




module.exports = {

  paystackWebhook

};