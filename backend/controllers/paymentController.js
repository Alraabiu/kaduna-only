const Payment = require('../models/Payment');

const {
  validWebhookSignature,
  fulfillWalletTopup
} = require('../services/paystackService');



async function paystackWebhook(req, res) {


  try {


    /*
    =========================================================
    PAYSTACK RAW BODY RESTORATION
    =========================================================

    express.raw() gives req.body as Buffer.

    We preserve the original bytes because Paystack
    signature verification requires the exact payload.

    =========================================================
    */


    if (
      Buffer.isBuffer(req.body)
    ) {

      req.rawBody =
        req.body;

    }



    let body =
      req.body;



    /*
    =========================================================
    CONVERT BUFFER TO JSON
    =========================================================
    */


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
          '[PAYSTACK WEBHOOK] Invalid JSON payload'
        );


        return res
          .status(400)
          .json({

            success:false,

            message:
            'Invalid webhook payload'

          });

      }

    }




    const signature =
      req.headers['x-paystack-signature'];




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
    =========================================================
    VERIFY SIGNATURE
    =========================================================
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
    =========================================================
    HANDLE ONLY PAYMENT SUCCESS
    =========================================================
    */


    if (
      body?.event !==
      'charge.success'
    ) {


      console.log(
        '[PAYSTACK WEBHOOK] Ignored event:',
        body?.event
      );


      return res
        .sendStatus(200);

    }




    const data =
      body?.data;



    if (
      !data
    ) {


      console.error(
        '[PAYSTACK WEBHOOK] Missing data'
      );


      return res
        .sendStatus(200);

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


      return res
        .sendStatus(200);

    }





    /*
    =========================================================
    FIND PAYMENT
    =========================================================
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


      return res
        .sendStatus(200);

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
    =========================================================
    ACKNOWLEDGE PAYSTACK

    After signature validation.
    =========================================================
    */


    res
      .sendStatus(200);





    /*
    =========================================================
    COMPLETE WALLET TOPUP
    =========================================================
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