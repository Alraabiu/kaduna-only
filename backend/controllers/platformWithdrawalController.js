const PlatformRevenue = require('../models/PlatformRevenue');
const PlatformWithdrawal = require('../models/PlatformWithdrawal');
const PlatformBankAccount = require('../models/PlatformBankAccount');

const {
  resolveBankAccount,
  createTransferRecipient,
  initiateTransfer,
  verifyTransfer,
  newTransferReference
} = require('../services/paystackService');


function getAdminId(req) {
  return req.user?._id;
}


/*
 * ---------------------------------------------------------
 * REVENUE SUMMARY
 * ---------------------------------------------------------
 */

async function summary(req, res, next) {
  try {
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

    const successfulWithdrawals =
      await PlatformWithdrawal.aggregate([
        {
          $match: {
            admin: getAdminId(req),
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
      Number(
        revenue[0]?.total || 0
      );

    const reserved =
      Number(
        withdrawals[0]?.total || 0
      );

    const totalWithdrawn =
      Number(
        successfulWithdrawals[0]?.total || 0
      );

    /*
     * pending + processing + successful
     * are already reserved from available balance.
     */
    const available =
      Math.max(
        0,
        totalCommission - reserved
      );

    res.json({
      success: true,

      data: {
        totalCommission,
        totalWithdrawn,
        reservedAmount: reserved,
        availableBalance: available,
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


/*
 * ---------------------------------------------------------
 * REVENUE HISTORY
 * ---------------------------------------------------------
 */

async function revenueHistory(req, res, next) {
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


/*
 * ---------------------------------------------------------
 * BANK ACCOUNT
 * ---------------------------------------------------------
 */

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


/*
 * ---------------------------------------------------------
 * VERIFY BANK ACCOUNT
 * ---------------------------------------------------------
 */

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

    res.json({
      success: true,
      message:
        'Bank account verified',
      data: {
        accountNumber:
          result.data.account_number,

        accountName:
          result.data.account_name,

        bankCode
      }
    });
  } catch (error) {
    next(error);
  }
}


/*
 * ---------------------------------------------------------
 * SAVE BANK ACCOUNT
 * ---------------------------------------------------------
 */

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

    /*
     * Never trust account name supplied
     * by the frontend.
     *
     * Resolve it again through Paystack.
     */
    const resolved =
      await resolveBankAccount({
        accountNumber,
        bankCode
      });

    const accountName =
      String(
        resolved.data.account_name || ''
      ).trim();

    if (!accountName) {
      return res.status(400).json({
        success: false,
        message:
          'Unable to resolve bank account name'
      });
    }

    /*
     * Create Paystack transfer recipient.
     */
    const recipient =
      await createTransferRecipient({
        accountName,
        accountNumber,
        bankCode,
        currency: 'NGN'
      });

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

            recipientCode:
              recipient.data.recipient_code,

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


/*
 * ---------------------------------------------------------
 * WITHDRAWAL HISTORY
 * ---------------------------------------------------------
 */

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


/*
 * ---------------------------------------------------------
 * REQUEST WITHDRAWAL
 * ---------------------------------------------------------
 */

async function requestWithdrawal(
  req,
  res,
  next
) {
  try {
    const amount =
      Number(req.body.amount);

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

    if (
      !Number.isInteger(amount)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Withdrawal amount must be a whole number'
      });
    }

    /*
     * Require a verified bank.
     */
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

    /*
     * Calculate total collected commission.
     */
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

    /*
     * Reserve pending, processing and
     * successful withdrawals.
     */
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

    /*
     * Prevent overdrawing.
     */
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

    /*
     * Create withdrawal record BEFORE
     * contacting Paystack.
     *
     * This reserves the amount.
     */
    const reference =
      newTransferReference();

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

    /*
     * Initiate Paystack transfer.
     */
    try {
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
        transfer.data || {};

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


/*
 * ---------------------------------------------------------
 * VERIFY WITHDRAWAL
 * ---------------------------------------------------------
 */

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
      result.data || {};

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
    } else if (
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
    } else if (
      status === 'reversed'
    ) {
      withdrawal.status =
        'reversed';

      withdrawal.failureReason =
        data.gateway_response ||
        'Paystack transfer was reversed';

      withdrawal.completedAt =
        new Date();
    } else {
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


module.exports = {
  summary,
  revenueHistory,
  getBankAccount,
  verifyBankAccount,
  saveBankAccount,
  withdrawals,
  requestWithdrawal,
  verifyWithdrawal
};