import { describe, expect, it } from 'vitest';
import {
  computeTodayStats,
  needsActionSentence,
  renderDriversNowTbody,
  renderFleetNowTbody,
  renderTodayPartial,
  type DriversNowRow,
  type FleetNowRow,
  type NeedsBooking,
} from './today-board';

const fleet: FleetNowRow[] = [
  {
    vehicle_id: 'v1',
    vehicle_label: 'V-Class #1',
    class_name: 'V-Class',
    vehicle_status: 'active',
    shift_id: 's1',
    shift_started_at: '2026-12-01T05:30:00Z',
    driver_id: 'd1',
    driver_name: 'Alex Driver',
    current_reference: 'ELP-AAAAAA',
    current_trip_status: 'on_board',
    next_reference: 'ELP-BBBBBB',
    next_pickup_at: '2026-12-01T12:00:00Z',
    last_update_at: '2026-12-01T08:52:00Z',
  },
  {
    vehicle_id: 'v2',
    vehicle_label: 'E-Class #2',
    class_name: 'E-Class',
    vehicle_status: 'active',
    shift_id: null,
    shift_started_at: null,
    driver_id: null,
    driver_name: null,
    current_reference: null,
    current_trip_status: null,
    next_reference: 'ELP-CCCCCC',
    next_pickup_at: '2026-12-01T14:00:00Z',
    last_update_at: null,
  },
];

const drivers: DriversNowRow[] = [
  {
    driver_id: 'd1',
    full_name: 'Alex Driver',
    shift_id: 's1',
    shift_started_at: '2026-12-01T05:30:00Z',
    vehicle_label: 'V-Class #1',
    current_reference: 'ELP-AAAAAA',
    current_trip_status: 'on_board',
    next_reference: 'ELP-BBBBBB',
    next_pickup_at: '2026-12-01T12:00:00Z',
    jobs_today: 4,
    licence_expires_on: null,
    permit_expires_on: null,
  },
  {
    driver_id: 'd2',
    full_name: 'Dina Driver',
    shift_id: null,
    shift_started_at: null,
    vehicle_label: null,
    current_reference: null,
    current_trip_status: null,
    next_reference: null,
    next_pickup_at: null,
    jobs_today: 0,
    licence_expires_on: null,
    permit_expires_on: null,
  },
];

describe('today board partial rendering', () => {
  it('renders fleet and drivers tbody HTML with trip badges and links', () => {
    const fleetHtml = renderFleetNowTbody(fleet);
    expect(fleetHtml).toContain('V-Class #1');
    expect(fleetHtml).toContain('Alex Driver');
    expect(fleetHtml).toContain('trip-on_board');
    expect(fleetHtml).toContain('/bookings/ELP-AAAAAA');
    expect(fleetHtml).toContain('Not on shift');
    expect(fleetHtml).toContain('no driver');

    const driversHtml = renderDriversNowTbody(drivers);
    expect(driversHtml).toContain('/drivers/d1');
    expect(driversHtml).toContain('Passenger on board');
    expect(driversHtml).toContain('Off');
    expect(driversHtml).toContain('>4<');
  });

  it('partial wrapper exposes both bodies and an updated stamp', () => {
    const html = renderTodayPartial({ fleet, drivers, updatedLabel: '10:53' });
    expect(html).toContain('id="today-partial"');
    expect(html).toContain('data-updated="10:53"');
    expect(html).toContain('id="fleet-now-body"');
    expect(html).toContain('id="drivers-now-body"');
  });

  it('computes stats and needs-action copy', () => {
    const needs: NeedsBooking[] = [
      { reference: 'ELP-NEED1', pickup_at: '2026-12-01T14:00:00Z', missing: 'driver' },
      { reference: 'ELP-NEED2', pickup_at: '2026-12-01T15:15:00Z', missing: 'vehicle' },
    ];
    const stats = computeTodayStats({
      driversNow: drivers,
      fleetNow: fleet,
      jobsClosed: 4,
      jobsTotal: 9,
      needs,
    });
    expect(stats).toEqual({
      onShift: 1,
      activeDrivers: 2,
      vehiclesOut: 1,
      vehiclesTotal: 2,
      jobsClosed: 4,
      jobsTotal: 9,
      needsCount: 2,
    });
    const sentence = needsActionSentence(needs);
    expect(sentence).toContain('ELP-NEED1');
    expect(sentence).toContain('no driver');
    expect(sentence).toContain('ELP-NEED2');
    expect(sentence).toContain('no vehicle');
  });
});
