const crypto = require('crypto');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');

function secret() {
  const key = String(process.env.PAYSTACK_SECRET_KEY || '').trim();

  if (!key) {
    throw Object.assign(
      new Error('Paystack is not configured on the server'),
      { statusCode: 503 }
    );
  }

  if (!/^sk_(test|live)_/.test(key)) {
    throw Object.assign(
      new Error('PAYSTACK_SECRET_KEY is invalid'),
      { statusCode: 503 }
    );
  }

  return key;
}

async function request(path, options = {}) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await res
    .json()
    .catch(() => ({
      status: false,
      message: 'Invalid response from Paystack'
    }));

  if (!res.ok || !body.status) {
    const err = new Error(
      body.message || `Paystack request failed (${res.status})`
    );

    err.statusCode = 502;
    throw err;
  }

  return body;
}


/*
 * ---------------------------------------------------------
 * WALLET TOP-UP
 * ---------------------------------------------------------
 */

function newReference() {
  return `KO-WALLET-${Date.now()}-${crypto
    .randomBytes(5)
    .toString('hex')
    .toUpperCase()}`;
}

async function initializeWalletTopup({ user, amount }) {
  const email = String(user.email || '')
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

  const reference = newReference();

  const callbackBase = String(
    process.env.CLIENT_URL || 'http://localhost:5173'
  ).replace(/\/$/, '');

  const body = await request('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email,
      amount: String(Math.round(amount * 100)),
      currency: 'NGN',
      reference,
      callback_url: `${callbackBase}/wallet/paystack/callback`,
      metadata: JSON.stringify({
        purpose: 'wallet_topup',
        userId: String(user._id),
        phone: user.phone || ''
      })
    })
  });

  await Payment.create({
    user: user._id,
    reference,
    accessCode: body.data.access_code,
    amount,
    currency: 'NGN',
    status: 'initialized',
    metadata: {
      email,
      phone: user.phone || ''
    }
  });

  return {
    authorizationUrl: body.data.authorization_url,
    accessCode: body.data.access_code,
    reference
  };
}

async function verifyReference(reference) {
  return request(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: 'GET'
    }
  );
}

async function fulfillWalletTopup(payment, paystackData) {
  if (!payment) {
    throw Object.assign(
      new Error('Payment record not found'),
      { statusCode: 404 }
    );
  }

  const expectedKobo =
    Math.round(Number(payment.amount) * 100);

  if (paystackData.reference !== payment.reference) {
    throw Object.assign(
      new Error('Payment reference mismatch'),
      { statusCode: 400 }
    );
  }

  if (paystackData.status !== 'success') {
    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: [
            'failed',
            'abandoned',
            'reversed'
          ].includes(paystackData.status)
            ? paystackData.status
            : 'pending',
          gatewayResponse:
            paystackData.gateway_response || ''
        }
      }
    );

    return {
      credited: false,
      status: paystackData.status
    };
  }

  if (
    Number(paystackData.amount) !== expectedKobo
  ) {
    throw Object.assign(
      new Error(
        'Verified payment amount does not match the wallet top-up'
      ),
      { statusCode: 400 }
    );
  }

  if (
    String(paystackData.currency || 'NGN').toUpperCase() !==
    'NGN'
  ) {
    throw Object.assign(
      new Error('Unexpected payment currency'),
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
          balance: payment.amount
        },
        $push: {
          transactions: {
            type: 'credit',
            amount: payment.amount,
            description: 'Paystack wallet funding',
            reference: payment.reference,
            provider: 'paystack',
            status: 'success'
          }
        }
      },
      {
        returnDocument: 'after',
        upsert: false
      }
    );

  const existingWallet =
    wallet ||
    await Wallet.findOne({
      user: payment.user
    });

  if (!existingWallet) {
    throw new Error('Wallet not found');
  }

  await Payment.updateOne(
    { _id: payment._id },
    {
      $set: {
        status: 'success',
        channel: paystackData.channel || '',
        gatewayResponse:
          paystackData.gateway_response || '',
        paystackTransactionId:
          String(paystackData.id || ''),
        paidAt: paystackData.paid_at
          ? new Date(paystackData.paid_at)
          : new Date(),
        creditedAt: new Date()
      }
    }
  );

  return {
    credited: !!wallet,
    status: 'success',
    wallet: existingWallet
  };
}


