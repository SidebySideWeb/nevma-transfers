export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "blocked_slots": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"range": unknown,"reason": string | null,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"range": unknown,"reason"?: string | null,"vehicle_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"range"?: unknown,"reason"?: string | null,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocked_slots_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "fleet_now"
      referencedColumns: ["vehicle_id"]
    },{
      foreignKeyName: "blocked_slots_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_events": {
                  Row: {
                    "at": string,"booking_id": string,"created_by": string | null,"driver_id": string | null,"id": number,"kind": string,"note": string | null,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"booking_id": string,"created_by"?: string | null,"driver_id"?: string | null,"id"?: never,"kind": string,"note"?: string | null,"source": string
                  }
                  Update: {
                    "at"?: string,"booking_id"?: string,"created_by"?: string | null,"driver_id"?: string | null,"id"?: never,"kind"?: string,"note"?: string | null,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_events_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_events_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_events_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers_now"
      referencedColumns: ["driver_id"]
    },{
      foreignKeyName: "booking_events_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "fleet_now"
      referencedColumns: ["driver_id"]
    }
                  ]
                },"booking_extras": {
                  Row: {
                    "booking_id": string,"extra_id": string,"price_cents": number,"quantity": number
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id": string,"extra_id": string,"price_cents": number,"quantity"?: number
                  }
                  Update: {
                    "booking_id"?: string,"extra_id"?: string,"price_cents"?: number,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_extras_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_extras_extra_id_fkey"
      columns: ["extra_id"]
isOneToOne: false
      referencedRelation: "extras"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "base_price_cents": number,"blocked_range": unknown,"booking_type": Database["public"]['Enums']["booking_type"],"cancel_token_hash": string | null,"cancelled_at": string | null,"class_id": string,"created_at": string,"created_by": string | null,"currency": string,"customer_email": string,"customer_id": string | null,"customer_name": string,"customer_phone": string,"driver_id": string | null,"dropoff_address": string | null,"dropoff_lat": number | null,"dropoff_lng": number | null,"dropoff_place_id": string | null,"duration_minutes": number,"flight_number": string | null,"from_zone_id": string,"hold_expires_at": string | null,"hours": number | null,"id": string,"invoice_address": string | null,"invoice_company": string | null,"invoice_number": string | null,"invoice_status": Database["public"]['Enums']["invoice_status"],"invoice_tax_office": string | null,"invoice_vat": string | null,"list_price_cents": number | null,"luggage": number,"notes": string | null,"passengers": number,"payment_method": string | null,"payment_status": Database["public"]['Enums']["payment_status"],"pickup_address": string,"pickup_at": string,"pickup_lat": number | null,"pickup_lng": number | null,"pickup_place_id": string | null,"price_cents": number,"price_override_reason": string | null,"reference": string,"reminder_sent_at": string | null,"security_notes": string | null,"source": string,"status": Database["public"]['Enums']["booking_status"],"to_zone_id": string | null,"trip_status": string,"updated_at": string,"vat_cents": number | null,"vat_rate_bp": number,"vehicle_auto_assigned": boolean,"vehicle_id": string | null,"vip_security": boolean,"visitor_key": string | null,"viva_order_code": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "base_price_cents": number,"blocked_range": unknown,"booking_type": Database["public"]['Enums']["booking_type"],"cancel_token_hash"?: string | null,"cancelled_at"?: string | null,"class_id": string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_email": string,"customer_id"?: string | null,"customer_name": string,"customer_phone": string,"driver_id"?: string | null,"dropoff_address"?: string | null,"dropoff_lat"?: number | null,"dropoff_lng"?: number | null,"dropoff_place_id"?: string | null,"duration_minutes": number,"flight_number"?: string | null,"from_zone_id": string,"hold_expires_at"?: string | null,"hours"?: number | null,"id"?: string,"invoice_address"?: string | null,"invoice_company"?: string | null,"invoice_number"?: string | null,"invoice_status"?: Database["public"]['Enums']["invoice_status"],"invoice_tax_office"?: string | null,"invoice_vat"?: string | null,"list_price_cents"?: number | null,"luggage"?: number,"notes"?: string | null,"passengers": number,"payment_method"?: string | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"pickup_address": string,"pickup_at": string,"pickup_lat"?: number | null,"pickup_lng"?: number | null,"pickup_place_id"?: string | null,"price_cents": number,"price_override_reason"?: string | null,"reference"?: string,"reminder_sent_at"?: string | null,"security_notes"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["booking_status"],"to_zone_id"?: string | null,"trip_status"?: string,"updated_at"?: string,"vat_cents"?: never,"vat_rate_bp": number,"vehicle_auto_assigned"?: boolean,"vehicle_id"?: string | null,"vip_security"?: boolean,"visitor_key"?: string | null,"viva_order_code"?: number | null
                  }
                  Update: {
                    "base_price_cents"?: number,"blocked_range"?: unknown,"booking_type"?: Database["public"]['Enums']["booking_type"],"cancel_token_hash"?: string | null,"cancelled_at"?: string | null,"class_id"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_email"?: string,"customer_id"?: string | null,"customer_name"?: string,"customer_phone"?: string,"driver_id"?: string | null,"dropoff_address"?: string | null,"dropoff_lat"?: number | null,"dropoff_lng"?: number | null,"dropoff_place_id"?: string | null,"duration_minutes"?: number,"flight_number"?: string | null,"from_zone_id"?: string,"hold_expires_at"?: string | null,"hours"?: number | null,"id"?: string,"invoice_address"?: string | null,"invoice_company"?: string | null,"invoice_number"?: string | null,"invoice_status"?: Database["public"]['Enums']["invoice_status"],"invoice_tax_office"?: string | null,"invoice_vat"?: string | null,"list_price_cents"?: number | null,"luggage"?: number,"notes"?: string | null,"passengers"?: number,"payment_method"?: string | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"pickup_address"?: string,"pickup_at"?: string,"pickup_lat"?: number | null,"pickup_lng"?: number | null,"pickup_place_id"?: string | null,"price_cents"?: number,"price_override_reason"?: string | null,"reference"?: string,"reminder_sent_at"?: string | null,"security_notes"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["booking_status"],"to_zone_id"?: string | null,"trip_status"?: string,"updated_at"?: string,"vat_cents"?: never,"vat_rate_bp"?: number,"vehicle_auto_assigned"?: boolean,"vehicle_id"?: string | null,"vip_security"?: boolean,"visitor_key"?: string | null,"viva_order_code"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "vehicle_classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "bookings_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers_now"
      referencedColumns: ["driver_id"]
    },{
      foreignKeyName: "bookings_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "fleet_now"
      referencedColumns: ["driver_id"]
    },{
      foreignKeyName: "bookings_from_zone_id_fkey"
      columns: ["from_zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_to_zone_id_fkey"
      columns: ["to_zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "fleet_now"
      referencedColumns: ["vehicle_id"]
    },{
      foreignKeyName: "bookings_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "address": string | null,"bookings_count": number,"company": string | null,"created_at": string,"email": string,"first_booking_at": string | null,"id": string,"last_booking_at": string | null,"name": string,"notes": string | null,"phone": string | null,"tax_office": string | null,"updated_at": string,"vat_number": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"bookings_count"?: number,"company"?: string | null,"created_at"?: string,"email": string,"first_booking_at"?: string | null,"id"?: string,"last_booking_at"?: string | null,"name": string,"notes"?: string | null,"phone"?: string | null,"tax_office"?: string | null,"updated_at"?: string,"vat_number"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"bookings_count"?: number,"company"?: string | null,"created_at"?: string,"email"?: string,"first_booking_at"?: string | null,"id"?: string,"last_booking_at"?: string | null,"name"?: string,"notes"?: string | null,"phone"?: string | null,"tax_office"?: string | null,"updated_at"?: string,"vat_number"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"driver_pay_adjustments": {
                  Row: {
                    "amount_cents": number,"booking_id": string | null,"created_at": string,"created_by": string | null,"driver_id": string,"id": string,"kind": string,"note": string,"on_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"booking_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"driver_id": string,"id"?: string,"kind": string,"note": string,"on_date": string
                  }
                  Update: {
                    "amount_cents"?: number,"booking_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"driver_id"?: string,"id"?: string,"kind"?: string,"note"?: string,"on_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_pay_adjustments_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_pay_adjustments_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_pay_adjustments_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers_now"
      referencedColumns: ["driver_id"]
    },{
      foreignKeyName: "driver_pay_adjustments_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "fleet_now"
      referencedColumns: ["driver_id"]
    }
                  ]
                },"driver_pay_plans": {
                  Row: {
                    "created_at": string,"daily_rate_cents": number,"driver_id": string,"hourly_basis": string,"hourly_rate_cents": number,"id": string,"monthly_salary_cents": number,"note": string | null,"per_transfer_cents": number,"percent_base": string,"percent_bp": number,"valid_from": string,"valid_to": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"daily_rate_cents"?: number,"driver_id": string,"hourly_basis"?: string,"hourly_rate_cents"?: number,"id"?: string,"monthly_salary_cents"?: number,"note"?: string | null,"per_transfer_cents"?: number,"percent_base"?: string,"percent_bp"?: number,"valid_from": string,"valid_to"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"daily_rate_cents"?: number,"driver_id"?: string,"hourly_basis"?: string,"hourly_rate_cents"?: number,"id"?: string,"monthly_salary_cents"?: number,"note"?: string | null,"per_transfer_cents"?: number,"percent_base"?: string,"percent_bp"?: number,"valid_from"?: string,"valid_to"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_pay_plans_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_pay_plans_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers_now"
      referencedColumns: ["driver_id"]
    },{
      foreignKeyName: "driver_pay_plans_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "fleet_now"
      referencedColumns: ["driver_id"]
    }
                  ]
                },"driver_pay_rates": {
                  Row: {
                    "amount_cents": number,"class_id": string | null,"from_zone_id": string | null,"id": string,"plan_id": string,"to_zone_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"class_id"?: string | null,"from_zone_id"?: string | null,"id"?: string,"plan_id": string,"to_zone_id"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"class_id"?: string | null,"from_zone_id"?: string | null,"id"?: string,"plan_id"?: string,"to_zone_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_pay_rates_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "vehicle_classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_pay_rates_from_zone_id_fkey"
      columns: ["from_zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_pay_rates_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "driver_pay_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_pay_rates_to_zone_id_fkey"
      columns: ["to_zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_shifts": {
                  Row: {
                    "driver_id": string,"end_odometer": number | null,"ended_at": string | null,"id": string,"note": string | null,"source": string,"start_odometer": number | null,"started_at": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "driver_id": string,"end_odometer"?: number | null,"ended_at"?: string | null,"id"?: string,"note"?: string | null,"source"?: string,"start_odometer"?: number | null,"started_at"?: string,"vehicle_id": string
                  }
                  Update: {
                    "driver_id"?: string,"end_odometer"?: number | null,"ended_at"?: string | null,"id"?: string,"note"?: string | null,"source"?: string,"start_odometer"?: number | null,"started_at"?: string,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_shifts_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_shifts_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers_now"
      referencedColumns: ["driver_id"]
    },{
      foreignKeyName: "driver_shifts_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "fleet_now"
      referencedColumns: ["driver_id"]
    },{
      foreignKeyName: "driver_shifts_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "fleet_now"
      referencedColumns: ["vehicle_id"]
    },{
      foreignKeyName: "driver_shifts_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_statement_lines": {
                  Row: {
                    "amount_cents": number,"description": string,"id": number,"kind": string,"on_date": string,"quantity": number,"rate_cents": number | null,"reference": string | null,"statement_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"description": string,"id"?: never,"kind": string,"on_date": string,"quantity": number,"rate_cents"?: number | null,"reference"?: string | null,"statement_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"description"?: string,"id"?: never,"kind"?: string,"on_date"?: string,"quantity"?: number,"rate_cents"?: number | null,"reference"?: string | null,"statement_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_statement_lines_statement_id_fkey"
      columns: ["statement_id"]
isOneToOne: false
      referencedRelation: "driver_statements"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_statements": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"driver_id": string,"id": string,"paid_at": string | null,"payment_reference": string | null,"period_from": string,"period_to": string,"status": string,"total_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"driver_id": string,"id"?: string,"paid_at"?: string | null,"payment_reference"?: string | null,"period_from": string,"period_to": string,"status"?: string,"total_cents"?: number
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"driver_id"?: string,"id"?: string,"paid_at"?: string | null,"payment_reference"?: string | null,"period_from"?: string,"period_to"?: string,"status"?: string,"total_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_statements_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_statements_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers_now"
      referencedColumns: ["driver_id"]
    },{
      foreignKeyName: "driver_statements_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "fleet_now"
      referencedColumns: ["driver_id"]
    }
                  ]
                },"drivers": {
                  Row: {
                    "active": boolean,"created_at": string,"email": string,"employment": string,"full_name": string,"id": string,"licence_expires_on": string | null,"licence_number": string | null,"notes": string | null,"permit_expires_on": string | null,"phone": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"email": string,"employment"?: string,"full_name": string,"id"?: string,"licence_expires_on"?: string | null,"licence_number"?: string | null,"notes"?: string | null,"permit_expires_on"?: string | null,"phone": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"email"?: string,"employment"?: string,"full_name"?: string,"id"?: string,"licence_expires_on"?: string | null,"licence_number"?: string | null,"notes"?: string | null,"permit_expires_on"?: string | null,"phone"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"extras": {
                  Row: {
                    "active": boolean,"applies_to": (string)[],"code": string,"id": string,"is_demo": boolean,"max_quantity": number,"name": string,"price_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"applies_to"?: (string)[],"code": string,"id"?: string,"is_demo"?: boolean,"max_quantity"?: number,"name": string,"price_cents": number
                  }
                  Update: {
                    "active"?: boolean,"applies_to"?: (string)[],"code"?: string,"id"?: string,"is_demo"?: boolean,"max_quantity"?: number,"name"?: string,"price_cents"?: number
                  }
                  Relationships: [
                    
                  ]
                },"hourly_rates": {
                  Row: {
                    "class_id": string,"currency": string,"is_demo": boolean,"max_hours": number,"min_hours": number,"price_per_hour_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"currency"?: string,"is_demo"?: boolean,"max_hours"?: number,"min_hours"?: number,"price_per_hour_cents": number
                  }
                  Update: {
                    "class_id"?: string,"currency"?: string,"is_demo"?: boolean,"max_hours"?: number,"min_hours"?: number,"price_per_hour_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "hourly_rates_class_id_fkey"
      columns: ["class_id"]
isOneToOne: true
      referencedRelation: "vehicle_classes"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"booking_id": string,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string | null,"kind": string,"method": string,"note": string | null,"raw": NonNullable<Json>,"status": string,"viva_order_code": number | null,"viva_transaction_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"booking_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string | null,"kind": string,"method"?: string,"note"?: string | null,"raw"?: NonNullable<Json>,"status": string,"viva_order_code"?: number | null,"viva_transaction_id"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"booking_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string | null,"kind"?: string,"method"?: string,"note"?: string | null,"raw"?: NonNullable<Json>,"status"?: string,"viva_order_code"?: number | null,"viva_transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "description": string | null,"is_demo": boolean,"key": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"is_demo"?: boolean,"key": string,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"is_demo"?: boolean,"key"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"slot_holds": {
                  Row: {
                    "blocked_range": unknown,"booking_id": string | null,"booking_type": Database["public"]['Enums']["booking_type"] | null,"class_id": string,"created_at": string,"duration_minutes": number | null,"expires_at": string,"from_zone_id": string | null,"hours": number | null,"id": string,"pickup_at": string | null,"status": string,"to_zone_id": string | null,"visitor_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_range": unknown,"booking_id"?: string | null,"booking_type"?: Database["public"]['Enums']["booking_type"] | null,"class_id": string,"created_at"?: string,"duration_minutes"?: number | null,"expires_at": string,"from_zone_id"?: string | null,"hours"?: number | null,"id"?: string,"pickup_at"?: string | null,"status"?: string,"to_zone_id"?: string | null,"visitor_key": string
                  }
                  Update: {
                    "blocked_range"?: unknown,"booking_id"?: string | null,"booking_type"?: Database["public"]['Enums']["booking_type"] | null,"class_id"?: string,"created_at"?: string,"duration_minutes"?: number | null,"expires_at"?: string,"from_zone_id"?: string | null,"hours"?: number | null,"id"?: string,"pickup_at"?: string | null,"status"?: string,"to_zone_id"?: string | null,"visitor_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "slot_holds_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slot_holds_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "vehicle_classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slot_holds_from_zone_id_fkey"
      columns: ["from_zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slot_holds_to_zone_id_fkey"
      columns: ["to_zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    }
                  ]
                },"staff": {
                  Row: {
                    "created_at": string,"email": string,"name": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"name"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"name"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"vehicle_classes": {
                  Row: {
                    "active": boolean,"buffer_minutes": number,"id": string,"is_demo": boolean,"key": string,"max_luggage": number,"max_passengers": number,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"buffer_minutes"?: number,"id"?: string,"is_demo"?: boolean,"key": string,"max_luggage": number,"max_passengers": number,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "active"?: boolean,"buffer_minutes"?: number,"id"?: string,"is_demo"?: boolean,"key"?: string,"max_luggage"?: number,"max_passengers"?: number,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"vehicles": {
                  Row: {
                    "class_id": string,"id": string,"is_demo": boolean,"label": string,"note": string | null,"plate": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"id"?: string,"is_demo"?: boolean,"label": string,"note"?: string | null,"plate"?: string | null,"status"?: string
                  }
                  Update: {
                    "class_id"?: string,"id"?: string,"is_demo"?: boolean,"label"?: string,"note"?: string | null,"plate"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicles_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "vehicle_classes"
      referencedColumns: ["id"]
    }
                  ]
                },"zone_prices": {
                  Row: {
                    "class_id": string,"currency": string,"from_zone_id": string,"is_demo": boolean,"price_cents": number,"to_zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"currency"?: string,"from_zone_id": string,"is_demo"?: boolean,"price_cents": number,"to_zone_id": string
                  }
                  Update: {
                    "class_id"?: string,"currency"?: string,"from_zone_id"?: string,"is_demo"?: boolean,"price_cents"?: number,"to_zone_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "zone_prices_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "vehicle_classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "zone_prices_from_zone_id_to_zone_id_fkey"
      columns: ["from_zone_id","to_zone_id"]
isOneToOne: false
      referencedRelation: "zone_routes"
      referencedColumns: ["from_zone_id","to_zone_id"]
    }
                  ]
                },"zone_routes": {
                  Row: {
                    "duration_minutes": number,"from_zone_id": string,"is_demo": boolean,"to_zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "duration_minutes": number,"from_zone_id": string,"is_demo"?: boolean,"to_zone_id": string
                  }
                  Update: {
                    "duration_minutes"?: number,"from_zone_id"?: string,"is_demo"?: boolean,"to_zone_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "zone_routes_from_zone_id_fkey"
      columns: ["from_zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "zone_routes_to_zone_id_fkey"
      columns: ["to_zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    }
                  ]
                },"zones": {
                  Row: {
                    "active": boolean,"code": string,"id": string,"is_demo": boolean,"kind": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"id"?: string,"is_demo"?: boolean,"kind"?: string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"id"?: string,"is_demo"?: boolean,"kind"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "calendar_items": {
                  Row: {
                    "booking_id": string | null,"booking_type": string | null,"class_id": string | null,"ends_at": string | null,"kind": string | null,"label": string | null,"pickup_at": string | null,"range": unknown,"reason": string | null,"reference": string | null,"source": string | null,"status": string | null,"vehicle_auto_assigned": boolean | null,"vehicle_id": string | null,"vip_security": boolean | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"customer_summaries": {
                  Row: {
                    "bookings_count": number | null,"company": string | null,"created_at": string,"email": string,"has_vip_security": boolean | null,"id": string,"last_pickup_at": string | null,"name": string,"notes": string | null,"paid_cents": number | null,"phone": string | null,"vat_number": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"demo_rows": {
                  Row: {
                    "n": number | null,"table_name": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"drivers_now": {
                  Row: {
                    "active": boolean,"current_reference": string | null,"current_trip_status": string | null,"driver_id": string,"full_name": string,"jobs_today": number | null,"licence_expires_on": string | null,"next_pickup_at": string | null,"next_reference": string | null,"permit_expires_on": string | null,"phone": string,"shift_id": string | null,"shift_started_at": string | null,"vehicle_label": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"fleet_now": {
                  Row: {
                    "class_name": string,"current_pickup_at": string | null,"current_reference": string | null,"current_trip_status": string | null,"driver_id": string | null,"driver_name": string | null,"last_update_at": string | null,"next_pickup_at": string | null,"next_reference": string | null,"shift_id": string | null,"shift_started_at": string | null,"vehicle_id": string,"vehicle_label": string,"vehicle_status": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "auto_assign_backfill":
{ Args: { "p_class_id"?: string }; Returns: number
                           },
"auto_assign_enabled":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"blocked_range_for":
{ Args: { "p_buffer_minutes": number,"p_duration_minutes": number,"p_pickup": string }; Returns: unknown
                           },
"class_availability":
{ Args: { "p_class_id": string,"p_exclude_booking"?: string,"p_range": unknown }; Returns: number
                           },
"class_free_by_hour":
{ Args: { "p_class_id": string,"p_day": string }; Returns: {
              "free": number,"hour_start": string
            }[]
                           },
"create_booking_from_hold":
{ Args: { "p_customer_email": string,"p_customer_name": string,"p_customer_phone": string,"p_dropoff_address": string,"p_extra_codes": (string)[],"p_flight_number": string,"p_hold_id": string,"p_invoice_address": string,"p_invoice_company": string,"p_invoice_tax_office": string,"p_invoice_vat": string,"p_luggage": number,"p_notes": string,"p_passengers": number,"p_pickup_address": string,"p_visitor_key": string }; Returns: Json
                           },
"create_hold":
{ Args: { "p_booking_type"?: Database["public"]['Enums']["booking_type"],"p_class_key": string,"p_duration_minutes": number,"p_from_zone_id"?: string,"p_hours"?: number,"p_pickup": string,"p_to_zone_id"?: string,"p_visitor_key": string }; Returns: {
              "blocked_range": unknown,
"booking_id": string | null,
"booking_type": Database["public"]['Enums']["booking_type"] | null,
"class_id": string,
"created_at": string,
"duration_minutes": number | null,
"expires_at": string,
"from_zone_id": string | null,
"hours": number | null,
"id": string,
"pickup_at": string | null,
"status": string,
"to_zone_id": string | null,
"visitor_key": string
            }
                          SetofOptions: {
        from: "*"
        to: "slot_holds"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_office_hold":
{ Args: { "p_class_key": string,"p_duration_minutes": number,"p_minutes"?: number,"p_pickup": string,"p_staff_user": string }; Returns: {
              "blocked_range": unknown,
"booking_id": string | null,
"booking_type": Database["public"]['Enums']["booking_type"] | null,
"class_id": string,
"created_at": string,
"duration_minutes": number | null,
"expires_at": string,
"from_zone_id": string | null,
"hours": number | null,
"id": string,
"pickup_at": string | null,
"status": string,
"to_zone_id": string | null,
"visitor_key": string
            }
                          SetofOptions: {
        from: "*"
        to: "slot_holds"
        isOneToOne: true
        isSetofReturn: false
      } },
"current_driver_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"driver_earnings":
{ Args: { "p_driver_id": string,"p_from": string,"p_to": string }; Returns: {
              "amount_cents": number,"description": string,"kind": string,"on_date": string,"quantity": number,"rate_cents": number,"reference": string
            }[]
                           },
"driver_end_shift":
{ Args: { "p_odometer"?: number }; Returns: {
              "driver_id": string,
"end_odometer": number | null,
"ended_at": string | null,
"id": string,
"note": string | null,
"source": string,
"start_odometer": number | null,
"started_at": string,
"vehicle_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "driver_shifts"
        isOneToOne: true
        isSetofReturn: false
      } },
"driver_jobs":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "booking_type": string,"class_name": string,"customer_name": string,"customer_phone": string,"dropoff_address": string,"ends_at": string,"extras": (string)[],"flight_number": string,"from_zone": string,"hours": number,"luggage": number,"notes": string,"passengers": number,"pickup_address": string,"pickup_at": string,"reference": string,"status": string,"to_zone": string,"trip_status": string,"vehicle_label": string,"vip_security": boolean
            }[]
                           },
"driver_me":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"driver_start_shift":
{ Args: { "p_odometer"?: number,"p_vehicle_id": string }; Returns: {
              "driver_id": string,
"end_odometer": number | null,
"ended_at": string | null,
"id": string,
"note": string | null,
"source": string,
"start_odometer": number | null,
"started_at": string,
"vehicle_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "driver_shifts"
        isOneToOne: true
        isSetofReturn: false
      } },
"driver_statement_approve":
{ Args: { "p_id": string }; Returns: undefined
                           },
"driver_statement_build":
{ Args: { "p_driver_id": string,"p_from": string,"p_to": string }; Returns: string
                           },
"driver_statement_mark_paid":
{ Args: { "p_id": string,"p_reference": string }; Returns: undefined
                           },
"driver_vehicles":
{ Args: Record<PropertyKey, never>; Returns: {
              "class_name": string,"id": string,"label": string,"plate": string
            }[]
                           },
"expire_holds":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"generate_booking_reference":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"hit_rate_limit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"record_viva_payment":
{ Args: { "p_amount_cents": number,"p_order_code": number,"p_raw"?: Json,"p_transaction_id": string }; Returns: Json
                           },
"report_bookings_per_day":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "cancelled": number,"completed": number,"day": string,"no_show": number,"office": number,"online": number,"revenue_cents": number
            }[]
                           },
"report_driver_pay":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "days_worked": number,"driver_id": string,"full_name": string,"jobs": number,"shift_hours": number,"statement_status": string,"total_cents": number
            }[]
                           },
"report_vehicle_usage":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "booked_hours": number,"class_name": string,"jobs": number,"label": string,"shift_days": number,"shift_hours": number,"vehicle_id": string
            }[]
                           },
"set_trip_status":
{ Args: { "p_note"?: string,"p_reference": string,"p_status": string }; Returns: string
                           },
"setting_int":
{ Args: { "p_key": string }; Returns: number
                           },
"single_free_vehicle":
{ Args: { "p_booking_id"?: string,"p_class_id": string,"p_range": unknown }; Returns: string
                           },
"vat_from_gross":
{ Args: { "p_gross_cents": number,"p_rate_bp": number }; Returns: number
                           }
          }
          Enums: {
            "booking_status": "pending"|"confirmed"|"assigned"|"completed"|"cancelled"|"expired","booking_type": "transfer"|"hourly","invoice_status": "not_required"|"requested"|"issued","payment_status": "unpaid"|"paid"|"partially_refunded"|"refunded"|"failed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "booking_status": ["pending", "confirmed", "assigned", "completed", "cancelled", "expired"],"booking_type": ["transfer", "hourly"],"invoice_status": ["not_required", "requested", "issued"],"payment_status": ["unpaid", "paid", "partially_refunded", "refunded", "failed"]
          }
        }
} as const
