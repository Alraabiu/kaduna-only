const crypto = require('crypto');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');


/*
 * =========================================================
 * PAYSTACK CONFIGURATION
 * =========================================================
 */

function secret() {
  const key = String(
    process.env.PAYSTACK_SECRET_KEY || ''
  ).trim();

  if (!key) {
    throw Object.assign(
      new Error(
        'Paystack is not configured on the server'
      ),
      { statusCode: 503 }
    );
  }

  if (!/^sk_(test|live)_/.test(key)) {
    throw Object.assign(
      new Error(
        'PAYSTACK_SECRET_KEY is invalid'
      ),
      { statusCode: 503 }
    );
  }

  return key;
}


/*
 * =========================================================
 * PAYSTACK MODE
 * =========================================================
 */

function mode() {
  const key = String(
    process.env.PAYSTACK_SECRET_KEY || ''
  ).trim();

  if (key.startsWith('sk_live_')) {
    return 'live';
  }

  if (key.startsWith('sk_test_')) {
    return 'test';
  }

  return 'unconfigured';
}


/*
 * =========================================================
 * PAYSTACK API REQUEST
 * =========================================================
 */

async function request(
  path,
  options = {}
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      30000
    );

  try {
    const response =
      await fetch(
        `https://api.paystack.co${path}`,
        {
          ...options,

          signal:
            options.signal ||
            controller.signal,

          headers: {
            Authorization:
              `Bearer ${secret()}`,

            'Content-Type':
              'application/json',

            ...(options.headers || {})
          }
        }
      );

    const raw =
      await response.text();

    let body;

    try {
      body =
        raw
          ? JSON.parse(raw)
          : {};
    } catch {
      body = {
        status: false,

        message:
          'Invalid response from Paystack'
      };
    }

    if (
      !response.ok ||
      !body.status
    ) {
      const error =
        new Error(
          body.message ||
          `Paystack request failed (${response.status})`
        );

      error.statusCode =
        response.status === 400
          ? 400
          : response.status === 401
            ? 502
            : response.status === 403
              ? 502
              : response.status === 404
                ? 404
                : response.status === 429
                  ? 429
                  : 502;

      error.paystackStatus =
        response.status;

      error.paystackResponse =
        body;

      throw error;
    }

    return body;
  } catch (error) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw Object.assign(
        new Error(
          'Paystack request timed out. Please try again.'
        ),
        {
          statusCode: 504
        }
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


/*
 * =========================================================
 * WALLET TOP-UP REFERENCE
 * =========================================================
 */

function newReference() {
  return (
    `KO-WALLET-${Date.now()}-` +
    crypto
      .randomBytes(5)
      .toString('hex')
      .toUpperCase()
  );
}


/*
 * =========================================================
 * WALLET TOP-UP
 * =========================================================
 */

async function initializeWalletTopup({
  user,
  amount
}) {
  const email =
    String(
      user?.email || ''
    )
      .trim()
      .toLowerCase();

  if (!email) {
    throw Object.assign(
      new Error(
        'Add an email address to your rider profile before funding your wallet'
      ),
      { statusCode: 400 }
    );
  }

  const numericAmount =
    Number(amount);

  if (
    !Number.isFinite(
      numericAmount
    ) ||
    numericAmount <= 0
  ) {
    throw Object.assign(
      new Error(
        'Wallet funding amount must be greater than zero'
      ),
      { statusCode: 400 }
    );
  }

  const reference =
    newReference();

  const callbackBase =
    String(
      process.env.CLIENT_URL ||
      'http://localhost:5173'
    )
      .replace(
        /\/$/,
        ''
      );

  const body =
    await request(
      '/transaction/initialize',
      {
        method: 'POST',

        body:
          JSON.stringify({
            email,

            amount:
              String(
                Math.round(
                  numericAmount * 100
                )
              ),

            currency:
              'NGN',

            reference,

            callback_url:
              `${callbackBase}/wallet/paystack/callback`,

            metadata:
              JSON.stringify({
                purpose:
                  'wallet_topup',

                userId:
                  String(user._id),

                phone:
                  user.phone || ''
              })
          })
      }
    );

  await Payment.create({
    user:
      user._id,

    reference,

    accessCode:
      body.data.access_code,

    amount:
      numericAmount,

    currency:
      'NGN',

    status:
      'initialized',

    metadata: {
      email,

      phone:
        user.phone || ''
    }
  });

  return {
    authorizationUrl:
      body.data.authorization_url,

    accessCode:
      body.data.access_code,

    reference
  };
}


/*
 * =========================================================
 * VERIFY WALLET PAYMENT
 * =========================================================
 */

async function verifyReference(
  reference
) {
  const cleanReference =
    String(
      reference || ''
    ).trim();

  if (!cleanReference) {
    throw Object.assign(
      new Error(
        'Payment reference is required'
      ),
      { statusCode: 400 }
    );
  }

  return request(
    `/transaction/verify/${encodeURIComponent(
      cleanReference
    )}`,
    {
      method: 'GET'
    }
  );
}


/*
 * =========================================================
 * COMPLETE WALLET TOP-UP
 * =========================================================
 */

async function fulfillWalletTopup(
  payment,
  paystackData
) {
  if (!payment) {
    throw Object.assign(
      new Error(
        'Payment record not found'
      ),
      { statusCode: 404 }
    );
  }

  if (!paystackData) {
    throw Object.assign(
      new Error(
        'Paystack transaction data is required'
      ),
      { statusCode: 400 }
    );
  }

  const expectedKobo =
    Math.round(
      Number(payment.amount) * 100
    );

  if (
    paystackData.reference !==
    payment.reference
  ) {
    throw Object.assign(
      new Error(
        'Payment reference mismatch'
      ),
      { statusCode: 400 }
    );
  }

  if (
    paystackData.status !==
    'success'
  ) {
    await Payment.updateOne(
      {
        _id:
          payment._id
      },
      {
        $set: {
          status:
            [
              'failed',
              'abandoned',
              'reversed'
            ].includes(
              paystackData.status
            )
              ? paystackData.status
              : 'pending',

          gatewayResponse:
            paystackData.gateway_response ||
            ''
        }
      }
    );

    return {
      credited:
        false,

      status:
        paystackData.status
    };
  }

  if (
    Number(
      paystackData.amount
    ) !== expectedKobo
  ) {
    throw Object.assign(
      new Error(
        'Verified payment amount does not match the wallet top-up'
      ),
      { statusCode: 400 }
    );
  }

  if (
    String(
      paystackData.currency ||
      'NGN'
    )
      .toUpperCase() !==
    'NGN'
  ) {
    throw Object.assign(
      new Error(
        'Unexpected payment currency'
      ),
      { statusCode: 400 }
    );
  }

  /*
   * Idempotent wallet credit.
   *
   * The transaction reference must not already
   * exist in the wallet transaction array.
   */
  const wallet =
    await Wallet.findOneAndUpdate(
      {
        user:
          payment.user,

        'transactions.reference': {
          $ne:
            payment.reference
        }
      },

      {
        $inc: {
          balance:
            payment.amount
        },

        $push: {
          transactions: {
            type:
              'credit',

            amount:
              payment.amount,

            description:
              'Paystack wallet funding',

            reference:
              payment.reference,

            provider:
              'paystack',

            status:
              'success'
          }
        }
      },

      {
        returnDocument:
          'after',

        upsert:
          false
      }
    );

  const existingWallet =
    wallet ||
    await Wallet.findOne({
      user:
        payment.user
    });

  if (!existingWallet) {
    throw new Error(
      'Wallet not found'
    );
  }

  await Payment.updateOne(
    {
      _id:
        payment._id
    },

    {
      $set: {
        status:
          'success',

        channel:
          paystackData.channel ||
          '',

        gatewayResponse:
          paystackData.gateway_response ||
          '',

        paystackTransactionId:
          String(
            paystackData.id ||
            ''
          ),

        paidAt:
          paystackData.paid_at
            ? new Date(
                paystackData.paid_at
              )
            : new Date(),

        creditedAt:
          new Date()
      }
    }
  );

  return {
    credited:
      !!wallet,

    status:
      'success',

    wallet:
      existingWallet
  };
}


/*
 * =========================================================
 * PAYSTACK WEBHOOK SIGNATURE
 * =========================================================
 */

function validWebhookSignature(
  rawBody,
  signature
) {
  if (
    rawBody === undefined ||
    rawBody === null ||
    !signature
  ) {
    return false;
  }

  let raw;

  /*
   * Express raw body normally arrives as Buffer.
   * Preserve Buffer bytes exactly.
   */
  if (
    Buffer.isBuffer(
      rawBody
    )
  ) {
    raw =
      rawBody;
  } else if (
    typeof rawBody ===
    'string'
  ) {
    raw =
      Buffer.from(
        rawBody,
        'utf8'
      );
  } else {
    return false;
  }

  const hash =
    crypto
      .createHmac(
        'sha512',
        secret()
      )
      .update(raw)
      .digest('hex');

  const expected =
    Buffer.from(
      hash,
      'utf8'
    );

  const received =
    Buffer.from(
      String(signature)
        .trim()
        .toLowerCase(),
      'utf8'
    );

  if (
    expected.length !==
    received.length
  ) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      expected,
      received
    );
  } catch {
    return false;
  }
}


