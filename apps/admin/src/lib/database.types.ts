export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      blocked_slots: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          range: unknown;
          reason: string | null;
          vehicle_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          range: unknown;
          reason?: string | null;
          vehicle_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          range?: unknown;
          reason?: string | null;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocked_slots_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      booking_extras: {
        Row: {
          booking_id: string;
          extra_id: string;
          price_cents: number;
          quantity: number;
        };
        ComputedFields: never;
        Insert: {
          booking_id: string;
          extra_id: string;
          price_cents: number;
          quantity?: number;
        };
        Update: {
          booking_id?: string;
          extra_id?: string;
          price_cents?: number;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'booking_extras_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_extras_extra_id_fkey';
            columns: ['extra_id'];
            isOneToOne: false;
            referencedRelation: 'extras';
            referencedColumns: ['id'];
          },
        ];
      };
      bookings: {
        Row: {
          base_price_cents: number;
          blocked_range: unknown;
          booking_type: Database['public']['Enums']['booking_type'];
          cancel_token_hash: string | null;
          cancelled_at: string | null;
          class_id: string;
          created_at: string;
          currency: string;
          customer_email: string;
          customer_name: string;
          customer_phone: string;
          dropoff_address: string | null;
          duration_minutes: number;
          flight_number: string | null;
          from_zone_id: string;
          hold_expires_at: string | null;
          hours: number | null;
          id: string;
          invoice_address: string | null;
          invoice_company: string | null;
          invoice_number: string | null;
          invoice_status: Database['public']['Enums']['invoice_status'];
          invoice_tax_office: string | null;
          invoice_vat: string | null;
          luggage: number;
          notes: string | null;
          passengers: number;
          payment_status: Database['public']['Enums']['payment_status'];
          pickup_address: string;
          pickup_at: string;
          price_cents: number;
          reference: string;
          reminder_sent_at: string | null;
          security_notes: string | null;
          status: Database['public']['Enums']['booking_status'];
          to_zone_id: string | null;
          updated_at: string;
          vehicle_id: string | null;
          vip_security: boolean;
          viva_order_code: number | null;
        };
        ComputedFields: never;
        Insert: {
          base_price_cents: number;
          blocked_range: unknown;
          booking_type: Database['public']['Enums']['booking_type'];
          cancel_token_hash?: string | null;
          cancelled_at?: string | null;
          class_id: string;
          created_at?: string;
          currency?: string;
          customer_email: string;
          customer_name: string;
          customer_phone: string;
          dropoff_address?: string | null;
          duration_minutes: number;
          flight_number?: string | null;
          from_zone_id: string;
          hold_expires_at?: string | null;
          hours?: number | null;
          id?: string;
          invoice_address?: string | null;
          invoice_company?: string | null;
          invoice_number?: string | null;
          invoice_status?: Database['public']['Enums']['invoice_status'];
          invoice_tax_office?: string | null;
          invoice_vat?: string | null;
          luggage?: number;
          notes?: string | null;
          passengers: number;
          payment_status?: Database['public']['Enums']['payment_status'];
          pickup_address: string;
          pickup_at: string;
          price_cents: number;
          reference?: string;
          reminder_sent_at?: string | null;
          security_notes?: string | null;
          status?: Database['public']['Enums']['booking_status'];
          to_zone_id?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
          vip_security?: boolean;
          viva_order_code?: number | null;
        };
        Update: {
          base_price_cents?: number;
          blocked_range?: unknown;
          booking_type?: Database['public']['Enums']['booking_type'];
          cancel_token_hash?: string | null;
          cancelled_at?: string | null;
          class_id?: string;
          created_at?: string;
          currency?: string;
          customer_email?: string;
          customer_name?: string;
          customer_phone?: string;
          dropoff_address?: string | null;
          duration_minutes?: number;
          flight_number?: string | null;
          from_zone_id?: string;
          hold_expires_at?: string | null;
          hours?: number | null;
          id?: string;
          invoice_address?: string | null;
          invoice_company?: string | null;
          invoice_number?: string | null;
          invoice_status?: Database['public']['Enums']['invoice_status'];
          invoice_tax_office?: string | null;
          invoice_vat?: string | null;
          luggage?: number;
          notes?: string | null;
          passengers?: number;
          payment_status?: Database['public']['Enums']['payment_status'];
          pickup_address?: string;
          pickup_at?: string;
          price_cents?: number;
          reference?: string;
          reminder_sent_at?: string | null;
          security_notes?: string | null;
          status?: Database['public']['Enums']['booking_status'];
          to_zone_id?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
          vip_security?: boolean;
          viva_order_code?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'vehicle_classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_from_zone_id_fkey';
            columns: ['from_zone_id'];
            isOneToOne: false;
            referencedRelation: 'zones';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_to_zone_id_fkey';
            columns: ['to_zone_id'];
            isOneToOne: false;
            referencedRelation: 'zones';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      extras: {
        Row: {
          active: boolean;
          code: string;
          id: string;
          name: string;
          price_cents: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          code: string;
          id?: string;
          name: string;
          price_cents: number;
        };
        Update: {
          active?: boolean;
          code?: string;
          id?: string;
          name?: string;
          price_cents?: number;
        };
        Relationships: [];
      };
      hourly_rates: {
        Row: {
          class_id: string;
          currency: string;
          max_hours: number;
          min_hours: number;
          price_per_hour_cents: number;
        };
        ComputedFields: never;
        Insert: {
          class_id: string;
          currency?: string;
          max_hours?: number;
          min_hours?: number;
          price_per_hour_cents: number;
        };
        Update: {
          class_id?: string;
          currency?: string;
          max_hours?: number;
          min_hours?: number;
          price_per_hour_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'hourly_rates_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: true;
            referencedRelation: 'vehicle_classes';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_cents: number;
          booking_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          idempotency_key: string | null;
          kind: string;
          raw: NonNullable<Json>;
          status: string;
          viva_order_code: number | null;
          viva_transaction_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          booking_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          idempotency_key?: string | null;
          kind: string;
          raw?: NonNullable<Json>;
          status: string;
          viva_order_code?: number | null;
          viva_transaction_id?: string | null;
        };
        Update: {
          amount_cents?: number;
          booking_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          idempotency_key?: string | null;
          kind?: string;
          raw?: NonNullable<Json>;
          status?: string;
          viva_order_code?: number | null;
          viva_transaction_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
        ];
      };
      settings: {
        Row: {
          description: string | null;
          is_demo: boolean;
          key: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          description?: string | null;
          is_demo?: boolean;
          key: string;
          value: NonNullable<Json>;
        };
        Update: {
          description?: string | null;
          is_demo?: boolean;
          key?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      slot_holds: {
        Row: {
          blocked_range: unknown;
          booking_id: string | null;
          class_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          status: string;
          visitor_key: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_range: unknown;
          booking_id?: string | null;
          class_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          status?: string;
          visitor_key: string;
        };
        Update: {
          blocked_range?: unknown;
          booking_id?: string | null;
          class_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          status?: string;
          visitor_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'slot_holds_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'slot_holds_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'vehicle_classes';
            referencedColumns: ['id'];
          },
        ];
      };
      staff: {
        Row: {
          created_at: string;
          email: string;
          name: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          name?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          name?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      vehicle_classes: {
        Row: {
          active: boolean;
          buffer_minutes: number;
          id: string;
          key: string;
          max_luggage: number;
          max_passengers: number;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          buffer_minutes?: number;
          id?: string;
          key: string;
          max_luggage: number;
          max_passengers: number;
          name: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          buffer_minutes?: number;
          id?: string;
          key?: string;
          max_luggage?: number;
          max_passengers?: number;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      vehicles: {
        Row: {
          class_id: string;
          id: string;
          label: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          class_id: string;
          id?: string;
          label: string;
          status?: string;
        };
        Update: {
          class_id?: string;
          id?: string;
          label?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicles_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'vehicle_classes';
            referencedColumns: ['id'];
          },
        ];
      };
      zone_prices: {
        Row: {
          class_id: string;
          currency: string;
          from_zone_id: string;
          price_cents: number;
          to_zone_id: string;
        };
        ComputedFields: never;
        Insert: {
          class_id: string;
          currency?: string;
          from_zone_id: string;
          price_cents: number;
          to_zone_id: string;
        };
        Update: {
          class_id?: string;
          currency?: string;
          from_zone_id?: string;
          price_cents?: number;
          to_zone_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'zone_prices_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'vehicle_classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'zone_prices_from_zone_id_to_zone_id_fkey';
            columns: ['from_zone_id', 'to_zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone_routes';
            referencedColumns: ['from_zone_id', 'to_zone_id'];
          },
        ];
      };
      zone_routes: {
        Row: {
          duration_minutes: number;
          from_zone_id: string;
          to_zone_id: string;
        };
        ComputedFields: never;
        Insert: {
          duration_minutes: number;
          from_zone_id: string;
          to_zone_id: string;
        };
        Update: {
          duration_minutes?: number;
          from_zone_id?: string;
          to_zone_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'zone_routes_from_zone_id_fkey';
            columns: ['from_zone_id'];
            isOneToOne: false;
            referencedRelation: 'zones';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'zone_routes_to_zone_id_fkey';
            columns: ['to_zone_id'];
            isOneToOne: false;
            referencedRelation: 'zones';
            referencedColumns: ['id'];
          },
        ];
      };
      zones: {
        Row: {
          active: boolean;
          code: string;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          code: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          code?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      blocked_range_for: {
        Args: { p_buffer_minutes: number; p_duration_minutes: number; p_pickup: string };
        Returns: unknown;
      };
      class_availability: {
        Args: { p_class_id: string; p_exclude_booking?: string; p_range: unknown };
        Returns: number;
      };
      create_hold: {
        Args: {
          p_class_key: string;
          p_duration_minutes: number;
          p_pickup: string;
          p_visitor_key: string;
        };
        Returns: {
          blocked_range: unknown;
          booking_id: string | null;
          class_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          status: string;
          visitor_key: string;
        };
        SetofOptions: {
          from: '*';
          to: 'slot_holds';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      expire_holds: { Args: Record<PropertyKey, never>; Returns: number };
      generate_booking_reference: { Args: Record<PropertyKey, never>; Returns: string };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      setting_int: { Args: { p_key: string }; Returns: number };
    };
    Enums: {
      booking_status: 'pending' | 'confirmed' | 'assigned' | 'completed' | 'cancelled' | 'expired';
      booking_type: 'transfer' | 'hourly';
      invoice_status: 'not_required' | 'requested' | 'issued';
      payment_status: 'unpaid' | 'paid' | 'partially_refunded' | 'refunded' | 'failed';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      booking_status: ['pending', 'confirmed', 'assigned', 'completed', 'cancelled', 'expired'],
      booking_type: ['transfer', 'hourly'],
      invoice_status: ['not_required', 'requested', 'issued'],
      payment_status: ['unpaid', 'paid', 'partially_refunded', 'refunded', 'failed'],
    },
  },
} as const;
