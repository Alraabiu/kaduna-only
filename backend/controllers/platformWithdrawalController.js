const PlatformRevenue = require('../models/PlatformRevenue');
const PlatformWithdrawal = require('../models/PlatformWithdrawal');
const PlatformBankAccount = require('../models/PlatformBankAccount');

const {
  resolveBankAccount,
  listNigerianBanks,
  createTransferRecipient,
  initiateTransfer,
  verifyTransfer,
  newTransferReference
} = require('../services/paystackService');


// =========================================================
// HELPERS
// =========================================================

function getAdminId(req) {
  return req.user?._id;
}


// =========================================================
// REVENUE SUMMARY
// =========================================================
// GET /api/admin/platform-revenue
// =========================================================

async function summary(req, res, next) {
  try {
    const adminId = getAdminId(req);

    const revenue = await PlatformRevenue.aggregate([
      {
        $match: {
          status: 'collected'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          },
          count: {
            $sum: 1
          }
        }
      }
    ]);

    const withdrawals = await PlatformWithdrawal.aggregate([
      {
        $match: {
          admin: adminId,
          status: {
            $in: [
              'pending',
              'processing',
              'successful'
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]);

    const successfulWithdrawals =
      await PlatformWithdrawal.aggregate([
        {
          $match: {
            admin: adminId,
            status: 'successful'
          }
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$amount'
            }
          }
        }
      ]);

    const totalCommission =
      Number(revenue[0]?.total || 0);

    const reservedAmount =
      Number(withdrawals[0]?.total || 0);

    const totalWithdrawn =
      Number(
        successfulWithdrawals[0]?.total || 0
      );

    const availableBalance =
      Math.max(
        0,
        totalCommission - reservedAmount
      );

    res.json({
      success: true,

      data: {
        totalCommission,
        totalWithdrawn,
        reservedAmount,
        availableBalance,

        revenueCount:
          Number(
            revenue[0]?.count || 0
          )
      }
    });
  } catch (error) {
    next(error);
  }
}


// =========================================================
// NIGERIAN BANK DIRECTORY
// =========================================================
// GET /api/admin/platform-revenue/banks
//
// The frontend uses this endpoint to populate the bank
// dropdown.
//
// The administrator should select a bank instead of
// manually typing the bank code.
// =========================================================

async function banks(req, res, next) {
  try {
    const result =
      await listNigerianBanks();

    const bankList =
      Array.isArray(result?.data)
        ? result.data
            .filter(
              bank =>
                bank &&
                bank.name &&
                bank.code
            )
            .map(bank => ({
              name: String(
                bank.name
              ).trim(),

              code: String(
                bank.code
              ).trim(),

              slug:
                bank.slug || '',

              active:
                bank.active !== false
            }))
            .sort((a, b) =>
              a.name.localeCompare(
                b.name
              )
            )
        : [];

    res.json({
      success: true,

      data: {
        banks: bankList
      }
    });
  } catch (error) {
    next(error);
  }
}


// =========================================================
// REVENUE HISTORY
// =========================================================
// GET /api/admin/platform-revenue/history
// =========================================================

async function revenueHistory(
  req,
  res,
  next
) {
  try {
    const revenue =
      await PlatformRevenue.find({})
        .populate(
          'trip',
          'tripId fare paymentMethod completedAt'
        )
        .populate(
          'driver',
          'fullName phone'
        )
        .populate(
          'rider',
          'fullName phone'
        )
        .sort({
          createdAt: -1
        })
        .limit(200);

    res.json({
      success: true,

      data: {
        revenue
      }
    });
  } catch (error) {
    next(error);
  }
}


// =========================================================
// GET SAVED PLATFORM BANK ACCOUNT
// =========================================================
// GET /api/admin/platform-revenue/bank-account
// =========================================================

async function getBankAccount(
  req,
  res,
  next
) {
  try {
    const bank =
      await PlatformBankAccount.findOne({
        admin: getAdminId(req)
      });

    res.json({
      success: true,

      data: {
        bankAccount: bank
      }
    });
  } catch (error) {
    next(error);
  }
}


// =========================================================
// VERIFY BANK ACCOUNT
// =========================================================
// POST /api/admin/platform-revenue/bank-account/verify
//
// Body:
//
// {
//   accountNumber: "0123456789",
//   bankCode: "058"
// }
//
// =========================================================

async function verifyBankAccount(
  req,
  res,
  next
) {
  try {
    const accountNumber =
      String(
        req.body.accountNumber || ''
      )
        .replace(/\s+/g, '')
        .trim();

    const bankCode =
      String(
        req.body.bankCode || ''
      ).trim();

    if (
      !/^\d{10}$/.test(
        accountNumber
      )
    ) {
      return res.status(400).json({
        success: false,

        message:
          'Account number must be exactly 10 digits'
      });
    }

    if (!bankCode) {
      return res.status(400).json({
        success: false,

        message:
          'Bank code is required'
      });
    }

    const result =
      await resolveBankAccount({
        accountNumber,
        bankCode
      });

    const accountName =
      String(
        result?.data?.account_name || ''
      ).trim();

    const resolvedAccountNumber =
      String(
        result?.data?.account_number ||
        accountNumber
      ).trim();

    if (!accountName) {
      return res.status(400).json({
        success: false,

        message:
          'Unable to resolve bank account name'
      });
    }

    res.json({
      success: true,

      message:
        'Bank account verified',

      data: {
        accountNumber:
          resolvedAccountNumber,

        accountName,

        bankCode
      }
    });
  } catch (error) {
    next(error);
  }
}


// =========================================================
// SAVE VERIFIED PLATFORM BANK ACCOUNT
// =========================================================
// POST /api/admin/platform-revenue/bank-account
//
// The account name is resolved again through Paystack.
// The frontend cannot simply submit a fake account name.
// =========================================================

async function saveBankAccount(
  req,
  res,
  next
) {
  try {
    const bankName =
      String(
        req.body.bankName || ''
      ).trim();

    const bankCode =
      String(
        req.body.bankCode || ''
      ).trim();

    const accountNumber =
      String(
        req.body.accountNumber || ''
      )
        .replace(/\s+/g, '')
        .trim();

    if (!bankName) {
      return res.status(400).json({
        success: false,

        message:
          'Bank name is required'
      });
    }

    if (!bankCode) {
      return res.status(400).json({
        success: false,

        message:
          'Bank code is required'
      });
    }

    if (
      !/^\d{10}$/.test(
        accountNumber
      )
    ) {
      return res.status(400).json({
        success: false,

        message:
          'Account number must be exactly 10 digits'
      });
    }

    // Resolve account directly with Paystack.
    const resolved =
      await resolveBankAccount({
        accountNumber,
        bankCode
      });

    const accountName =
      String(
        resolved?.data?.account_name || ''
      ).trim();

    if (!accountName) {
      return res.status(400).json({
        success: false,

        message:
          'Unable to resolve bank account name'
      });
    }

    // Create Paystack transfer recipient.
    const recipient =
      await createTransferRecipient({
        accountName,
        accountNumber,
        bankCode,
        currency: 'NGN'
      });

    const recipientCode =
      String(
        recipient?.data?.recipient_code || ''
      ).trim();

    if (!recipientCode) {
      return res.status(502).json({
        success: false,

        message:
          'Paystack did not return a transfer recipient'
      });
    }

    const saved =
      await PlatformBankAccount.findOneAndUpdate(
        {
          admin: getAdminId(req)
        },

        {
          $set: {
            bankName,
            bankCode,
            accountNumber,
            accountName,

            recipientCode,

            currency: 'NGN',

            isVerified: true,

            verifiedAt:
              new Date()
          }
        },

        {
          returnDocument: 'after',
          upsert: true
        }
      );

    res.json({
      success: true,

      message:
        'Platform withdrawal account saved successfully',

      data: {
        bankAccount: saved
      }
    });
  } catch (error) {
    next(error);
  }
}


// =========================================================
// PLATFORM WITHDRAWAL HISTORY
// =========================================================
// GET /api/admin/platform-revenue/withdrawals
// =========================================================

async function withdrawals(
  req,
  res,
  next
) {
  try {
    const items =
      await PlatformWithdrawal.find({
        admin: getAdminId(req)
      })
        .sort({
          createdAt: -1
        })
        .limit(100);

    res.json({
      success: true,

      data: {
        withdrawals: items
      }
    });
  } catch (error) {
    next(error);
  }
}


// =========================================================
// REQUEST COMMISSION WITHDRAWAL
// =========================================================
// POST /api/admin/platform-revenue/withdraw
// =========================================================

async function requestWithdrawal(
  req,
  res,
  next
) {
  try {
    const amount =
      Number(
        req.body.amount
      );

    // Minimum withdrawal.
    if (
      !Number.isFinite(amount) ||
      amount < 100
    ) {
      return res.status(400).json({
        success: false,

        message:
          'Minimum commission withdrawal is ₦100'
      });
    }

    // Only whole naira amounts.
    if (
      !Number.isInteger(amount)
    ) {
      return res.status(400).json({
        success: false,

        message:
          'Withdrawal amount must be a whole number'
      });
    }

    // Require a verified platform bank.
    const bank =
      await PlatformBankAccount.findOne({
        admin: getAdminId(req),
        isVerified: true
      });

    if (
      !bank ||
      !bank.recipientCode
    ) {
      return res.status(400).json({
        success: false,

        message:
          'Set and verify the platform bank account before withdrawing'
      });
    }

    // Calculate total collected commission.
    const revenue =
      await PlatformRevenue.aggregate([
        {
          $match: {
            status: 'collected'
          }
        },

        {
          $group: {
            _id: null,

            total: {
              $sum: '$amount'
            }
          }
        }
      ]);

    // Reserve pending, processing and successful withdrawals.
    const reserved =
      await PlatformWithdrawal.aggregate([
        {
          $match: {
            admin: getAdminId(req),

            status: {
              $in: [
                'pending',
                'processing',
                'successful'
              ]
            }
          }
        },

        {
          $group: {
            _id: null,

            total: {
              $sum: '$amount'
            }
          }
        }
      ]);

    const totalCommission =
      Number(
        revenue[0]?.total || 0
      );

    const reservedAmount =
      Number(
        reserved[0]?.total || 0
      );

    const availableBalance =
      Math.max(
        0,
        totalCommission -
          reservedAmount
      );

    // Prevent overdrawing commission.
    if (
      amount >
      availableBalance
    ) {
      return res.status(400).json({
        success: false,

        message:
          `Insufficient commission balance. Available balance is ₦${availableBalance.toLocaleString('en-NG')}`,

        data: {
          availableBalance
        }
      });
    }

    // Generate unique Paystack transfer reference.
    const reference =
      newTransferReference();

    // Create the withdrawal first so that
    // the amount becomes reserved.
    const withdrawal =
      await PlatformWithdrawal.create({
        admin:
          getAdminId(req),

        amount,

        currency:
          'NGN',

        bankName:
          bank.bankName,

        bankCode:
          bank.bankCode,

        accountNumber:
          bank.accountNumber,

        accountName:
          bank.accountName,

        recipientCode:
          bank.recipientCode,

        reference,

        status:
          'pending',

        requestedAt:
          new Date()
      });

    try {
      // Initiate Paystack transfer.
      const transfer =
        await initiateTransfer({
          amount,

          recipientCode:
            bank.recipientCode,

          reference,

          reason:
            'Kaduna Only platform commission withdrawal'
        });

      const data =
        transfer?.data || {};

      const paystackStatus =
        String(
          data.status || ''
        ).toLowerCase();

      withdrawal.paystackTransferCode =
        data.transfer_code || '';

      if (
        [
          'success',
          'successful'
        ].includes(
          paystackStatus
        )
      ) {
        withdrawal.status =
          'successful';

        withdrawal.completedAt =
          new Date();
      } else {
        withdrawal.status =
          'processing';
      }

      await withdrawal.save();

      return res.status(201).json({
        success: true,

        message:
          withdrawal.status ===
          'successful'
            ? 'Commission withdrawal successful'
            : 'Commission withdrawal initiated',

        data: {
          withdrawal
        }
      });
    } catch (transferError) {
      withdrawal.status =
        'failed';

      withdrawal.failureReason =
        transferError.message;

      withdrawal.completedAt =
        new Date();

      await withdrawal.save();

      throw transferError;
    }
  } catch (error) {
    next(error);
  }
}


// =========================================================
// VERIFY PLATFORM WITHDRAWAL
// =========================================================
// GET /api/admin/platform-revenue/withdrawals/:id/verify
// =========================================================

async function verifyWithdrawal(
  req,
  res,
  next
) {
  try {
    const withdrawal =
      await PlatformWithdrawal.findOne({
        _id:
          req.params.id,

        admin:
          getAdminId(req)
      });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,

        message:
          'Platform withdrawal not found'
      });
    }

    const result =
      await verifyTransfer(
        withdrawal.reference
      );

    const data =
      result?.data || {};

    const status =
      String(
        data.status || ''
      ).toLowerCase();

    if (
      [
        'success',
        'successful'
      ].includes(status)
    ) {
      withdrawal.status =
        'successful';

      withdrawal.paystackTransferCode =
        data.transfer_code ||
        withdrawal.paystackTransferCode;

      withdrawal.failureReason =
        '';

      withdrawal.completedAt =
        new Date();
    }

    else if (
      status === 'failed'
    ) {
      withdrawal.status =
        'failed';

      withdrawal.failureReason =
        data.failures ||
        data.gateway_response ||
        'Paystack transfer failed';

      withdrawal.completedAt =
        new Date();
    }

    else if (
      status === 'reversed'
    ) {
      withdrawal.status =
        'reversed';

      withdrawal.failureReason =
        data.gateway_response ||
        'Paystack transfer was reversed';

      withdrawal.completedAt =
        new Date();
    }

    else {
      withdrawal.status =
        'processing';
    }

    await withdrawal.save();

    res.json({
      success: true,

      message:
        'Withdrawal status updated',

      data: {
        withdrawal
      }
    });
  } catch (error) {
    next(error);
  }
}


// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  summary,
  banks,
  revenueHistory,
  getBankAccount,
  verifyBankAccount,
  saveBankAccount,
  withdrawals,
  requestWithdrawal,
  verifyWithdrawal
};