/*
 * =========================================================
 * PAYSTACK BANK CACHE
 * =========================================================
 */

let bankCache = null;

let bankCacheExpiresAt = 0;

const BANK_CACHE_TTL =
  6 * 60 * 60 * 1000;


/*
 * =========================================================
 * FETCH ONE BANK PAGE
 * =========================================================
 */

async function fetchBankPage(
  page
) {
  return request(
    `/bank?country=nigeria&currency=NGN&type=nuban&perPage=100&page=${page}`,
    {
      method:
        'GET'
    }
  );
}


/*
 * =========================================================
 * LIST NIGERIAN BANKS
 * =========================================================
 *
 * The administrator does not need to know bank codes.
 *
 * Paystack provides the bank directory.
 *
 * Frontend:
 *
 *     Search bank
 *          ↓
 *     Select bank
 *          ↓
 *     Automatically obtain bank code
 *          ↓
 *     Verify account
 *
 * =========================================================
 */

async function listNigerianBanks({
  forceRefresh = false
} = {}) {
  const now =
    Date.now();

  if (
    !forceRefresh &&
    Array.isArray(
      bankCache
    ) &&
    now <
      bankCacheExpiresAt
  ) {
    return {
      status:
        true,

      data:
        bankCache
    };
  }

  const allBanks = [];

  /*
   * Paystack supports pagination.
   *
   * We fetch pages until a page contains fewer
   * than 100 records.
   *
   * Safety limit prevents an accidental endless loop.
   */
  const MAX_PAGES =
    10;

  for (
    let page = 1;
    page <= MAX_PAGES;
    page++
  ) {
    const response =
      await fetchBankPage(
        page
      );

    const pageData =
      Array.isArray(
        response.data
      )
        ? response.data
        : [];

    allBanks.push(
      ...pageData
    );

    if (
      pageData.length <
      100
    ) {
      break;
    }
  }

  const banks =
    allBanks
      .filter(bank =>
        bank &&
        bank.active !== false &&
        bank.is_deleted !== true
      )
      .map(bank => ({
        name:
          String(
            bank.name ||
            ''
          ).trim(),

        code:
          String(
            bank.code ||
            ''
          ).trim(),

        slug:
          String(
            bank.slug ||
            ''
          ).trim(),

        type:
          String(
            bank.type ||
            'nuban'
          ).trim(),

        country:
          String(
            bank.country ||
            'Nigeria'
          ).trim(),

        currency:
          String(
            bank.currency ||
            'NGN'
          )
            .trim()
            .toUpperCase(),

        active:
          bank.active !== false
      }))
      .filter(bank =>
        bank.name &&
        bank.code
      );


  /*
   * Remove duplicate bank-code/name combinations.
   */
  const unique =
    new Map();

  for (
    const bank of banks
  ) {
    const key =
      `${bank.code}|${bank.name}`
        .toLowerCase();

    if (
      !unique.has(key)
    ) {
      unique.set(
        key,
        bank
      );
    }
  }

  const sortedBanks =
    Array.from(
      unique.values()
    ).sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );

  bankCache =
    sortedBanks;

  bankCacheExpiresAt =
    Date.now() +
    BANK_CACHE_TTL;

  return {
    status:
      true,

    data:
      sortedBanks
  };
}


