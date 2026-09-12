/* =========================================================
   KADUNA ONLY — PAYSTACK SERVICE (UPGRADED)
   =========================================================
   Features:
   - Strict API key validation (prefix + minimum length)
   - Automatic retry on 429 (rate-limit) with backoff
   - Timeout guard (30s) on every request
   - Structured errors (statusCode + paystackResponse)
   - Idempotent wallet top-up fulfilment
   - Bank list with TTL cache + pagination safety
   - Recipient creation reuse support
   - Webhook HMAC verification (timing-safe)
   ========================================================= */

const crypto = require('crypto');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');

/* =========================================================
   CONSTANTS
   ========================================================= */

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const REQUEST_TIMEOUT_MS = 30000;
const RATE_LIMIT_RETRY_DELAY_MS = 1500;
const MAX_BANK_PAGES = 10;
const BANK_PAGE_SIZE = 100;
const BANK_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MIN_WALLET_FUNDING = 100;

/* =========================================================
   KEY HELPERS
   ========================================================= */

/**
 * Returns the Paystack secret key after validating prefix + length.
 * Throws a 503 if missing or malformed.
 */
function secret() {
  const key = String(process.env.PAYSTACK_SECRET_KEY || '').trim();

  if (!key) {
    throw Object.assign(
      new Error('Paystack is not configured on the server'),
      { statusCode: 503 }
    );
  }

  // Prefix + length check (real keys are ~48+ chars after "sk_test_"/"sk_live_")
  if (!/^sk_(test|live)_[A-Za-z0-9]{30,}$/.test(key)) {
    throw Object.assign(
      new Error(
        'PAYSTACK_SECRET_KEY is invalid or truncated. Paste the full key from the Paystack dashboard.'
      ),
      { statusCode: 503 }
    );
  }

  return key;
}

/**
 * Returns "live" | "test" | "unconfigured".
 */
function mode() {
  const key = String(process.env.PAYSTACK_SECRET_KEY || '').trim();

  if (key.startsWith('sk_live_')) return 'live';
  if (key.startsWith('sk_test_')) return 'test';
  return 'unconfigured';
}

/* =========================================================
   ERROR HELPERS
   ========================================================= */

/**
 * Normalises Paystack HTTP status into an internal statusCode.
 */
function normaliseStatus(httpStatus) {
  if (httpStatus === 400) return 400;
  if (httpStatus === 401 || httpStatus === 403) return 502;
  if (httpStatus === 404) return 404;
  if (httpStatus === 409) return 409;
  if (httpStatus === 422) return 422;
  if (httpStatus === 429) return 429;
  if (httpStatus >= 500) return 502;
  return 502;
}

/**
 * Creates a rich error object with Paystack response attached.
 */
function paystackError(message, statusCode, paystackResponse) {
  return Object.assign(new Error(message), {
    statusCode,
    paystackResponse,
  });
}

