/** Map DB / RPC rows to OpenAPI camelCase shapes. */

type JobRow = {
  reference: string;
  booking_type: string;
  status: string;
  trip_status: string;
  pickup_at: string;
  ends_at: string;
  from_zone: string;
  to_zone: string | null;
  pickup_address: string;
  dropoff_address: string | null;
  hours: number | null;
  flight_number: string | null;
  passengers: number;
  luggage: number;
  customer_name: string;
  customer_phone: string | null;
  notes: string | null;
  class_name: string;
  vehicle_label: string | null;
  vip_security: boolean;
  extras: string[] | null;
};

export function mapJob(r: JobRow) {
  return {
    reference: r.reference,
    bookingType: r.booking_type,
    status: r.status,
    tripStatus: r.trip_status,
    pickupAt: r.pickup_at,
    endsAt: r.ends_at,
    fromZone: r.from_zone,
    toZone: r.to_zone,
    pickupAddress: r.pickup_address,
    dropoffAddress: r.dropoff_address,
    hours: r.hours,
    flightNumber: r.flight_number,
    passengers: r.passengers,
    luggage: r.luggage,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    notes: r.notes,
    className: r.class_name,
    vehicleLabel: r.vehicle_label,
    vipSecurity: r.vip_security,
    extras: r.extras ?? [],
  };
}

export function mapVehicle(r: { id: string; label: string; class_name: string; plate: string | null }) {
  return { id: r.id, label: r.label, className: r.class_name, plate: r.plate };
}

export function mapShift(r: {
  id: string;
  vehicle_id: string;
  started_at: string;
  ended_at: string | null;
  start_odometer: number | null;
  end_odometer: number | null;
}) {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    startOdometer: r.start_odometer,
    endOdometer: r.end_odometer,
  };
}

export function mapEarningLine(r: {
  kind: string;
  on_date: string;
  reference: string | null;
  description: string;
  quantity: number;
  rate_cents: number | null;
  amount_cents: number;
}) {
  return {
    kind: r.kind,
    onDate: r.on_date,
    reference: r.reference,
    description: r.description,
    quantity: Number(r.quantity),
    rateCents: r.rate_cents,
    amountCents: r.amount_cents,
  };
}