/*
 * =========================================================
 * CLEAR BANK CACHE
 * =========================================================
 */

function clearBankCache() {
  bankCache =
    null;

  bankCacheExpiresAt =
    0;
}


/*
 * =========================================================
 * RESOLVE NIGERIAN BANK ACCOUNT
 * =========================================================
 */

async function resolveBankAccount({
  accountNumber,
  bankCode
}) {
  const account =
    String(
      accountNumber ||
      ''
    )
      .replace(
        /\s+/g,
        ''
      )
      .trim();

  const code =
    String(
      bankCode ||
      ''
    ).trim();

  if (
    !/^\d{10}$/.test(
      account
    )
  ) {
    throw Object.assign(
      new Error(
        'Account number must be exactly 10 digits'
      ),
      { statusCode: 400 }
    );
  }

  if (!code) {
    throw Object.assign(
      new Error(
        'Bank code is required'
      ),
      { statusCode: 400 }
    );
  }

  return request(
    `/bank/resolve?account_number=${encodeURIComponent(
      account
    )}&bank_code=${encodeURIComponent(
      code
    )}`,
    {
      method:
        'GET'
    }
  );
}


/*
 * =========================================================
 * CREATE PAYSTACK TRANSFER RECIPIENT
 * =========================================================
 */

async function createTransferRecipient({
  accountName,
  accountNumber,
  bankCode,
  currency = 'NGN'
}) {
  const cleanAccount =
    String(
      accountNumber ||
      ''
    )
      .replace(
        /\s+/g,
        ''
      )
      .trim();

  const cleanName =
    String(
      accountName ||
      ''
    ).trim();

  const cleanBankCode =
    String(
      bankCode ||
      ''
    ).trim();

  if (!cleanName) {
    throw Object.assign(
      new Error(
        'Account name is required'
      ),
      { statusCode: 400 }
    );
  }

  if (
    !/^\d{10}$/.test(
      cleanAccount
    )
  ) {
    throw Object.assign(
      new Error(
        'Account number must be exactly 10 digits'
      ),
      { statusCode: 400 }
    );
  }

  if (!cleanBankCode) {
    throw Object.assign(
      new Error(
        'Bank code is required'
      ),
      { statusCode: 400 }
    );
  }

  return request(
    '/transferrecipient',
    {
      method:
        'POST',

      body:
        JSON.stringify({
          type:
            'nuban',

          name:
            cleanName,

          account_number:
            cleanAccount,

          bank_code:
            cleanBankCode,

          currency:
            String(
              currency ||
              'NGN'
            )
              .trim()
              .toUpperCase()
        })
    }
  );
}


