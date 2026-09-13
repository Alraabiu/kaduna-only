const crypto = require('crypto');
const DriverProfile = require('../models/DriverProfile');
const Wallet = require('../models/Wallet');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const { sendToUser } = require('../services/pushService');

const {
  listNigerianBanks,
  resolveBankAccount,
  createTransferRecipient,
  initiateTransfer,
  verifyTransfer,
  newTransferReference,
} = require('../services/paystackService');

/* =========================================================
   CONSTANTS
   ========================================================= */

const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

/* =========================================================
   HELPERS
   ========================================================= */

const minimum = () =>
  Math.max(100, Number(process.env.WITHDRAWAL_MINIMUM || 100));

const clean = (value) => String(value || '').trim();

const ref = () =>
  `WD-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(4)
    .toString('hex')
    .toUpperCase()}`;

/**
 * Builds a safe, structured debug object for the client.
 * Only included when NODE_ENV !== 'production'.
 */
function debugPayload(error) {
  if (IS_PRODUCTION) return undefined;
  return {
    message: error?.message,
    statusCode: error?.statusCode,
    paystackResponse: error?.paystackResponse,
  };
}

/**
 * Extracts a compact, human-readable Paystack error message.
 */
function paystackErrorMessage(error) {
  const psMessage =
    error?.paystackResponse?.message ||
    error?.paystackResponse?.data?.message;

  return (
    psMessage ||
    error?.message ||
    'Bank transfer failed.'
  );
}

/**
 * Determines if a Paystack transfer status is terminal-success.
 */
function isTransferSuccess(status) {
  return ['success', 'successful', 'completed'].includes(
    String(status || '').toLowerCase()
  );
}

/**
 * Determines if a Paystack transfer is still pending/processing.
 */
function isTransferPending(status) {
  return [
    'pending',
    'processing',
    'queued',
    'ongoing',
    'otp',
    'received',
  ].includes(String(status || '').toLowerCase());
}

/* =========================================================
   VALIDATE BANK PAYLOAD
   ========================================================= */

function validateBank(body = {}) {
  const bankName = clean(body.bankName);
  const bankCode = clean(body.bankCode);
  const accountName = clean(body.accountName);
  const accountNumber = clean(body.accountNumber).replace(/\s+/g, '');

  if (bankName.length < 2) return { error: 'Bank name is required' };
  if (!bankCode) return { error: 'Bank code is required' };
  if (accountName.length < 2) return { error: 'Account name is required' };
  if (!/^\d{10}$/.test(accountNumber)) {
    return { error: 'Account number must be exactly 10 digits' };
  }

  return {
    bankName,
    bankCode,
    accountName,
    accountNumber,
    recipientCode: clean(body.recipientCode) || undefined,
  };
}

/* =========================================================
   GENERIC USER BANK ACCOUNT
   ========================================================= */