/*
 * ---------------------------------------------------------
 * PAYSTACK WEBHOOK
 * ---------------------------------------------------------
 */

function validWebhookSignature(
  rawBody,
  signature
) {
  if (!rawBody || !signature) {
    return false;
  }

  const hash = crypto
    .createHmac('sha512', secret())
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'utf8'),
      Buffer.from(String(signature), 'utf8')
    );
  } catch {
    return false;
  }
}


/*
 * ---------------------------------------------------------
 * PLATFORM BANK TRANSFERS
 * ---------------------------------------------------------
 */

/*
 * Resolve a Nigerian bank account.
 *
 * This does NOT move money.
 * It only verifies that the account number belongs
 * to the supplied bank.
 */
async function resolveBankAccount({
  accountNumber,
  bankCode
}) {
  const account = String(accountNumber || '')
    .replace(/\s+/g, '')
    .trim();

  const code = String(bankCode || '')
    .trim();

  if (!/^\d{10}$/.test(account)) {
    throw Object.assign(
      new Error(
        'Bank account number must be exactly 10 digits'
      ),
      { statusCode: 400 }
    );
  }

  if (!code) {
    throw Object.assign(
      new Error('Bank code is required'),
      { statusCode: 400 }
    );
  }

  return request(
    `/bank/resolve?account_number=${encodeURIComponent(
      account
    )}&bank_code=${encodeURIComponent(code)}`,
    {
      method: 'GET'
    }
  );
}


/*
 * Create a Paystack transfer recipient.
 *
 * Recipient creation does NOT withdraw money.
 */
async function createTransferRecipient({
  accountName,
  accountNumber,
  bankCode,
  currency = 'NGN'
}) {
  if (!accountName) {
    throw Object.assign(
      new Error('Account name is required'),
      { statusCode: 400 }
    );
  }

  const account = String(accountNumber || '')
    .replace(/\s+/g, '');

  if (!/^\d{10}$/.test(account)) {
    throw Object.assign(
      new Error(
        'Bank account number must be exactly 10 digits'
      ),
      { statusCode: 400 }
    );
  }

  if (!bankCode) {
    throw Object.assign(
      new Error('Bank code is required'),
      { statusCode: 400 }
    );
  }

  return request('/transferrecipient', {
    method: 'POST',
    body: JSON.stringify({
      type: 'nuban',
      name: accountName,
      account_number: account,
      bank_code: bankCode,
      currency
    })
  });
}


/*
 * Initiate the actual Paystack transfer.
 *
 * Amount supplied here is in whole NGN.
 * Paystack receives kobo.
 */
async function initiateTransfer({
  amount,
  recipientCode,
  reason,
  reference
}) {
  const naira = Number(amount);

  if (
    !Number.isInteger(naira) ||
    naira <= 0
  ) {
    throw Object.assign(
      new Error(
        'Transfer amount must be a positive whole naira amount'
      ),
      { statusCode: 400 }
    );
  }

  if (!recipientCode) {
    throw Object.assign(
      new Error('Paystack transfer recipient is required'),
      { statusCode: 400 }
    );
  }

  const body = await request('/transfer', {
    method: 'POST',
    body: JSON.stringify({
      source: 'balance',
      amount: Math.round(naira * 100),
      recipient: recipientCode,
      reason:
        reason ||
        'Kaduna Only platform commission withdrawal',
      reference
    })
  });

  return body;
}


/*
 * Verify a Paystack transfer.
 */
async function verifyTransfer(reference) {
  return request(
    `/transfer/verify/${encodeURIComponent(reference)}`,
    {
      method: 'GET'
    }
  );
}


/*
 * Transfer reference generator.
 */
function newTransferReference() {
  return `KO-PLATFORM-WD-${Date.now()}-${crypto
    .randomBytes(5)
    .toString('hex')
    .toUpperCase()}`;
}


/*
 * Current Paystack mode.
 */
function mode() {
  const key = String(
    process.env.PAYSTACK_SECRET_KEY || ''
  );

  return key.startsWith('sk_live_')
    ? 'live'
    : key.startsWith('sk_test_')
      ? 'test'
      : 'unconfigured';
}


module.exports = {
  initializeWalletTopup,
  verifyReference,
  fulfillWalletTopup,

  validWebhookSignature,

  resolveBankAccount,
  createTransferRecipient,
  initiateTransfer,
  verifyTransfer,
  newTransferReference,

  mode
};