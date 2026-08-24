import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  Banknote,
  CheckCircle2,
  Clock3,
  Landmark,
  ShieldCheck,
  Building2,
  Send,
  History,
  RefreshCw,
  ChevronDown
} from 'lucide-react';

import {
  api,
  useApp,
  AdminLayout,
  PageHeader,
  Button,
  Badge,
  Stat,
  formatMoney
} from '../../shared';

export default function AdminPlatformRevenue() {
  const { notify } = useApp();

  const [summary, setSummary] = useState({
    totalCommission: 0,
    totalWithdrawn: 0,
    reservedAmount: 0,
    availableBalance: 0,
    revenueCount: 0
  });

  const [bankAccount, setBankAccount] = useState(null);
  const [banks, setBanks] = useState([]);
  const [revenue, setRevenue] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);

  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [verifiedAccountName, setVerifiedAccountName] = useState('');

  const [selectedBank, setSelectedBank] = useState(null);

  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState('');

  /*
   * -------------------------------------------------------
   * LOAD ALL DATA
   * -------------------------------------------------------
   */

  async function loadAll() {
    setBusy('load');

    try {
      const [
        summaryResponse,
        bankResponse,
        banksResponse,
        revenueResponse,
        withdrawalsResponse
      ] = await Promise.all([
        api('/admin/platform-revenue'),
        api('/admin/platform-revenue/bank-account'),
        api('/admin/platform-revenue/banks'),
        api('/admin/platform-revenue/history'),
        api('/admin/platform-revenue/withdrawals')
      ]);

      setSummary(
        summaryResponse.data || {
          totalCommission: 0,
          totalWithdrawn: 0,
          reservedAmount: 0,
          availableBalance: 0,
          revenueCount: 0
        }
      );

      setBankAccount(
        bankResponse.data?.bankAccount || null
      );

      const bankList =
        banksResponse.data?.banks ||
        [];

      setBanks(bankList);

      setRevenue(
        revenueResponse.data?.revenue || []
      );

      setWithdrawals(
        withdrawalsResponse.data?.withdrawals || []
      );

      /*
       * Restore saved bank account into
       * the form when one exists.
       *
       * The bank code is stored internally,
       * but is never shown to the admin.
       */
      if (bankResponse.data?.bankAccount) {
        const saved =
          bankResponse.data.bankAccount;

        setBankName(
          saved.bankName || ''
        );

        setBankCode(
          saved.bankCode || ''
        );

        setAccountNumber(
          saved.accountNumber || ''
        );

        setVerifiedAccountName(
          saved.accountName || ''
        );

        const matched =
          bankList.find(
            bank =>
              String(bank.code) ===
              String(saved.bankCode)
          );

        setSelectedBank(
          matched || null
        );
      }
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  /*
   * -------------------------------------------------------
   * BANK SELECTION
   * -------------------------------------------------------
   */

  function handleBankChange(event) {
    const code = event.target.value;

    const bank =
      banks.find(
        item =>
          String(item.code) ===
          String(code)
      );

    setSelectedBank(bank || null);

    setBankName(
      bank?.name || ''
    );

    /*
     * Bank code is kept in state only.
     * It is NEVER rendered as an input.
     */
    setBankCode(
      bank?.code || ''
    );

    /*
     * Changing bank invalidates a previous
     * account verification.
     */
    setVerifiedAccountName('');

    if (
      accountNumber &&
      accountNumber.length === 10
    ) {
      setAccountNumber('');
    }
  }

  /*
   * -------------------------------------------------------
   * VERIFY BANK ACCOUNT
   * -------------------------------------------------------
   */

  async function verifyBank() {
    const cleanAccount =
      String(accountNumber || '')
        .replace(/\s+/g, '')
        .trim();

    if (!selectedBank || !bankCode) {
      notify(
        'Select your Nigerian bank first'
      );
      return;
    }

    if (!/^\d{10}$/.test(cleanAccount)) {
      notify(
        'Enter a valid 10-digit Nigerian bank account number'
      );
      return;
    }

    setBusy('verify-bank');

    try {
      const response = await api(
        '/admin/platform-revenue/bank-account/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            accountNumber: cleanAccount,
            bankCode
          })
        }
      );

      const data =
        response.data || {};

      setAccountNumber(
        data.accountNumber ||
        cleanAccount
      );

      setVerifiedAccountName(
        data.accountName || ''
      );

      notify({
        title: 'Bank account verified',
        message:
          data.accountName ||
          'Account verification successful.',
        tone: 'success'
      });
    } catch (e) {
      setVerifiedAccountName('');
      notify(e.message);
    } finally {
      setBusy('');
    }
  }

  /*
   * -------------------------------------------------------
   * SAVE BANK ACCOUNT
   * -------------------------------------------------------
   */

  async function saveBank() {
    const cleanAccount =
      String(accountNumber || '')
        .replace(/\s+/g, '')
        .trim();

    if (!selectedBank || !bankCode) {
      notify(
        'Select your Nigerian bank first'
      );
      return;
    }

    if (!/^\d{10}$/.test(cleanAccount)) {
      notify(
        'Account number must be exactly 10 digits'
      );
      return;
    }

    if (!verifiedAccountName) {
      notify(
        'Verify the bank account before saving it'
      );
      return;
    }

    setBusy('save-bank');

    try {
      const response = await api(
        '/admin/platform-revenue/bank-account',
        {
          method: 'POST',
          body: JSON.stringify({
            bankName:
              selectedBank.name ||
              bankName,

            bankCode,

            accountNumber:
              cleanAccount
          })
        }
      );

      setBankAccount(
        response.data?.bankAccount ||
        null
      );

      notify({
        title: 'Bank account saved',
        message:
          'The platform withdrawal account is ready.',
        tone: 'success'
      });

      await loadAll();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }

  /*
   * -------------------------------------------------------
   * WITHDRAW COMMISSION
   * -------------------------------------------------------
   */

  async function withdraw() {
    const value = Number(amount);

    if (
      !Number.isFinite(value) ||
      value < 100
    ) {
      notify(
        'Minimum commission withdrawal is ₦100'
      );
      return;
    }

    if (!Number.isInteger(value)) {
      notify(
        'Withdrawal amount must be a whole number'
      );
      return;
    }

    if (
      value >
      Number(
        summary.availableBalance || 0
      )
    ) {
      notify(
        `Insufficient commission balance. Available balance is ${formatMoney(
          summary.availableBalance
        )}`
      );
      return;
    }

    if (
      !bankAccount ||
      !bankAccount.recipientCode
    ) {
      notify(
        'Set and verify the platform bank account first'
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Withdraw ${formatMoney(
          value
        )} to ${bankAccount.bankName} ${bankAccount.accountNumber}?`
      );

    if (!confirmed) {
      return;
    }

    setBusy('withdraw');

    try {
      const response = await api(
        '/admin/platform-revenue/withdraw',
        {
          method: 'POST',
          body: JSON.stringify({
            amount: value
          })
        }
      );

      setAmount('');

      notify({
        title:
          'Commission withdrawal submitted',
        message:
          response.data?.withdrawal?.status ===
          'successful'
            ? 'The commission has been transferred successfully.'
            : 'The commission transfer has been initiated.',
        tone: 'success'
      });

      await loadAll();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }

  /*
   * -------------------------------------------------------
   * VERIFY PAYSTACK TRANSFER
   * -------------------------------------------------------
   */

  async function verifyWithdrawal(id) {
    setBusy(`verify-${id}`);

    try {
      await api(
        `/admin/platform-revenue/withdrawals/${id}/verify`
      );

      notify({
        title:
          'Withdrawal status updated',
        message:
          'Paystack transfer status has been refreshed.',
        tone: 'success'
      });

      await loadAll();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }

  /*
   * -------------------------------------------------------
   * STATUS TONE
   * -------------------------------------------------------
   */

  function withdrawalTone(status) {
    if (
      status === 'successful'
    ) {
      return 'success';
    }

    if (
      status === 'failed' ||
      status === 'reversed'
    ) {
      return 'danger';
    }

    return 'warning';
  }

  /*
   * -------------------------------------------------------
   * FILTERED BANK LIST
   * -------------------------------------------------------
   */

  const sortedBanks =
    useMemo(() => {
      return [...banks].sort(
        (a, b) =>
          String(a.name || '').localeCompare(
            String(b.name || '')
          )
      );
    }, [banks]);

  /*
   * -------------------------------------------------------
   * RENDER
   * -------------------------------------------------------
   */

  return (
    <AdminLayout>

      <PageHeader
        title="Platform Commission"
        subtitle="Manage Kaduna Only commission revenue and withdraw it to the platform bank account."
        action={
          <Button
            onClick={loadAll}
            variant="secondary"
            disabled={busy === 'load'}
          >
            <RefreshCw size={16} />
            Refresh
          </Button>
        }
      />

      {/* =================================================
          SUMMARY
      ================================================= */}

      <div className="stats">

        <Stat
          title="Available Commission"
          value={formatMoney(
            summary.availableBalance
          )}
          icon={Wallet}
          meta="Available to withdraw"
        />

        <Stat
          title="Total Commission"
          value={formatMoney(
            summary.totalCommission
          )}
          icon={Banknote}
          meta={`${summary.revenueCount} revenue transactions`}
        />

        <Stat
          title="Total Withdrawn"
          value={formatMoney(
            summary.totalWithdrawn
          )}
          icon={CheckCircle2}
          meta="Successful withdrawals"
        />

        <Stat
          title="Reserved"
          value={formatMoney(
            summary.reservedAmount
          )}
          icon={Clock3}
          meta="Pending, processing or successful"
        />

      </div>

      {/* =================================================
          BANK ACCOUNT
      ================================================= */}

      <div className="panel">

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 16
          }}
        >

          <div>

            <h3
              style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Landmark size={19} />
              Platform Bank Account
            </h3>

            <p
              className="muted"
              style={{
                marginBottom: 0
              }}
            >
              Select the Nigerian bank and enter the account number that should receive Kaduna Only commission withdrawals.
            </p>

          </div>

          {bankAccount?.isVerified && (
            <Badge tone="success">

              <ShieldCheck
                size={13}
                style={{
                  marginRight: 5
                }}
              />

              Verified

            </Badge>
          )}

        </div>

        {/* SAVED ACCOUNT */}

        {bankAccount ? (

          <div
            style={{
              padding: 16,
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              marginBottom: 18
            }}
          >

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit,minmax(180px,1fr))',
                gap: 16
              }}
            >

              <div>
                <small className="muted">
                  Bank
                </small>

                <strong
                  style={{
                    display: 'block',
                    marginTop: 4
                  }}
                >
                  {bankAccount.bankName}
                </strong>
              </div>

              <div>
                <small className="muted">
                  Account name
                </small>

                <strong
                  style={{
                    display: 'block',
                    marginTop: 4
                  }}
                >
                  {bankAccount.accountName}
                </strong>
              </div>

              <div>
                <small className="muted">
                  Account number
                </small>

                <strong
                  style={{
                    display: 'block',
                    marginTop: 4
                  }}
                >
                  {bankAccount.accountNumber}
                </strong>
              </div>

            </div>

          </div>

        ) : (

          <div className="notice warning">
            No platform bank account has been configured.
          </div>

        )}

        {/* BANK SELECTION */}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit,minmax(260px,1fr))',
            gap: 12
          }}
        >

          <label>

            <span className="muted">
              Nigerian bank
            </span>

            <div
              style={{
                position: 'relative',
                marginTop: 6
              }}
            >

              <select
                value={
                  selectedBank?.code || ''
                }
                onChange={
                  handleBankChange
                }
                disabled={
                  busy === 'verify-bank' ||
                  busy === 'save-bank'
                }
                style={{
                  width: '100%',
                  paddingRight: 40,
                  appearance: 'none'
                }}
              >

                <option value="">
                  Select your bank
                </option>

                {sortedBanks.map(
                  bank => (
                    <option
                      key={
                        bank.code
                      }
                      value={
                        bank.code
                      }
                    >
                      {bank.name}
                    </option>
                  )
                )}

              </select>

              <ChevronDown
                size={17}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform:
                    'translateY(-50%)',
                  pointerEvents:
                    'none'
                }}
              />

            </div>

          </label>

          <label>

            <span className="muted">
              Account number
            </span>

            <input
              value={
                accountNumber
              }
              onChange={e => {
                const value =
                  e.target.value
                    .replace(/\D/g, '')
                    .slice(0, 10);

                setAccountNumber(
                  value
                );

                /*
                 * Changing the account number
                 * invalidates old verification.
                 */
                setVerifiedAccountName('');
              }}
              placeholder="10-digit account number"
              inputMode="numeric"
              maxLength={10}
              style={{
                width: '100%',
                marginTop: 6
              }}
            />

          </label>

        </div>

        {/* SELECTED BANK INFORMATION */}

        {selectedBank && (
          <div
            className="notice"
            style={{
              marginTop: 14
            }}
          >
            <b>
              Selected bank
            </b>

            <div
              style={{
                marginTop: 4
              }}
            >
              {selectedBank.name}
            </div>

          </div>
        )}

        {/* VERIFIED ACCOUNT */}

        {verifiedAccountName && (
          <div
            className="notice success"
            style={{
              marginTop: 14
            }}
          >

            <b>
              Verified account name
            </b>

            <p
              style={{
                marginBottom: 0
              }}
            >
              {verifiedAccountName}
            </p>

          </div>
        )}

        {/* ACTIONS */}

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginTop: 16
          }}
        >

          <Button
            onClick={
              verifyBank
            }
            disabled={
              busy === 'verify-bank' ||
              !selectedBank ||
              accountNumber.length !== 10
            }
          >

            <ShieldCheck size={16} />

            {busy === 'verify-bank'
              ? 'Verifying...'
              : 'Verify Account'}

          </Button>

          <Button
            onClick={
              saveBank
            }
            disabled={
              busy === 'save-bank' ||
              !selectedBank ||
              !verifiedAccountName ||
              accountNumber.length !== 10
            }
            variant="secondary"
          >

            <Building2 size={16} />

            {busy === 'save-bank'
              ? 'Saving...'
              : 'Save Bank Account'}

          </Button>

        </div>

      </div>

      {/* =================================================
          WITHDRAW COMMISSION
      ================================================= */}

      <div className="panel">

        <h3
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Send size={19} />
          Withdraw Commission
        </h3>

        <p className="muted">
          Transfer collected platform commission directly to the verified platform bank account.
        </p>

        <div
          style={{
            padding: 18,
            borderRadius: 12,
            border: '1px solid #e5e7eb',
            marginTop: 14
          }}
        >

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(220px,1fr))',
              gap: 16,
              alignItems: 'end'
            }}
          >

            <label>

              <span className="muted">
                Withdrawal amount (NGN)
              </span>

              <input
                value={amount}
                onChange={e =>
                  setAmount(
                    e.target.value
                  )
                }
                placeholder="Enter amount"
                type="number"
                min="100"
                step="1"
                style={{
                  width: '100%',
                  marginTop: 6
                }}
              />

            </label>

            <div>

              <small className="muted">
                Available balance
              </small>

              <strong
                style={{
                  display: 'block',
                  fontSize: 22,
                  marginTop: 5
                }}
              >
                {formatMoney(
                  summary.availableBalance
                )}
              </strong>

            </div>

            <div>

              <Button
                onClick={
                  withdraw
                }
                disabled={
                  busy === 'withdraw' ||
                  !bankAccount?.recipientCode ||
                  Number(
                    summary.availableBalance
                  ) < 100
                }
              >

                <Send size={16} />

                {busy === 'withdraw'
                  ? 'Processing...'
                  : 'Withdraw to Bank'}

              </Button>

            </div>

          </div>

          <p
            className="muted"
            style={{
              marginBottom: 0,
              marginTop: 12,
              fontSize: 12
            }}
          >
            Minimum withdrawal: ₦100. Only collected commission can be withdrawn.
          </p>

        </div>

      </div>

      {/* =================================================
          WITHDRAWAL HISTORY
      ================================================= */}

      <div className="panel">

        <h3
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <History size={19} />
          Commission Withdrawal History
        </h3>

        <div className="table-wrap">

          <table>

            <thead>

              <tr>
                <th>Amount</th>
                <th>Bank</th>
                <th>Account</th>
                <th>Status</th>
                <th>Reference</th>
                <th>Date</th>
                <th>Action</th>
              </tr>

            </thead>

            <tbody>

              {withdrawals.map(
                item => (

                  <tr
                    key={
                      item._id
                    }
                  >

                    <td>
                      <b>
                        {formatMoney(
                          item.amount
                        )}
                      </b>
                    </td>

                    <td>
                      {item.bankName}
                    </td>

                    <td>

                      <b>
                        {item.accountName}
                      </b>

                      <br />

                      <small>
                        {item.accountNumber}
                      </small>

                    </td>

                    <td>

                      <Badge
                        tone={withdrawalTone(
                          item.status
                        )}
                      >
                        {item.status}
                      </Badge>

                    </td>

                    <td>
                      <small>
                        {item.reference}
                      </small>
                    </td>

                    <td>
                      <small>
                        {new Date(
                          item.createdAt
                        ).toLocaleString(
                          'en-NG'
                        )}
                      </small>
                    </td>

                    <td>

                      {[
                        'pending',
                        'processing'
                      ].includes(
                        item.status
                      ) && (

                        <Button
                          variant="secondary"
                          disabled={
                            busy ===
                            `verify-${item._id}`
                          }
                          onClick={() =>
                            verifyWithdrawal(
                              item._id
                            )
                          }
                        >

                          <RefreshCw
                            size={14}
                          />

                          {busy ===
                          `verify-${item._id}`
                            ? 'Checking...'
                            : 'Verify'}

                        </Button>

                      )}

                      {[
                        'failed',
                        'reversed'
                      ].includes(
                        item.status
                      ) && (

                        <small className="muted">
                          {item.failureReason ||
                            'Transfer failed'}
                        </small>

                      )}

                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

          {!withdrawals.length && (
            <p className="muted">
              No platform commission withdrawals yet.
            </p>
          )}

        </div>

      </div>

      {/* =================================================
          COMMISSION HISTORY
      ================================================= */}

      <div className="panel">

        <h3>
          Commission Revenue History
        </h3>

        <div className="table-wrap">

          <table>

            <thead>

              <tr>
                <th>Trip</th>
                <th>Driver</th>
                <th>Rider</th>
                <th>Payment</th>
                <th>Commission</th>
                <th>Status</th>
                <th>Date</th>
              </tr>

            </thead>

            <tbody>

              {revenue.map(
                item => (

                  <tr
                    key={
                      item._id
                    }
                  >

                    <td>
                      {item.trip?.tripId ||
                        '—'}
                    </td>

                    <td>
                      {item.driver?.fullName ||
                        '—'}
                    </td>

                    <td>
                      {item.rider?.fullName ||
                        '—'}
                    </td>

                    <td>
                      {item.paymentMethod}
                    </td>

                    <td>

                      <b>
                        {formatMoney(
                          item.amount
                        )}
                      </b>

                    </td>

                    <td>

                      <Badge
                        tone={
                          item.status ===
                          'collected'
                            ? 'success'
                            : 'warning'
                        }
                      >
                        {item.status}
                      </Badge>

                    </td>

                    <td>

                      <small>
                        {new Date(
                          item.createdAt
                        ).toLocaleString(
                          'en-NG'
                        )}
                      </small>

                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

          {!revenue.length && (
            <p className="muted">
              No commission revenue records yet.
            </p>
          )}

        </div>

      </div>

    </AdminLayout>
  );
}