/*
 * =========================================================
 * PLATFORM COMMISSION TRANSFER REFERENCE
 * =========================================================
 */

function newTransferReference() {
  return (
    `KO-COMMISSION-${Date.now()}-` +
    crypto
      .randomBytes(5)
      .toString('hex')
      .toUpperCase()
  );
}


/*
 * =========================================================
 * INITIATE PLATFORM COMMISSION TRANSFER
 * =========================================================
 */

async function initiateTransfer({
  amount,
  recipientCode,
  reference,
  reason
}) {
  const numericAmount =
    Number(amount);

  if (
    !Number.isFinite(
      numericAmount
    ) ||
    numericAmount <= 0
  ) {
    throw Object.assign(
      new Error(
        'Transfer amount must be greater than zero'
      ),
      { statusCode: 400 }
    );
  }

  if (!recipientCode) {
    throw Object.assign(
      new Error(
        'Paystack transfer recipient is required'
      ),
      { statusCode: 400 }
    );
  }

  if (!reference) {
    throw Object.assign(
      new Error(
        'Transfer reference is required'
      ),
      { statusCode: 400 }
    );
  }

  /*
   * Paystack expects amount in kobo.
   *
   * Example:
   *
   * ₦150 = 15,000 kobo
   */
  const koboAmount =
    Math.round(
      numericAmount * 100
    );

  if (
    koboAmount <= 0
  ) {
    throw Object.assign(
      new Error(
        'Transfer amount is invalid'
      ),
      { statusCode: 400 }
    );
  }

  return request(
    '/transfer',
    {
      method:
        'POST',

      body:
        JSON.stringify({
          source:
            'balance',

          amount:
            koboAmount,

          recipient:
            recipientCode,

          reference:
            String(
              reference
            ).trim(),

          reason:
            reason ||
            'Kaduna Only platform commission withdrawal'
        })
    }
  );
}


/*
 * =========================================================
 * VERIFY PLATFORM COMMISSION TRANSFER
 * =========================================================
 */

async function verifyTransfer(
  reference
) {
  const cleanReference =
    String(
      reference ||
      ''
    ).trim();

  if (!cleanReference) {
    throw Object.assign(
      new Error(
        'Transfer reference is required'
      ),
      { statusCode: 400 }
    );
  }

  return request(
    `/transfer/verify/${encodeURIComponent(
      cleanReference
    )}`,
    {
      method:
        'GET'
    }
  );
}


/*
 * =========================================================
 * EXPORTS
 * =========================================================
 */

module.exports = {

  /*
   * Wallet
   */
  initializeWalletTopup,
  verifyReference,
  fulfillWalletTopup,

  /*
   * Webhook
   */
  validWebhookSignature,

  /*
   * Banks
   */
  listNigerianBanks,
  clearBankCache,
  resolveBankAccount,

  /*
   * Transfers
   */
  createTransferRecipient,
  initiateTransfer,
  verifyTransfer,
  newTransferReference,

  /*
   * Configuration
   */
  mode
};