async function getGenericBankAccount(req, res, next) {
  try {
    const withdrawal = await Withdrawal.findOne({
      $or: [{ user: req.user._id }, { driver: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .select('bank');

    res.json({
      success: true,
      data: {
        bankAccount: withdrawal?.bank || null,
        minimumWithdrawal: minimum(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   LIST NIGERIAN BANKS
   ========================================================= */

async function listBanks(req, res, next) {
  try {
    const result = await listNigerianBanks();
    res.json({
      success: true,
      data: { banks: result.data || [] },
    });
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   VERIFY BANK ACCOUNT
   ========================================================= */

async function verifyAccount(req, res, next) {
  try {
    const bankCode = clean(req.body.bankCode);
    const accountNumber = clean(req.body.accountNumber).replace(/\s+/g, '');

    if (!bankCode) {
      return res.status(400).json({
        success: false,
        message: 'Bank selection is required',
      });
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Account number must be exactly 10 digits',
      });
    }

    const result = await resolveBankAccount({ accountNumber, bankCode });
    const accountName = clean(result?.data?.account_name);

    if (!accountName) {
      return res.status(422).json({
        success: false,
        message: 'Unable to verify this bank account',
      });
    }

    res.json({
      success: true,
      message: 'Bank account verified',
      data: { accountName, accountNumber, bankCode },
    });
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   SAVE GENERIC USER BANK ACCOUNT
   ========================================================= */

async function saveGenericBankAccount(req, res, next) {
  try {
    const bank = validateBank(req.body);

    if (bank.error) {
      return res.status(400).json({ success: false, message: bank.error });
    }

    /* Confirm account with Paystack before saving. */
    const verified = await resolveBankAccount({
      accountNumber: bank.accountNumber,
      bankCode: bank.bankCode,
    });

    const verifiedName = clean(verified?.data?.account_name);

    if (!verifiedName) {
      return res.status(422).json({
        success: false,
        message: 'Bank account could not be verified',
      });
    }

    /* Create (or reuse) a Paystack transfer recipient. */
    let recipientCode = bank.recipientCode;

    if (!recipientCode) {
      const recipient = await createTransferRecipient({
        accountName: verifiedName,
        accountNumber: bank.accountNumber,
        bankCode: bank.bankCode,
        currency: 'NGN',
      });
      recipientCode = recipient?.data?.recipient_code || '';
    }

    const bankSnapshot = {
      bankName: bank.bankName,
      bankCode: bank.bankCode,
      accountName: verifiedName,
      accountNumber: bank.accountNumber,
      recipientCode,
    };

    res.json({
      success: true,
      message: 'Bank account verified and ready for withdrawal',
      data: { bankAccount: bankSnapshot },
    });
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   GENERIC WALLET WITHDRAWAL  (the important one)
   ========================================================= */

async function requestWalletWithdrawal(req, res, next) {
  let withdrawal = null;
  let transferInitiated = false;
  let transferReference = null;

  try {
    const amount = Number(req.body.amount);
    const pin = clean(req.body.pin);
    const bank = validateBank(req.body);

    /* -------------------- BASIC VALIDATION -------------------- */

    if (!Number.isInteger(amount) || amount < minimum()) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal is ₦${minimum().toLocaleString('en-NG')}`,
      });
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: 'Valid wallet PIN is required',
      });
    }

    if (bank.error) {
      return res.status(400).json({ success: false, message: bank.error });
    }

    /* -------------------- LOAD USER -------------------- */

    const user = await User.findById(req.user._id).select('+walletPinHash');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your account is not active',
      });
    }

    if (!user.walletPinHash) {
      return res.status(400).json({
        success: false,
        message: 'Set your wallet PIN before withdrawing',
      });
    }

    const pinValid = await bcrypt.compare(pin, user.walletPinHash);

    if (!pinValid) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect wallet PIN',
      });
    }

    /* -------------------- DUPLICATE WITHDRAWAL GUARD --------------------
       Moved BEFORE Paystack recipient creation so we don't hit Paystack
       if the user already has a pending withdrawal.
    ------------------------------------------------------------------- */

    const existing = await Withdrawal.findOne({
      $or: [{ user: req.user._id }, { driver: req.user._id }],
      status: { $in: ['pending', 'approved', 'processing'] },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'You already have a withdrawal awaiting completion',
      });
    }

    /* -------------------- VERIFY BANK AGAIN -------------------- */

    const verified = await resolveBankAccount({
      accountNumber: bank.accountNumber,
      bankCode: bank.bankCode,
    });

    const verifiedName = clean(verified?.data?.account_name);

    if (!verifiedName) {
      return res.status(422).json({
        success: false,
        message: 'Bank account could not be verified',
      });
    }

    /* -------------------- CREATE / REUSE PAYSTACK RECIPIENT -------------------- */

    let recipientCode = bank.recipientCode;

    if (!recipientCode) {
      const recipient = await createTransferRecipient({
        accountName: verifiedName,
        accountNumber: bank.accountNumber,
        bankCode: bank.bankCode,
        currency: 'NGN',
      });
      recipientCode = recipient?.data?.recipient_code;
    }

    if (!recipientCode) {
      return res.status(502).json({
        success: false,
        message: 'Paystack did not return a transfer recipient',
      });
    }

    /* -------------------- CREATE WITHDRAWAL RECORD -------------------- */

    const reference = ref();

    withdrawal = await Withdrawal.create({
      reference,
      user: req.user._id,
      amount,
      bank: {
        bankName: bank.bankName,
        bankCode: bank.bankCode,
        accountName: verifiedName,
        accountNumber: bank.accountNumber,
        recipientCode,
      },
      status: 'pending',
      fundsReservedAt: new Date(),
    });

    /* -------------------- RESERVE WALLET FUNDS -------------------- */

    const wallet = await Wallet.findOneAndUpdate(
      {
        user: req.user._id,
        balance: { $gte: amount },
        'transactions.reference': { $ne: reference },
      },
      {
        $inc: { balance: -amount },
        $push: {
          transactions: {
            type: 'debit',
            amount,
            description: 'Bank withdrawal',
            reference,
            provider: 'bank_withdrawal',
            status: 'pending',
          },
        },
      },
      { new: true }
    );

    if (!wallet) {
      await Withdrawal.deleteOne({ _id: withdrawal._id });
      return res.status(402).json({
        success: false,
        message: 'Insufficient available wallet balance',
      });
    }

    /* -------------------- AUTOMATIC PAYSTACK TRANSFER -------------------- */

    transferReference = newTransferReference();

    await Withdrawal.updateOne(
      { _id: withdrawal._id },
      {
        $set: {
          status: 'processing',
          processingAt: new Date(),
          transferReference,
        },
      }
    );

    try {
      const transfer = await initiateTransfer({
        amount,
        recipientCode,
        reference: transferReference,
        reason: `Kaduna Only wallet withdrawal ${reference}`,
      });

      transferInitiated = true;

      const transferId = transfer?.data?.id;

      await Withdrawal.updateOne(
        { _id: withdrawal._id },
        {
          $set: {
            paystackTransferId: transferId ? String(transferId) : '',
            paystackStatus: transfer?.data?.status || 'pending',
          },
        }
      );

      /* --- Verify transfer status --- */

      let verifiedTransfer = null;

      try {
        verifiedTransfer = await verifyTransfer(transferReference);
      } catch (verificationError) {
        console.log(
          '[WITHDRAWAL VERIFY]',
          verificationError?.message,
          verificationError?.paystackResponse || ''
        );
      }

      const transferStatus = String(
        verifiedTransfer?.data?.status ||
          transfer?.data?.status ||
          ''
      ).toLowerCase();

      if (isTransferSuccess(transferStatus)) {
        await Withdrawal.updateOne(
          { _id: withdrawal._id },
          {
            $set: {
              status: 'paid',
              paidAt: new Date(),
              paystackStatus: transferStatus,
            },
          }
        );

        await Wallet.updateOne(
          {
            user: req.user._id,
            'transactions.reference': reference,
          },
          { $set: { 'transactions.$.status': 'paid' } }
        );

        withdrawal.status = 'paid';
      } else if (isTransferPending(transferStatus)) {
        // Still processing — leave as processing, admin or webhook resolves.
        withdrawal.status = 'processing';
      } else if (transferStatus) {
        // Paystack returned a non-success, non-pending status.
        throw Object.assign(
          new Error(`Paystack transfer status: ${transferStatus}`),
          {
            paystackResponse: verifiedTransfer?.data || transfer?.data,
            statusCode: 502,
          }
        );
      }
    } catch (transferError) {

      /* =========================================================
         TRANSFER FAILED (or non-success status)
         =========================================================

         ⚠️ CRITICAL FIX:
         Before refunding, verify with Paystack whether the transfer
         was actually accepted. If Paystack says "pending" or "success",
         DO NOT refund — otherwise the user gets both the refund AND
         the bank credit (double-pay).
      ========================================================= */

      console.error('[WITHDRAWAL TRANSFER ERROR FULL]', JSON.stringify({
  withdrawalId: String(withdrawal._id),
  reference,
  transferReference,
  transferInitiated,
  amount,
  message: transferError?.message,
  statusCode: transferError?.statusCode,
  paystackResponse: transferError?.paystackResponse,
  error: transferError
}, null, 2));

      let safeToRefund = !transferInitiated;
      let paystackStatus = 'unknown';

      if (transferInitiated && transferReference) {
        try {
          const check = await verifyTransfer(transferReference);
          paystackStatus = String(check?.data?.status || '').toLowerCase();

          if (isTransferSuccess(paystackStatus) || isTransferPending(paystackStatus)) {
            // Paystack has it — do NOT refund.
            safeToRefund = false;
          } else {
            // Paystack explicitly rejected/failed it — safe to refund.
            safeToRefund = true;
          }
        } catch (verifyErr) {
          // We cannot verify → safest is to NOT refund automatically.
          console.error('[WITHDRAWAL VERIFY ON FAILURE]', verifyErr?.message);
          safeToRefund = false;
        }
      }

      if (safeToRefund) {
        /* --- Refund --- */

        const refundReference = `WITHDRAWAL-REFUND-${reference}`;

        await Wallet.findOneAndUpdate(
          {
            user: req.user._id,
            'transactions.reference': { $ne: refundReference },
          },
          {
            $inc: { balance: amount },
            $push: {
              transactions: {
                type: 'credit',
                amount,
                description: 'Failed bank withdrawal refund',
                reference: refundReference,
                provider: 'bank_withdrawal',
                status: 'refunded',
              },
            },
          }
        );

        await Wallet.updateOne(
          {
            user: req.user._id,
            'transactions.reference': reference,
          },
          { $set: { 'transactions.$.status': 'refunded' } }
        );

        await Withdrawal.updateOne(
          { _id: withdrawal._id },
          {
            $set: {
              status: 'failed',
              paystackStatus: paystackStatus === 'unknown' ? 'failed' : paystackStatus,
              adminNote: paystackErrorMessage(transferError),
            },
          }
        );

        return res.status(502).json({
          success: false,
          message:
            'Bank transfer failed. Your wallet funds have been returned.',
          debug: debugPayload(transferError),
        });
      }

      /* --- Cannot safely refund → flag for admin review --- */

      await Withdrawal.updateOne(
        { _id: withdrawal._id },
        {
          $set: {
            status: 'needs_review',
            paystackStatus: paystackStatus || 'unknown',
            adminNote:
              paystackErrorMessage(transferError) +
              ' — refund skipped; Paystack may still settle.',
          },
        }
      );

      return res.status(502).json({
        success: false,
        message:
          'We could not confirm your bank transfer. Our team will review your account within 24 hours.',
        debug: debugPayload(transferError),
      });
    }

    /* -------------------- RELOAD FINAL STATE -------------------- */

    const updated = await Withdrawal.findById(withdrawal._id);

    /* -------------------- NOTIFICATION -------------------- */

    sendToUser(req.user._id, {
      title:
        updated?.status === 'paid'
          ? 'Withdrawal successful'
          : 'Withdrawal processing',
      body:
        updated?.status === 'paid'
          ? `₦${amount.toLocaleString('en-NG')} has been sent to your bank account.`
          : `Your ₦${amount.toLocaleString('en-NG')} bank withdrawal is being processed.`,
      url: '/wallet',
      tag: `withdrawal-${reference}`,
      data: {
        type: 'WITHDRAWAL_STATUS',
        withdrawalId: String(withdrawal._id),
      },
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message:
        updated?.status === 'paid'
          ? 'Withdrawal successful'
          : 'Withdrawal submitted and is being processed',
      data: { withdrawal: updated, wallet },
    });
  } catch (error) {
    /* -------------------- OUTER CLEANUP -------------------- */

    console.error('[WITHDRAWAL ERROR]', error);

    if (withdrawal) {
      try {
        const current = await Withdrawal.findById(withdrawal._id);
        if (current && ['pending', 'approved'].includes(current.status)) {
          await Withdrawal.deleteOne({ _id: withdrawal._id });
        }
      } catch {}
    }

    next(error);
  }
}

/* =========================================================
   GENERIC USER WITHDRAWAL HISTORY
   ========================================================= */

async function userList(req, res, next) {
  try {
    const withdrawals = await Withdrawal.find({
      $or: [{ user: req.user._id }, { driver: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      data: {
        withdrawals,
        minimumWithdrawal: minimum(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   LEGACY DRIVER BANK ACCOUNT
   ========================================================= */

async function getBankAccount(req, res, next) {
  try {
    const p = await DriverProfile.findOne({ user: req.user._id }).select(
      'payoutAccount verificationStatus'
    );

    if (!p) {
      return res.status(404).json({
        success: false,
        message: 'Driver profile not found',
      });
    }

    res.json({
      success: true,
      data: {
        bankAccount: p.payoutAccount || null,
        minimumWithdrawal: minimum(),
      },
    });
  } catch (e) {
    next(e);
  }
}

/* =========================================================
   LEGACY DRIVER BANK ACCOUNT SAVE
   ========================================================= */

async function saveBankAccount(req, res, next) {
  try {
    const bank = validateBank(req.body);

    if (bank.error) {
      return res.status(400).json({ success: false, message: bank.error });
    }

    const p = await DriverProfile.findOneAndUpdate(
      { user: req.user._id },
      { $set: { payoutAccount: bank } },
      { new: true, runValidators: true }
    ).select('payoutAccount');

    if (!p) {
      return res.status(404).json({
        success: false,
        message: 'Driver profile not found',
      });
    }

    res.json({
      success: true,
      message: 'Withdrawal bank account saved',
      data: { bankAccount: p.payoutAccount },
    });
  } catch (e) {
    next(e);
  }
}

/* =========================================================
   LEGACY DRIVER WITHDRAWAL LIST
   ========================================================= */

async function driverList(req, res, next) {
  try {
    const items = await Withdrawal.find({ driver: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      data: {
        withdrawals: items,
        minimumWithdrawal: minimum(),
      },
    });
  } catch (e) {
    next(e);
  }
}

/* =========================================================
   LEGACY DRIVER WITHDRAWAL REQUEST
   ========================================================= */

async function requestWithdrawal(req, res, next) {
  let withdrawal = null;

  try {
    const amount = Number(req.body.amount);

    if (!Number.isInteger(amount) || amount < minimum()) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal is ₦${minimum().toLocaleString('en-NG')}`,
      });
    }

    const p = await DriverProfile.findOne({ user: req.user._id }).select(
      'payoutAccount verificationStatus'
    );

    if (
      !p ||
      String(p.verificationStatus).toLowerCase() !== 'approved'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only approved drivers can withdraw earnings',
      });
    }

    const bank = validateBank(p.payoutAccount || {});

    if (bank.error) {
      return res.status(400).json({
        success: false,
        message: 'Save a valid withdrawal bank account first',
      });
    }

    const pending = await Withdrawal.exists({
      driver: req.user._id,
      status: { $in: ['pending', 'approved'] },
    });

    if (pending) {
      return res.status(409).json({
        success: false,
        message: 'You already have a withdrawal awaiting completion',
      });
    }

    const reference = ref();

    withdrawal = await Withdrawal.create({
      reference,
      driver: req.user._id,
      user: req.user._id,
      amount,
      bank,
      status: 'pending',
      fundsReservedAt: new Date(),
    });

    const wallet = await Wallet.findOneAndUpdate(
      {
        user: req.user._id,
        balance: { $gte: amount },
        'transactions.reference': { $ne: reference },
      },
      {
        $inc: { balance: -amount },
        $push: {
          transactions: {
            type: 'debit',
            amount,
            description: 'Driver bank withdrawal',
            reference,
            provider: 'bank_withdrawal',
            status: 'pending',
          },
        },
      },
      { new: true }
    );

    if (!wallet) {
      await Withdrawal.deleteOne({ _id: withdrawal._id });
      return res.status(402).json({
        success: false,
        message: 'Insufficient available wallet balance',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted',
      data: { withdrawal, wallet },
    });
  } catch (e) {
    if (withdrawal) {
      try {
        await Withdrawal.deleteOne({
          _id: withdrawal._id,
          status: 'pending',
        });
      } catch {}
    }
    next(e);
  }
}

/* =========================================================
   ADMIN WITHDRAWAL LIST
   ========================================================= */

async function adminList(req, res, next) {
  try {
    const q = {};

    if (
      [
        'pending',
        'approved',
        'processing',
        'paid',
        'rejected',
        'failed',
        'needs_review',
      ].includes(req.query.status)
    ) {
      q.status = req.query.status;
    }

    const items = await Withdrawal.find(q)
      .populate('user', 'fullName phone email role status')
      .populate('driver', 'fullName phone email role status')
      .populate('reviewedBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(250);

    const summary = await Withdrawal.aggregate([
      {
        $group: {
          _id: '$status',
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      data: { withdrawals: items, summary },
    });
  } catch (e) {
    next(e);
  }
}

/* =========================================================
   ADMIN APPROVE
   ========================================================= */

async function approve(req, res, next) {
  try {
    const w = await Withdrawal.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      {
        $set: {
          status: 'approved',
          approvedAt: new Date(),
          reviewedBy: req.user._id,
          adminNote: clean(req.body.adminNote),
        },
      },
      { new: true }
    )
      .populate('user', 'fullName phone email role')
      .populate('driver', 'fullName phone email role');

    if (!w) {
      return res.status(409).json({
        success: false,
        message: 'Withdrawal is no longer pending',
      });
    }

    const ownerId = w.user?._id || w.driver?._id;

    await Wallet.updateOne(
      { user: ownerId, 'transactions.reference': w.reference },
      { $set: { 'transactions.$.status': 'approved' } }
    );

    sendToUser(ownerId, {
      title: 'Withdrawal approved',
      body: `Your ₦${w.amount.toLocaleString('en-NG')} withdrawal was approved.`,
      url: '/wallet',
      tag: `withdrawal-approved-${w._id}`,
      data: { type: 'WITHDRAWAL_APPROVED', withdrawalId: w._id },
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Withdrawal approved',
      data: { withdrawal: w },
    });
  } catch (e) {
    next(e);
  }
}

/* =========================================================
   ADMIN MARK PAID
   ========================================================= */

async function markPaid(req, res, next) {
  try {
    const transferReference = clean(req.body.transferReference);

    if (transferReference.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Enter the bank transfer/reference number',
      });
    }

    const w = await Withdrawal.findOneAndUpdate(
      { _id: req.params.id, status: 'approved' },
      {
        $set: {
          status: 'paid',
          paidAt: new Date(),
          transferReference,
          reviewedBy: req.user._id,
          adminNote: clean(req.body.adminNote),
        },
      },
      { new: true }
    )
      .populate('user', 'fullName phone email role')
      .populate('driver', 'fullName phone email role');

    if (!w) {
      return res.status(409).json({
        success: false,
        message: 'Withdrawal must be approved before it can be marked paid',
      });
    }

    const ownerId = w.user?._id || w.driver?._id;

    await Wallet.updateOne(
      { user: ownerId, 'transactions.reference': w.reference },
      { $set: { 'transactions.$.status': 'paid' } }
    );

    sendToUser(ownerId, {
      title: 'Withdrawal paid',
      body: `₦${w.amount.toLocaleString('en-NG')} has been marked paid to your saved bank account.`,
      url: '/wallet',
      tag: `withdrawal-paid-${w._id}`,
      data: { type: 'WITHDRAWAL_PAID', withdrawalId: w._id },
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Withdrawal marked paid',
      data: { withdrawal: w },
    });
  } catch (e) {
    next(e);
  }
}

/* =========================================================
   ADMIN REJECT + REFUND
   ========================================================= */

async function reject(req, res, next) {
  try {
    const w = await Withdrawal.findOne({
      _id: req.params.id,
      status: { $in: ['pending', 'approved', 'needs_review'] },
    })
      .populate('user', 'fullName phone email role')
      .populate('driver', 'fullName phone email role');

    if (!w) {
      return res.status(409).json({
        success: false,
        message: 'Withdrawal is no longer available',
      });
    }

    w.status = 'rejected';
    w.rejectedAt = new Date();
    w.reviewedBy = req.user._id;
    w.adminNote = clean(req.body.adminNote) || 'Withdrawal rejected by admin';

    await w.save();

    const ownerId = w.user?._id || w.driver?._id;
    const refundReference = `WITHDRAWAL-REFUND-${w.reference}`;

    const wallet = await Wallet.findOneAndUpdate(
      {
        user: ownerId,
        'transactions.reference': { $ne: refundReference },
      },
      {
        $inc: { balance: w.amount },
        $push: {
          transactions: {
            type: 'credit',
            amount: w.amount,
            description: 'Rejected withdrawal refund',
            reference: refundReference,
            provider: 'bank_withdrawal',
            status: 'refunded',
          },
        },
      },
      { new: true }
    );

    if (wallet) {
      w.refundedAt = new Date();
      await w.save();
    }

    await Wallet.updateOne(
      { user: ownerId, 'transactions.reference': w.reference },
      { $set: { 'transactions.$.status': 'rejected' } }
    );

    sendToUser(ownerId, {
      title: 'Withdrawal returned',
      body: `Your ₦${w.amount.toLocaleString('en-NG')} withdrawal was rejected and returned to your wallet.`,
      url: '/wallet',
      tag: `withdrawal-rejected-${w._id}`,
      data: { type: 'WITHDRAWAL_REJECTED', withdrawalId: w._id },
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Withdrawal rejected and funds returned',
      data: { withdrawal: w },
    });
  } catch (e) {
    next(e);
  }
}

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  listBanks,
  verifyAccount,
  getBankAccount: getGenericBankAccount,
  saveBankAccount: saveGenericBankAccount,
  requestWalletWithdrawal,
  userList,
  driverList,
  requestWithdrawal,
  adminList,
  approve,
  markPaid,
  reject,
};