import React, { useEffect, useState } from 'react';
import {
  AdminLayout,
  PageHeader,
  api,
  formatMoney,
  useApp,
  Button,
  Notice
} from '../../shared';

const VEHICLES = ['bike', 'keke', 'car', 'suv'];

const EMPTY = {
  bike: { base: '', perKm: '', minimum: '', avgKph: '' },
  keke: { base: '', perKm: '', minimum: '', avgKph: '' },
  car: { base: '', perKm: '', minimum: '', avgKph: '' },
  suv: { base: '', perKm: '', minimum: '', avgKph: '' }
};

export default function AdminPricing() {
  const { notify } = useApp();

  const [pricing, setPricing] = useState(EMPTY);
  const [commission, setCommission] = useState(50);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);

    try {
      const r = await api('/admin/pricing');
      const data = r.data || {};

      const next = { ...EMPTY };

      for (const vehicle of VEHICLES) {
        const value = data.pricing?.[vehicle] || {};

        next[vehicle] = {
          base: value.base ?? '',
          perKm: value.perKm ?? '',
          minimum: value.minimum ?? '',
          avgKph: value.avgKph ?? ''
        };
      }

      setPricing(next);
      setCommission(
        Number(data.platformCommission?.amount ?? 50)
      );
    } catch (e) {
      notify(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateVehicle(vehicle, field, value) {
    setPricing(current => ({
      ...current,
      [vehicle]: {
        ...current[vehicle],
        [field]: value
      }
    }));

    setSaved(false);
  }

  function validate() {
    for (const vehicle of VEHICLES) {
      const p = pricing[vehicle];

      if (
        !Number.isFinite(Number(p.base)) ||
        Number(p.base) < 0
      ) {
        return `${vehicle.toUpperCase()} base fare is invalid`;
      }

      if (
        !Number.isFinite(Number(p.perKm)) ||
        Number(p.perKm) < 0
      ) {
        return `${vehicle.toUpperCase()} per-km fare is invalid`;
      }

      if (
        !Number.isFinite(Number(p.minimum)) ||
        Number(p.minimum) < 0
      ) {
        return `${vehicle.toUpperCase()} minimum fare is invalid`;
      }

      if (
        !Number.isFinite(Number(p.avgKph)) ||
        Number(p.avgKph) <= 0
      ) {
        return `${vehicle.toUpperCase()} average speed must be greater than zero`;
      }

      if (Number(p.minimum) < Number(p.base)) {
        return `${vehicle.toUpperCase()} minimum fare cannot be lower than base fare`;
      }
    }

    if (
      !Number.isFinite(Number(commission)) ||
      Number(commission) < 0
    ) {
      return 'Platform commission is invalid';
    }

    return null;
  }

  async function save() {
    const error = validate();

    if (error) {
      notify(error);
      return;
    }

    setSaving(true);
    setSaved(false);

    try {
      const body = {
        pricing: Object.fromEntries(
          VEHICLES.map(vehicle => [
            vehicle,
            {
              base: Number(pricing[vehicle].base),
              perKm: Number(pricing[vehicle].perKm),
              minimum: Number(pricing[vehicle].minimum),
              avgKph: Number(pricing[vehicle].avgKph)
            }
          ])
        ),
        platformCommission: Number(commission)
      };

      const r = await api('/admin/pricing', {
        method: 'PATCH',
        body: JSON.stringify(body)
      });

      const data = r.data || {};

      const next = { ...EMPTY };

      for (const vehicle of VEHICLES) {
        const value = data.pricing?.[vehicle] || {};

        next[vehicle] = {
          base: value.base ?? '',
          perKm: value.perKm ?? '',
          minimum: value.minimum ?? '',
          avgKph: value.avgKph ?? ''
        };
      }

      setPricing(next);
      setCommission(
        Number(data.platformCommission?.amount ?? commission)
      );

      setSaved(true);

      notify({
        title: 'Pricing updated',
        message: 'New pricing will apply to new ride quotes.',
        tone: 'success'
      });
    } catch (e) {
      notify(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <PageHeader
          title="Pricing"
          subtitle="Manage Kaduna Only ride pricing."
        />

        <div className="panel">
          <p className="muted">Loading pricing configuration...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Pricing"
        subtitle="Manage Kaduna Only ride pricing and platform commission."
        action={
          <Button
            onClick={load}
            variant="secondary"
            disabled={saving}
          >
            Refresh
          </Button>
        }
      />

      <Notice
        title="Production pricing control"
        text="Changes are stored on the server and affect new ride quotations. Completed trips keep their original fares."
        tone="warning"
      />

      <div className="panel">
        <div className="panel-title">
          <div>
            <h3>Vehicle pricing</h3>
            <p>
              Set the base fare, distance charge, minimum fare and
              average speed for each vehicle.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Base fare</th>
                <th>Per km</th>
                <th>Minimum</th>
                <th>Average speed</th>
              </tr>
            </thead>

            <tbody>
              {VEHICLES.map(vehicle => {
                const p = pricing[vehicle];

                return (
                  <tr key={vehicle}>
                    <td>
                      <b>{vehicle.toUpperCase()}</b>
                    </td>

                    <td>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={p.base}
                        onChange={e =>
                          updateVehicle(
                            vehicle,
                            'base',
                            e.target.value
                          )
                        }
                      />
                    </td>

                    <td>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={p.perKm}
                        onChange={e =>
                          updateVehicle(
                            vehicle,
                            'perKm',
                            e.target.value
                          )
                        }
                      />
                    </td>

                    <td>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={p.minimum}
                        onChange={e =>
                          updateVehicle(
                            vehicle,
                            'minimum',
                            e.target.value
                          )
                        }
                      />
                    </td>

                    <td>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={p.avgKph}
                        onChange={e =>
                          updateVehicle(
                            vehicle,
                            'avgKph',
                            e.target.value
                          )
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">
          <div>
            <h3>Platform commission</h3>
            <p>
              Flat amount deducted from each completed trip.
            </p>
          </div>
        </div>

        <div className="form">
          <label>
            Commission per completed trip (NGN)
            <input
              type="number"
              min="0"
              step="5"
              value={commission}
              onChange={e => {
                setCommission(e.target.value);
                setSaved(false);
              }}
            />
          </label>

          <div className="withdraw-summary">
            <span>Current commission</span>
            <b>{formatMoney(Number(commission) || 0)}</b>
          </div>
        </div>
      </div>

      <div
        className="panel"
        style={{
          marginTop: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16
        }}
      >
        <div>
          <h3>Save configuration</h3>

          <p className="muted">
            {saved
              ? 'Pricing configuration saved successfully.'
              : 'Review the values before saving.'}
          </p>
        </div>

        <Button
          onClick={save}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Pricing'}
        </Button>
      </div>
    </AdminLayout>
  );
}