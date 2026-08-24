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
 * PAYSTACK API REQUEST
 * =========================================================
 */

async function request(path, options = {}) {
  const response = await fetch(
    `https://api.paystack.co${path}`,
    {
      ...options,

      headers: {
        Authorization: `Bearer ${secret()}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }
  );

  const body =
    await response
      .json()
      .catch(() => ({
        status: false,
        message:
          'Invalid response from Paystack'
      }));

  if (
    !response.ok ||
    !body.status
  ) {
    const error = new Error(
      body.message ||
      `Paystack request failed (${response.status})`
    );

    error.statusCode = 502;

    throw error;
  }

  return body;
}


/*
 * =========================================================
 * PAYSTACK BANK CACHE
 * =========================================================
 *
 * Nigerian banks do not need to be fetched from Paystack
 * every time the admin opens the commission page.
 *
 * Cache duration:
 * 6 hours.
 *
 * The cache is process-local. A new Render deployment will
 * naturally refresh it.
 * =========================================================
 */

let bankCache = null;
let bankCacheExpiresAt = 0;

const BANK_CACHE_TTL =
  6 * 60 * 60 * 1000;


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
    String(user.email || '')
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
    !Number.isFinite(numericAmount) ||
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
    ).replace(/\/$/, '');

  const body =
    await request(
      '/transaction/initialize',
      {
        method: 'POST',

        body: JSON.stringify({
          email,

          amount:
            String(
              Math.round(
                numericAmount * 100
              )
            ),

          currency: 'NGN',

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
    user: user._id,

    reference,

    accessCode:
      body.data.access_code,

    amount:
      numericAmount,

    currency: 'NGN',

    status: 'initialized',

    metadata: {
      email,
      phone: user.phone || ''
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
  if (!reference) {
    throw Object.assign(
      new Error(
        'Payment reference is required'
      ),
      { statusCode: 400 }
    );
  }

  return request(
    `/transaction/verify/${encodeURIComponent(reference)}`,
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
        _id: payment._id
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
      credited: false,

      status:
        paystackData.status
    };
  }

  if (
    Number(paystackData.amount) !==
    expectedKobo
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
      paystackData.currency || 'NGN'
    ).toUpperCase() !== 'NGN'
  ) {
    throw Object.assign(
      new Error(
        'Unexpected payment currency'
      ),
      { statusCode: 400 }
    );
  }

  const wallet =
    await Wallet.findOneAndUpdate(
      {
        user: payment.user,

        'transactions.reference': {
          $ne: payment.reference
        }
      },

      {
        $inc: {
          balance:
            payment.amount
        },

        $push: {
          transactions: {
            type: 'credit',

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
      user: payment.user
    });

  if (!existingWallet) {
    throw new Error(
      'Wallet not found'
    );
  }

  await Payment.updateOne(
    {
      _id: payment._id
    },

    {
      $set: {
        status: 'success',

        channel:
          paystackData.channel || '',

        gatewayResponse:
          paystackData.gateway_response ||
          '',

        paystackTransactionId:
          String(
            paystackData.id || ''
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
    !rawBody ||
    !signature
  ) {
    return false;
  }

  const hash =
    crypto
      .createHmac(
        'sha512',
        secret()
      )
      .update(rawBody)
      .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(
        hash,
        'utf8'
      ),

      Buffer.from(
        String(signature),
        'utf8'
      )
    );
  } catch {
    return false;
  }
}


/*
 * =========================================================
 * LIST NIGERIAN BANKS
 * =========================================================
 *
 * Used by the Admin Platform Commission page.
 *
 * The frontend should NOT ask the administrator to manually
 * remember bank codes such as 044, 058, etc.
 *
 * Instead:
 *
 *     Paystack → bank list → frontend dropdown
 *
 * The selected bank's code is then used internally for
 * account verification and transfer-recipient creation.
 * =========================================================
 */

async function listNigerianBanks({
  forceRefresh = false
} = {}) {
  const now = Date.now();

  if (
    !forceRefresh &&
    Array.isArray(bankCache) &&
    now < bankCacheExpiresAt
  ) {
    return {
      status: true,
      data: bankCache
    };
  }

  const response =
    await request(
      '/bank?country=nigeria&currency=NGN&perPage=100',
      {
        method: 'GET'
      }
    );

  const banks =
    Array.isArray(response.data)
      ? response.data
          .filter(bank =>
            bank &&
            bank.active !== false &&
            bank.is_deleted !== true
          )
          .map(bank => ({
            name:
              String(
                bank.name || ''
              ).trim(),

            code:
              String(
                bank.code || ''
              ).trim(),

            slug:
              String(
                bank.slug || ''
              ).trim(),

            type:
              String(
                bank.type ||
                'nuban'
              ).trim(),

            currency:
              String(
                bank.currency ||
                'NGN'
              ).trim()
              .toUpperCase()
          }))
          .filter(bank =>
            bank.name &&
            bank.code
          )
      : [];

  banks.sort(
    (a, b) =>
      a.name.localeCompare(
        b.name
      )
  );

  bankCache = banks;

  bankCacheExpiresAt =
    Date.now() +
    BANK_CACHE_TTL;

  return {
    status: true,
    data: banks
  };
}


/*
 * =========================================================
 * CLEAR BANK CACHE
 * =========================================================
 *
 * Useful if Paystack changes the bank directory and the
 * application needs to refresh immediately.
 * =========================================================
 */

function clearBankCache() {
  bankCache = null;
  bankCacheExpiresAt = 0;
}


/*
 * =========================================================
 * BANK ACCOUNT VERIFICATION
 * =========================================================
 */

async function resolveBankAccount({
  accountNumber,
  bankCode
}) {
  const account =
    String(
      accountNumber || ''
    )
      .replace(/\s+/g, '')
      .trim();

  const code =
    String(
      bankCode || ''
    ).trim();

  if (
    !/^\d{10}$/.test(account)
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
    )}&account_name=&bank_code=${encodeURIComponent(
      code
    )}`,
    {
      method: 'GET'
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
      accountNumber || ''
    )
      .replace(/\s+/g, '')
      .trim();

  const cleanName =
    String(
      accountName || ''
    ).trim();

  const cleanBankCode =
    String(
      bankCode || ''
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
      method: 'POST',

      body: JSON.stringify({
        type: 'nuban',

        name:
          cleanName,

        account_number:
          cleanAccount,

        bank_code:
          cleanBankCode,

        currency:
          String(
            currency || 'NGN'
          )
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

  return request(
    '/transfer',
    {
      method: 'POST',

      body: JSON.stringify({
        source: 'balance',

        amount:
          Math.round(
            numericAmount * 100
          ),

        recipient:
          recipientCode,

        reference,

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
  if (!reference) {
    throw Object.assign(
      new Error(
        'Transfer reference is required'
      ),
      { statusCode: 400 }
    );
  }

  return request(
    `/transfer/verify/${encodeURIComponent(
      reference
    )}`,
    {
      method: 'GET'
    }
  );
}


/*
 * =========================================================
 * PAYSTACK MODE
 * =========================================================
 */

function mode() {
  const key =
    String(
      process.env.PAYSTACK_SECRET_KEY ||
      ''
    ).trim();

  if (
    key.startsWith(
      'sk_live_'
    )
  ) {
    return 'live';
  }

  if (
    key.startsWith(
      'sk_test_'
    )
  ) {
    return 'test';
  }

  return 'unconfigured';
}


/*
 * =========================================================
 * EXPORTS
 * =========================================================
 */

module.exports = {

  // Wallet
  initializeWalletTopup,
  verifyReference,
  fulfillWalletTopup,

  // Webhook
  validWebhookSignature,

  // Banks
  listNigerianBanks,
  clearBankCache,
  resolveBankAccount,

  // Transfers
  createTransferRecipient,
  initiateTransfer,
  verifyTransfer,
  newTransferReference,

  // Mode
  mode
};