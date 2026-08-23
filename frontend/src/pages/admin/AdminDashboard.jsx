import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  Users,
  ClipboardList,
  Wallet,
  RefreshCw,
  ArrowRight,
  Car,
  Radio,
  Coins,
  MapPin,
  Navigation,
  Circle,
  Clock3
} from 'lucide-react';

import {
  AdminLayout,
  PageHeader,
  Stat,
  api,
  formatMoney,
  Button,
  Badge,
  statusTone,
  useApp
} from '../../shared';

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap
} from 'react-leaflet';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const KADUNA_CENTER = [10.5105, 7.4165];
const KADUNA_ZOOM = 12;

const GPS_STALE_AFTER_MS = 30 * 1000;

const activeTripStatuses = [
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'TRIP_STARTED'
];

/* ---------------------------------------------------------
   GPS HELPERS
--------------------------------------------------------- */

function getLocationTime(location) {
  if (!location?.updatedAt) return 0;

  const time = new Date(
    location.updatedAt
  ).getTime();

  return Number.isFinite(time)
    ? time
    : 0;
}

function hasValidCoordinates(location) {
  if (
    location?.latitude == null ||
    location?.longitude == null
  ) {
    return false;
  }

  const lat = Number(location.latitude);
  const lng = Number(location.longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function isGpsLive(
  location,
  now = Date.now()
) {
  const updated =
    getLocationTime(location);

  if (!updated) return false;

  return (
    now - updated <=
    GPS_STALE_AFTER_MS
  );
}

function gpsStatus(
  location,
  now = Date.now()
) {
  if (!hasValidCoordinates(location)) {
    return 'no-gps';
  }

  return isGpsLive(location, now)
    ? 'live'
    : 'stale';
}

function gpsLabel(status) {
  if (status === 'live') {
    return 'GPS LIVE';
  }

  if (status === 'stale') {
    return 'GPS STALE';
  }

  return 'NO GPS';
}

function gpsTone(status) {
  if (status === 'live') {
    return 'success';
  }

  if (status === 'stale') {
    return 'danger';
  }

  return 'warning';
}

/* ---------------------------------------------------------
   DRIVER MARKER
--------------------------------------------------------- */

function driverIcon({
  gps = 'live',
  active = false
} = {}) {
  const background =
    active
      ? '#7c3aed'
      : gps === 'live'
        ? '#16a34a'
        : gps === 'stale'
          ? '#f59e0b'
          : '#6b7280';

  const indicator =
    gps === 'live'
      ? '#22c55e'
      : gps === 'stale'
        ? '#f59e0b'
        : '#9ca3af';

  /*
   * Use plain text instead of emoji here.
   * This prevents Windows/browser character
   * encoding problems such as ðŸš—.
   */
  return L.divIcon({
    className: '',
    html: `
      <div
        style="
          width:42px;
          height:42px;
          border-radius:50%;
          background:${background};
          border:4px solid white;
          box-shadow:0 4px 14px rgba(0,0,0,.28);
          display:flex;
          align-items:center;
          justify-content:center;
          position:relative;
          font-family:Arial,sans-serif;
          font-weight:800;
          color:white;
          font-size:11px;
        "
      >
        CAR

        <span
          style="
            position:absolute;
            right:-2px;
            bottom:-2px;
            width:12px;
            height:12px;
            border-radius:50%;
            background:${indicator};
            border:2px solid white;
          "
        ></span>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -22]
  });
}

/* ---------------------------------------------------------
   MAP CONTROLLER
--------------------------------------------------------- */

function MapController({
  drivers,
  selectedDriverId
}) {
  const map = useMap();

  const previousDriverIds =
    useRef('');

  const initialised =
    useRef(false);

  useEffect(() => {
    const points = drivers
      .filter(d =>
        hasValidCoordinates(
          d.location
        )
      )
      .map(d => [
        Number(d.location.latitude),
        Number(d.location.longitude)
      ]);

    if (!points.length) {
      if (!initialised.current) {
        map.setView(
          KADUNA_CENTER,
          KADUNA_ZOOM
        );
      }

      return;
    }

    const driverIds = drivers
      .map(d =>
        String(d.driverId)
      )
      .sort()
      .join(',');

    /*
     * Reposition only when the set of
     * monitored drivers changes.
     *
     * GPS movement itself does not
     * cause the map to jump.
     */
    if (
      !initialised.current ||
      driverIds !==
        previousDriverIds.current
    ) {
      if (points.length === 1) {
        map.setView(
          points[0],
          14
        );
      } else {
        map.fitBounds(
          L.latLngBounds(points),
          {
            padding: [60, 60],
            maxZoom: 14
          }
        );
      }

      initialised.current =
        true;

      previousDriverIds.current =
        driverIds;
    }
  }, [drivers, map]);

  /*
   * Selecting a driver focuses the
   * map on that driver.
   */
  useEffect(() => {
    if (!selectedDriverId) {
      return;
    }

    const driver =
      drivers.find(
        d =>
          String(d.driverId) ===
          String(selectedDriverId)
      );

    if (
      !driver ||
      !hasValidCoordinates(
        driver.location
      )
    ) {
      return;
    }

    map.flyTo(
      [
        Number(
          driver.location.latitude
        ),
        Number(
          driver.location.longitude
        )
      ],
      15,
      {
        duration: 0.8
      }
    );
  }, [
    selectedDriverId,
    drivers,
    map
  ]);

  return null;
}

/* ---------------------------------------------------------
   MAP ACTIONS
--------------------------------------------------------- */

function MapActions({
  drivers
}) {
  const map = useMap();

  function showKaduna() {
    map.flyTo(
      KADUNA_CENTER,
      KADUNA_ZOOM,
      {
        duration: 0.8
      }
    );
  }

  function fitDrivers() {
    const points = drivers
      .filter(d =>
        hasValidCoordinates(
          d.location
        )
      )
      .map(d => [
        Number(d.location.latitude),
        Number(d.location.longitude)
      ]);

    if (!points.length) {
      showKaduna();
      return;
    }

    if (points.length === 1) {
      map.flyTo(
        points[0],
        14,
        {
          duration: 0.8
        }
      );

      return;
    }

    map.fitBounds(
      L.latLngBounds(points),
      {
        padding: [60, 60],
        maxZoom: 14
      }
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        right: 14,
        zIndex: 1000,
        display: 'flex',
        gap: 7,
        flexDirection: 'column'
      }}
    >
      <button
        type="button"
        onClick={fitDrivers}
        style={{
          border:
            '1px solid #ddd',
          background: '#fff',
          borderRadius: 10,
          padding:
            '9px 12px',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 12,
          boxShadow:
            '0 3px 12px rgba(0,0,0,.15)'
        }}
      >
        Fit Drivers
      </button>

      <button
        type="button"
        onClick={showKaduna}
        style={{
          border:
            '1px solid #ddd',
          background: '#fff',
          borderRadius: 10,
          padding:
            '9px 12px',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 12,
          boxShadow:
            '0 3px 12px rgba(0,0,0,.15)'
        }}
      >
        Kaduna
      </button>
    </div>
  );
}

/* ---------------------------------------------------------
   LIVE DRIVER MAP
--------------------------------------------------------- */

function DriverLiveMap({
  drivers,
  now,
  onSelectDriver
}) {
  const [
    selectedDriverId,
    setSelectedDriverId
  ] = useState(null);

  const mappedDrivers =
    drivers.filter(d =>
      hasValidCoordinates(
        d.location
      )
    );

  useEffect(() => {
    if (
      selectedDriverId &&
      !mappedDrivers.some(
        d =>
          String(d.driverId) ===
          String(
            selectedDriverId
          )
      )
    ) {
      setSelectedDriverId(null);
    }
  }, [
    mappedDrivers,
    selectedDriverId
  ]);

  function selectDriver(
    driverId
  ) {
    const id =
      String(driverId);

    setSelectedDriverId(id);

    if (onSelectDriver) {
      onSelectDriver(id);
    }
  }

  return (
    <div
      style={{
        height: 520,
        width: '100%',
        borderRadius: 18,
        overflow: 'hidden',
        border:
          '1px solid #e5e7eb',
        position: 'relative',
        background:
          '#eef1f4'
      }}
    >
      <MapContainer
        center={KADUNA_CENTER}
        zoom={KADUNA_ZOOM}
        scrollWheelZoom
        style={{
          height: '100%',
          width: '100%'
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController
          drivers={
            mappedDrivers
          }
          selectedDriverId={
            selectedDriverId
          }
        />

        <MapActions
          drivers={
            mappedDrivers
          }
        />

        {mappedDrivers.map(
          driver => {
            const active =
              !!driver.trip;

            const gps =
              gpsStatus(
                driver.location,
                now
              );

            const selected =
              String(
                selectedDriverId
              ) ===
              String(
                driver.driverId
              );

            return (
              <Marker
                key={
                  driver.driverId
                }
                position={[
                  Number(
                    driver.location
                      .latitude
                  ),
                  Number(
                    driver.location
                      .longitude
                  )
                ]}
                icon={driverIcon({
                  gps,
                  active
                })}
                eventHandlers={{
                  click: () =>
                    selectDriver(
                      driver.driverId
                    )
                }}
              >
                <Popup>
                  <div
                    style={{
                      minWidth: 270
                    }}
                  >
                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        gap: 12,
                        alignItems:
                          'flex-start'
                      }}
                    >
                      <div>
                        <strong
                          style={{
                            fontSize: 15
                          }}
                        >
                          {driver
                            .driver
                            ?.name ||
                            'Driver'}
                        </strong>

                        <div
                          style={{
                            color:
                              '#6b7280',
                            fontSize: 12,
                            marginTop: 2
                          }}
                        >
                          {driver.vehicleType
                            ? String(
                                driver.vehicleType
                              ).toUpperCase()
                            : 'Vehicle not specified'}
                        </div>
                      </div>

                      <span
                        style={{
                          background:
                            gps ===
                            'live'
                              ? '#dcfce7'
                              : gps ===
                                  'stale'
                                ? '#fef3c7'
                                : '#f3f4f6',
                          color:
                            gps ===
                            'live'
                              ? '#166534'
                              : gps ===
                                  'stale'
                                ? '#92400e'
                                : '#4b5563',
                          borderRadius:
                            999,
                          padding:
                            '4px 8px',
                          fontSize: 10,
                          fontWeight: 800
                        }}
                      >
                        {gpsLabel(
                          gps
                        )}
                      </span>
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        display:
                          'grid',
                        gap: 6,
                        fontSize: 12
                      }}
                    >
                      <div>
                        <b>
                          Status:
                        </b>{' '}
                        {active
                          ? 'On trip'
                          : 'Available'}
                      </div>

                      {driver
                        .driver
                        ?.phone && (
                        <div>
                          <b>
                            Phone:
                          </b>{' '}
                          {
                            driver
                              .driver
                              .phone
                          }
                        </div>
                      )}

                      <div>
                        <b>
                          Accuracy:
                        </b>{' '}
                        {driver
                          .location
                          .accuracy !=
                        null
                          ? `${Math.round(
                              driver
                                .location
                                .accuracy
                            )}m`
                          : 'Unknown'}
                      </div>

                      <div>
                        <b>
                          Last GPS:
                        </b>{' '}
                        {driver
                          .location
                          .updatedAt
                          ? new Date(
                              driver
                                .location
                                .updatedAt
                            ).toLocaleTimeString(
                              'en-NG'
                            )
                          : 'Unknown'}
                      </div>
                    </div>

                    {active &&
                      driver.trip && (
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 10,
                            borderTop:
                              '1px solid #e5e7eb'
                          }}
                        >
                          <b>
                            Active Trip
                          </b>

                          <div
                            style={{
                              marginTop: 5,
                              fontSize: 12
                            }}
                          >
                            {driver
                              .trip
                              .tripId ||
                              'Active trip'}
                          </div>

                          {driver
                            .trip
                            .status && (
                            <div
                              style={{
                                marginTop: 3,
                                fontSize: 12,
                                color:
                                  '#6b7280'
                              }}
                            >
                              {String(
                                driver
                                  .trip
                                  .status
                              ).replaceAll(
                                '_',
                                ' '
                              )}
                            </div>
                          )}

                          {driver
                            .trip
                            .rider
                            ?.fullName && (
                            <div
                              style={{
                                marginTop: 3,
                                fontSize: 12
                              }}
                            >
                              Rider:{' '}
                              {
                                driver
                                  .trip
                                  .rider
                                  .fullName
                              }
                            </div>
                          )}
                        </div>
                      )}

                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop:
                          '1px solid #e5e7eb',
                        fontSize: 11,
                        color:
                          gps ===
                          'live'
                            ? '#15803d'
                            : '#92400e',
                        fontWeight: 700
                      }}
                    >
                      {gps ===
                      'live'
                        ? 'Live GPS connection active'
                        : gps ===
                            'stale'
                          ? 'GPS update is stale'
                          : 'Waiting for GPS'}
                    </div>

                    {selected && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 10,
                          color:
                            '#6b7280'
                        }}
                      >
                        Driver selected
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          }
        )}
      </MapContainer>

      {/* Map legend */}
      <div
        style={{
          position:
            'absolute',
          left: 14,
          bottom: 14,
          zIndex: 1000,
          background:
            'rgba(255,255,255,.96)',
          borderRadius: 12,
          padding:
            '9px 12px',
          boxShadow:
            '0 4px 16px rgba(0,0,0,.14)',
          fontSize: 11,
          display: 'flex',
          gap: 12,
          flexWrap:
            'wrap'
        }}
      >
        <span>
          <b
            style={{
              color:
                '#16a34a'
            }}
          >
            ●
          </b>{' '}
          GPS Live
        </span>

        <span>
          <b
            style={{
              color:
                '#f59e0b'
            }}
          >
            ●
          </b>{' '}
          GPS Stale
        </span>

        <span>
          <b
            style={{
              color:
                '#6b7280'
            }}
          >
            ●
          </b>{' '}
          No GPS
        </span>

        <span>
          <b>
            {
              mappedDrivers.length
            }
          </b>{' '}
          drivers mapped
        </span>
      </div>

      {/* Empty map state */}
      {mappedDrivers.length ===
        0 && (
        <div
          style={{
            position:
              'absolute',
            inset: 0,
            zIndex: 900,
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            pointerEvents:
              'none'
          }}
        >
          <div
            style={{
              background:
                'rgba(255,255,255,.96)',
              padding:
                '20px 26px',
              borderRadius: 14,
              boxShadow:
                '0 8px 30px rgba(0,0,0,.12)',
              textAlign:
                'center'
            }}
          >
            <MapPin
              size={30}
            />

            <h3
              style={{
                margin:
                  '8px 0 5px'
              }}
            >
              No live driver
              locations
            </h3>

            <p
              style={{
                margin: 0,
                color: '#666',
                fontSize: 13
              }}
            >
              Approved online
              drivers will
              appear here when
              GPS data is
              received.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   DRIVER STATUS LIST
--------------------------------------------------------- */

function DriverStatusList({
  drivers,
  now,
  onSelectDriver
}) {
  if (!drivers.length) {
    return (
      <div
        style={{
          padding:
            '20px 0 4px',
          color:
            '#6b7280'
        }}
      >
        No approved drivers
        are currently
        online.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 18,
        display: 'grid',
        gridTemplateColumns:
          'repeat(auto-fit,minmax(260px,1fr))',
        gap: 12
      }}
    >
      {drivers.map(
        driver => {
          const gps =
            gpsStatus(
              driver.location,
              now
            );

          const active =
            !!driver.trip;

          const updatedAt =
            getLocationTime(
              driver.location
            );

          const secondsAgo =
            updatedAt
              ? Math.max(
                  0,
                  Math.floor(
                    (now -
                      updatedAt) /
                      1000
                  )
                )
              : null;

          return (
            <button
              type="button"
              key={
                driver.driverId
              }
              onClick={() =>
                onSelectDriver?.(
                  String(
                    driver.driverId
                  )
                )
              }
              style={{
                textAlign:
                  'left',
                border:
                  '1px solid #e5e7eb',
                borderRadius: 14,
                padding: 14,
                background:
                  '#fff',
                cursor:
                  'pointer'
              }}
            >
              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'space-between',
                  gap: 12,
                  alignItems:
                    'flex-start'
                }}
              >
                <div>
                  <strong>
                    {driver
                      .driver
                      ?.name ||
                      'Unknown driver'}
                  </strong>

                  <div
                    style={{
                      fontSize: 12,
                      color:
                        '#6b7280',
                      marginTop: 3
                    }}
                  >
                    {driver.vehicleType
                      ? String(
                          driver.vehicleType
                        ).toUpperCase()
                      : 'Vehicle not specified'}
                  </div>
                </div>

                <Badge
                  tone={gpsTone(
                    gps
                  )}
                >
                  {gpsLabel(
                    gps
                  )}
                </Badge>
              </div>

              <div
                style={{
                  display:
                    'flex',
                  gap: 12,
                  flexWrap:
                    'wrap',
                  marginTop: 12,
                  fontSize: 13
                }}
              >
                <span>
                  <b>
                    Trip:
                  </b>{' '}
                  {active
                    ? 'On trip'
                    : 'Available'}
                </span>

                {driver.location
                  ?.accuracy !=
                  null && (
                  <span>
                    <b>
                      Accuracy:
                    </b>{' '}
                    {Math.round(
                      driver
                        .location
                        .accuracy
                    )}
                    m
                  </span>
                )}
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color:
                    gps ===
                    'live'
                      ? '#15803d'
                      : '#b45309',
                  display:
                    'flex',
                  alignItems:
                    'center',
                  gap: 5
                }}
              >
                <Clock3
                  size={13}
                />

                {secondsAgo ==
                null
                  ? 'No GPS update received'
                  : secondsAgo <
                      2
                    ? 'Updated just now'
                    : `Updated ${secondsAgo}s ago`}
              </div>

              {active &&
                driver.trip && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop:
                        '1px solid #f1f5f9',
                      fontSize: 12,
                      color:
                        '#4b5563'
                    }}
                  >
                    <b>
                      {driver
                        .trip
                        .tripId ||
                        'Active trip'}
                    </b>

                    {driver
                      .trip
                      .status && (
                      <div>
                        {String(
                          driver
                            .trip
                            .status
                        ).replaceAll(
                          '_',
                          ' '
                        )}
                      </div>
                    )}
                  </div>
                )}
            </button>
          );
        }
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   ADMIN DASHBOARD
--------------------------------------------------------- */

export default function AdminDashboard() {
  const {
    socket
  } = useApp();

  const [d, setD] =
    useState(null);

  const [err, setErr] =
    useState('');

  const [drivers, setDrivers] =
    useState([]);

  const [
    mapLoading,
    setMapLoading
  ] = useState(true);

  const [now, setNow] =
    useState(Date.now());

  async function load() {
    try {
      const r =
        await api(
          '/admin/dashboard'
        );

      setD(r.data);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }

  async function loadDrivers() {
    try {
      setMapLoading(
        true
      );

      const r =
        await api(
          '/admin/drivers?status=approved&online=true'
        );

      const items =
        r.data?.drivers ||
        [];

      setDrivers(
        items
          .filter(
            item =>
              item.user
          )
          .map(item => ({
            driverId:
              String(
                item.user._id
              ),

            driver: {
              id: String(
                item.user._id
              ),
              name:
                item.user
                  .fullName,
              phone:
                item.user
                  .phone,
              role:
                item.user
                  .role,
              status:
                item.user
                  .status
            },

            vehicleType:
              item.vehicleType,

            location:
              item.location ||
              null,

            trip: null
          }))
      );
    } catch (e) {
      console.error(
        'Driver map load failed:',
        e
      );
    } finally {
      setMapLoading(
        false
      );
    }
  }

  useEffect(() => {
    load();
    loadDrivers();
  }, []);

  /*
   * Update the local clock every
   * five seconds so stale GPS
   * status remains accurate.
   */
  useEffect(() => {
    const timer =
      setInterval(
        () =>
          setNow(
            Date.now()
          ),
        5000
      );

    return () =>
      clearInterval(
        timer
      );
  }, []);

  /*
   * Socket.IO realtime events.
   */
  useEffect(() => {
    if (!socket) {
      return;
    }

    const onSnapshot =
      payload => {
        if (
          !Array.isArray(
            payload?.drivers
          )
        ) {
          return;
        }

        setDrivers(
          payload.drivers.map(
            driver => ({
              ...driver,
              driverId:
                String(
                  driver.driverId
                )
            })
          )
        );

        setMapLoading(
          false
        );
      };

    const onLocation =
      payload => {
        if (
          !payload?.driverId ||
          !payload?.location
        ) {
          return;
        }

        const driverId =
          String(
            payload.driverId
          );

        setDrivers(
          current => {
            const existing =
              current.find(
                d =>
                  String(
                    d.driverId
                  ) ===
                  driverId
              );

            if (!existing) {
              return [
                ...current,
                {
                  driverId,
                  driver:
                    payload.driver ||
                    null,
                  location:
                    payload.location,
                  trip:
                    payload.trip ||
                    null
                }
              ];
            }

            return current.map(
              d =>
                String(
                  d.driverId
                ) === driverId
                  ? {
                      ...d,
                      driver:
                        payload.driver ||
                        d.driver,
                      location:
                        payload.location,
                      trip:
                        payload.trip ||
                        null
                    }
                  : d
            );
          }
        );

        setNow(
          Date.now()
        );
      };

    const onTrip =
      payload => {
        const trip =
          payload?.trip;

        if (!trip?.driver) {
          load();
          return;
        }

        const driverId =
          String(
            trip.driver._id ||
              trip.driver
          );

        setDrivers(
          current =>
            current.map(
              driver =>
                String(
                  driver.driverId
                ) ===
                driverId
                  ? {
                      ...driver,
                      trip:
                        activeTripStatuses.includes(
                          trip.status
                        )
                          ? trip
                          : null
                    }
                  : driver
            )
        );

        load();
      };

    socket.on(
      'drivers:locations',
      onSnapshot
    );

    socket.on(
      'driver:location',
      onLocation
    );

    socket.on(
      'trip:updated',
      onTrip
    );

    return () => {
      socket.off(
        'drivers:locations',
        onSnapshot
      );

      socket.off(
        'driver:location',
        onLocation
      );

      socket.off(
        'trip:updated',
        onTrip
      );
    };
  }, [socket]);

  const onlineCount =
    drivers.length;

  const activeTripCount =
    useMemo(
      () =>
        drivers.filter(
          d =>
            activeTripStatuses.includes(
              d.trip?.status
            )
        ).length,
      [drivers]
    );

  const availableCount =
    Math.max(
      0,
      onlineCount -
        activeTripCount
    );

  const liveGpsCount =
    useMemo(
      () =>
        drivers.filter(
          d =>
            isGpsLive(
              d.location,
              now
            )
        ).length,
      [drivers, now]
    );

  const staleCount =
    useMemo(
      () =>
        drivers.filter(
          d =>
            gpsStatus(
              d.location,
              now
            ) === 'stale'
        ).length,
      [drivers, now]
    );

  const noGpsCount =
    useMemo(
      () =>
        drivers.filter(
          d =>
            gpsStatus(
              d.location,
              now
            ) === 'no-gps'
        ).length,
      [drivers, now]
    );

  const s =
    d?.stats;

  return (
    <AdminLayout>
      <PageHeader
        title="Admin Dashboard"
        subtitle="Live operational data from Kaduna Only."
        action={
          <Button
            onClick={() => {
              load();
              loadDrivers();
            }}
            variant="secondary"
          >
            <RefreshCw
              size={16}
            />
            Refresh
          </Button>
        }
      />

      {err && (
        <div className="notice danger">
          <b>
            Dashboard error
          </b>

          <p>{err}</p>
        </div>
      )}

      <div className="notice success">
        <b
          style={{
            display:
              'flex',
            alignItems:
              'center',
            gap: 6
          }}
        >
          <Radio
            size={15}
          />

          Real-time
          operations
          enabled
        </b>

        <p>
          Driver locations
          and trip activity
          update automatically
          through the live
          connection.
        </p>
      </div>

      <div className="stats">
        <Stat
          title="Users"
          value={
            s?.users ?? '—'
          }
          icon={Users}
          meta={
            s
              ? `${s.riders} riders · ${s.drivers} drivers`
              : ''
          }
        />

        <Stat
          title="Trips"
          value={
            s?.trips ?? '—'
          }
          icon={
            ClipboardList
          }
          meta={
            s
              ? `${s.activeTrips} currently active`
              : ''
          }
        />

        <Stat
          title="Online drivers"
          value={
            onlineCount
          }
          icon={Car}
          meta={`${availableCount} available · ${activeTripCount} on trip`}
        />

        <Stat
          title="Kaduna Only revenue"
          value={
            s
              ? formatMoney(
                  s.revenue
                )
              : '—'
          }
          icon={Wallet}
          meta={
            s
              ? `Today ${formatMoney(
                  s.todayRevenue
                )}`
              : ''
          }
        />
      </div>

      {/* LIVE DRIVER MONITOR */}

      <div
        className="panel"
        style={{
          marginBottom: 16
        }}
      >
        <div
          style={{
            display:
              'flex',
            justifyContent:
              'space-between',
            alignItems:
              'center',
            gap: 16,
            marginBottom: 14,
            flexWrap:
              'wrap'
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                display:
                  'flex',
                alignItems:
                  'center',
                gap: 8
              }}
            >
              <Navigation
                size={19}
              />

              Live Driver
              Monitoring
            </h3>

            <p
              className="muted"
              style={{
                marginBottom:
                  0
              }}
            >
              Live GPS positions
              from approved
              online drivers.
              GPS status is
              tracked separately
              from online status.
            </p>
          </div>

          <div
            style={{
              display:
                'flex',
              gap: 8,
              flexWrap:
                'wrap'
            }}
          >
            <Badge
              tone="success"
            >
              <Circle
                size={8}
                fill="currentColor"
                style={{
                  marginRight: 5
                }}
              />

              {onlineCount}{' '}
              Online
            </Badge>

            <Badge
              tone="success"
            >
              {liveGpsCount}{' '}
              GPS Live
            </Badge>

            <Badge
              tone="success"
            >
              {availableCount}{' '}
              Available
            </Badge>

            <Badge
              tone="warning"
            >
              {activeTripCount}{' '}
              On Trip
            </Badge>

            {staleCount >
              0 && (
              <Badge
                tone="danger"
              >
                {staleCount}{' '}
                GPS Stale
              </Badge>
            )}

            {noGpsCount >
              0 && (
              <Badge
                tone="warning"
              >
                {noGpsCount}{' '}
                No GPS
              </Badge>
            )}
          </div>
        </div>

        {mapLoading ? (
          <div
            style={{
              height: 520,
              display:
                'flex',
              alignItems:
                'center',
              justifyContent:
                'center'
            }}
          >
            <RefreshCw
              size={28}
              className="spin"
            />
          </div>
        ) : (
          <>
            <DriverLiveMap
              drivers={drivers}
              now={now}
            />

            <DriverStatusList
              drivers={drivers}
              now={now}
            />
          </>
        )}
      </div>

      <div className="admin-grid">
        <div className="panel admin-hero">
          <span>
            Driver approvals
          </span>

          <strong>
            {s?.pendingDrivers ??
              '—'}
          </strong>

          <p>
            Driver accounts
            waiting for
            verification.
          </p>

          <a href="/admin/drivers">
            Review drivers{' '}
            <ArrowRight
              size={15}
            />
          </a>
        </div>

        <div className="panel">
          <h3>
            Platform activity
          </h3>

          <div className="system-row">
            <span className="green-dot" />

            Completed trips:{' '}
            {s?.completedTrips ??
              '—'}
          </div>

          <div className="system-row">
            <span className="green-dot" />

            Gross trip value:{' '}
            {s
              ? formatMoney(
                  s.grossFare
                )
              : '—'}
          </div>

          <div className="system-row">
            <span className="green-dot" />

            Month commission:{' '}
            {s
              ? formatMoney(
                  s.monthRevenue
                )
              : '—'}
          </div>

          <div className="system-row">
            <Coins
              size={14}
            />

            Flat fee:{' '}
            {s
              ? formatMoney(
                  s.flatCommission
                )
              : '—'}{' '}
            / completed trip
          </div>

          {s?.dueCommission >
            0 && (
            <div className="system-row">
              <span className="orange-dot" />

              Cash-trip fees due:{' '}
              {formatMoney(
                s.dueCommission
              )}{' '}
              (
              {
                s.dueCommissionTrips
              }{' '}
              trips)
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>
          Recent trips
        </h3>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  Trip
                </th>
                <th>
                  Rider
                </th>
                <th>
                  Driver
                </th>
                <th>
                  Route
                </th>
                <th>
                  Fare
                </th>
                <th>
                  Fee
                </th>
                <th>
                  Status
                </th>
              </tr>
            </thead>

            <tbody>
              {(
                d?.recentTrips ||
                []
              ).map(x => (
                <tr
                  key={x._id}
                >
                  <td>
                    {x.tripId}
                  </td>

                  <td>
                    {x.rider
                      ?.fullName ||
                      '—'}
                  </td>

                  <td>
                    {x.driver
                      ?.fullName ||
                      'Unassigned'}
                  </td>

                  <td>
                    {x.pickup
                      ?.label}{' '}
                    →{' '}
                    {x.destination
                      ?.label}
                  </td>

                  <td>
                    {formatMoney(
                      x.fare
                    )}
                  </td>

                  <td>
                    {x.status ===
                    'TRIP_COMPLETED'
                      ? formatMoney(
                          x.platformCommission ||
                            s?.flatCommission ||
                            0
                        )
                      : '—'}
                  </td>

                  <td>
                    <Badge
                      tone={statusTone(
                        x.status
                      )}
                    >
                      {String(
                        x.status
                      ).replaceAll(
                        '_',
                        ' '
                      )}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}