/* =========================================================
   REQUEST (with timeout + 429 retry)
   ========================================================= */

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        Authorization: `Bearer ${secret()}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const raw = await response.text();
    let body = {};

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {
        status: false,
        message: 'Invalid response from Paystack',
      };
    }

    /* -------------------- 429 RATE LIMIT RETRY -------------------- */

    if (response.status === 429 && !options.__retried) {
      clearTimeout(timeout);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_DELAY_MS));
      return request(path, { ...options, __retried: true });
    }

    /* -------------------- ERROR HANDLING -------------------- */

    if (!response.ok || !body.status) {
      throw paystackError(
        body.message || `Paystack request failed (${response.status})`,
        normaliseStatus(response.status),
        body
      );
    }

    return body;
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw Object.assign(
        new Error('Paystack request timed out. Please try again.'),
        { statusCode: 504 }
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   REFERENCE GENERATORS
   ========================================================= */

function newReference() {
  return `KO-WALLET-${Date.now()}-${crypto
    .randomBytes(5)
    .toString('hex')
    .toUpperCase()}`;
}

function newTransferReference() {
  return `KO-TRANSFER-${Date.now()}-${crypto
    .randomBytes(5)
    .toString('hex')
    .toUpperCase()}`;
}

/* =========================================================
   WALLET TOP-UP
   ========================================================= */

async function initializeWalletTopup({ user, amount }) {
  const email = String(user?.email || '').trim().toLowerCase();

  if (!email) {
    throw Object.assign(
      new Error('Add an email address before funding your wallet'),
      { statusCode: 400 }
    );
  }

  const numeric = Number(amount);

  if (!Number.isInteger(numeric) || numeric < MIN_WALLET_FUNDING) {
    throw Object.assign(
      new Error(`Minimum wallet funding amount is ₦${MIN_WALLET_FUNDING}`),
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
      amount: String(numeric * 100), // kobo
      currency: 'NGN',
      reference,
      callback_url: `${callbackBase}/wallet/paystack/callback`,
      metadata: {
        purpose: 'wallet_topup',
        userId: String(user._id),
        phone: user.phone || '',
      },
    }),
  });

  await Payment.create({
    user: user._id,
    reference,
    accessCode: body.data.access_code,
    amount: numeric,
    currency: 'NGN',
    status: 'initialized',
    metadata: { email, phone: user.phone || '' },
  });

  return {
    authorizationUrl: body.data.authorization_url,
    accessCode: body.data.access_code,
    reference,
  };
}

/* =========================================================
   VERIFY REFERENCE
   ========================================================= */

async function verifyReference(reference) {
  const clean = String(reference || '').trim();

  if (!clean) {
    throw Object.assign(
      new Error('Payment reference is required'),
      { statusCode: 400 }
    );
  }

  return request(`/transaction/verify/${encodeURIComponent(clean)}`, {
    method: 'GET',
  });
}

/* =========================================================
   FULFILL WALLET TOP-UP (IDEMPOTENT)
   ========================================================= */

async function fulfillWalletTopup(payment, data) {
  if (!payment) {
    throw Object.assign(new Error('Payment record not found'), {
      statusCode: 404,
    });
  }

  if (!data) {
    throw Object.assign(
      new Error('Paystack transaction data is required'),
      { statusCode: 400 }
    );
  }

  if (String(data.reference) !== String(payment.reference)) {
    throw Object.assign(new Error('Payment reference mismatch'), {
      statusCode: 400,
    });
  }

  /* --- Non-success statuses --- */

  if (data.status !== 'success') {
    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: ['failed', 'abandoned', 'reversed'].includes(data.status)
            ? data.status
            : 'pending',
          gatewayResponse: data.gateway_response || '',
        },
      }
    );

    return { credited: false, status: data.status };
  }

  /* --- Amount integrity check --- */

  if (Number(data.amount) !== Math.round(Number(payment.amount) * 100)) {
    throw Object.assign(
      new Error('Verified payment amount does not match the wallet top-up'),
      { statusCode: 400 }
    );
  }

  /* --- Currency check --- */

  if (String(data.currency || 'NGN').toUpperCase() !== 'NGN') {
    throw Object.assign(new Error('Unexpected payment currency'), {
      statusCode: 400,
    });
  }

  /* --- Atomic wallet credit (idempotent via $ne filter) --- */

  const wallet = await Wallet.findOneAndUpdate(
    {
      user: payment.user,
      'transactions.reference': { $ne: payment.reference },
    },
    {
      $inc: { balance: payment.amount },
      $push: {
        transactions: {
          type: 'credit',
          amount: payment.amount,
          description: 'Paystack wallet funding',
          reference: payment.reference,
          provider: 'paystack',
          status: 'success',
        },
      },
    },
    { new: true }
  );

  const existing = wallet || (await Wallet.findOne({ user: payment.user }));

  if (!existing) {
    throw new Error('Wallet not found');
  }

  /* --- Mark payment as success --- */

  await Payment.updateOne(
    { _id: payment._id },
    {
      $set: {
        status: 'success',
        channel: data.channel || '',
        gatewayResponse: data.gateway_response || '',
        paystackTransactionId: String(data.id || ''),
        paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
        creditedAt: new Date(),
      },
    }
  );

  return {
    credited: !!wallet,
    status: 'success',
    wallet: existing,
  };
}

/* =========================================================
   WEBHOOK SIGNATURE (timing-safe)
   ========================================================= */

function validWebhookSignature(rawBody, signature) {
  if (rawBody == null || !signature) return false;

  const raw = Buffer.isBuffer(rawBody)
    ? rawBody
    : typeof rawBody === 'string'
    ? Buffer.from(rawBody)
    : null;

  if (!raw) return false;

  const hash = crypto
    .createHmac('sha512', secret())
    .update(raw)
    .digest('hex');

  const a = Buffer.from(hash);
  const b = Buffer.from(String(signature).trim().toLowerCase());

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* =========================================================
   BANK LIST (TTL cache + pagination safety)
   ========================================================= */

let bankCache = null;
let bankCacheExpiresAt = 0;

async function listNigerianBanks({ forceRefresh = false } = {}) {
  /* --- Return cached --- */
  if (!forceRefresh && bankCache && Date.now() < bankCacheExpiresAt) {
    return { status: true, data: bankCache };
  }

  const all = [];

  for (let page = 1; page <= MAX_BANK_PAGES; page++) {
    const r = await request(
      `/bank?country=nigeria&currency=NGN&type=nuban&perPage=${BANK_PAGE_SIZE}&page=${page}`,
      { method: 'GET' }
    );

    const rows = Array.isArray(r.data) ? r.data : [];
    all.push(...rows);

    /* Safety: stop if fewer rows than page size, or last page reached */
    if (rows.length < BANK_PAGE_SIZE || page >= MAX_BANK_PAGES) break;
  }

  /* --- Deduplicate by (code + name) --- */
  const map = new Map();

  for (const b of all) {
    if (!b || b.active === false || b.is_deleted === true) continue;

    const name = String(b.name || '').trim();
    const code = String(b.code || '').trim();

    if (name && code) {
      map.set(`${code}|${name}`.toLowerCase(), {
        name,
        code,
        slug: b.slug || '',
        type: b.type || 'nuban',
        country: 'Nigeria',
        currency: 'NGN',
        active: true,
      });
    }
  }

  bankCache = [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  bankCacheExpiresAt = Date.now() + BANK_CACHE_TTL_MS;

  return { status: true, data: bankCache };
}

/* =========================================================
   RESOLVE BANK ACCOUNT
   ========================================================= */

async function resolveBankAccount({ accountNumber, bankCode }) {
  const account = String(accountNumber || '').replace(/\s+/g, '');
  const code = String(bankCode || '').trim();

  if (!/^\d{10}$/.test(account)) {
    throw Object.assign(
      new Error('Account number must be exactly 10 digits'),
      { statusCode: 400 }
    );
  }

  if (!code) {
    throw Object.assign(new Error('Bank selection is required'), {
      statusCode: 400,
    });
  }

  return request(
    `/bank/resolve?account_number=${encodeURIComponent(
      account
    )}&bank_code=${encodeURIComponent(code)}`,
    { method: 'GET' }
  );
}

/* =========================================================
   CREATE TRANSFER RECIPIENT
   ========================================================= */

async function createTransferRecipient({
  accountName,
  accountNumber,
  bankCode,
  currency = 'NGN',
}) {
  const name = String(accountName || '').trim();
  const account = String(accountNumber || '').replace(/\s+/g, '');
  const code = String(bankCode || '').trim();

  if (!name) {
    throw Object.assign(new Error('Account name is required'), {
      statusCode: 400,
    });
  }

  if (!/^\d{10}$/.test(account)) {
    throw Object.assign(
      new Error('Account number must be exactly 10 digits'),
      { statusCode: 400 }
    );
  }

  if (!code) {
    throw Object.assign(new Error('Bank selection is required'), {
      statusCode: 400,
    });
  }

  return request('/transferrecipient', {
    method: 'POST',
    body: JSON.stringify({
      type: 'nuban',
      name,
      account_number: account,
      bank_code: code,
      currency: String(currency).toUpperCase(),
    }),
  });
}

/* =========================================================
   INITIATE TRANSFER
   ========================================================= */

async function initiateTransfer({
  amount,
  recipientCode,
  reference,
  reason = 'Kaduna Only wallet withdrawal',
}) {
  const numeric = Number(amount);

  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw Object.assign(
      new Error('Transfer amount must be a positive whole naira amount'),
      { statusCode: 400 }
    );
  }

  if (!recipientCode || !reference) {
    throw Object.assign(
      new Error('Transfer recipient and reference are required'),
      { statusCode: 400 }
    );
  }

  return request('/transfer', {
    method: 'POST',
    body: JSON.stringify({
      source: 'balance',
      amount: numeric * 100, // kobo
      recipient: recipientCode,
      reference,
      reason,
    }),
  });
}

/* =========================================================
   VERIFY TRANSFER
   ========================================================= */

async function verifyTransfer(reference) {
  const clean = String(reference || '').trim();

  if (!clean) {
    throw Object.assign(new Error('Transfer reference is required'), {
      statusCode: 400,
    });
  }

  return request(`/transfer/verify/${encodeURIComponent(clean)}`, {
    method: 'GET',
  });
}

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  initializeWalletTopup,
  verifyReference,
  fulfillWalletTopup,
  validWebhookSignature,
  listNigerianBanks,
  resolveBankAccount,
  createTransferRecipient,
  initiateTransfer,
  verifyTransfer,
  newTransferReference,
  mode,
};