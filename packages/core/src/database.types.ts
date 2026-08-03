// Automatisch erzeugt aus dem Datenbankschema. Nicht von Hand aendern.
// Neu erzeugen mit: pnpm db:types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      bank_accounts: {
        Row: {
          active: boolean
          bank_name: string | null
          created_at: string
          ebusy_id: number | null
          holder: string
          iban_encrypted: string
          iban_last4: string
          id: string
          member_id: string
          source: Database["public"]["Enums"]["record_source"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          bank_name?: string | null
          created_at?: string
          ebusy_id?: number | null
          holder: string
          iban_encrypted: string
          iban_last4: string
          id?: string
          member_id: string
          source?: Database["public"]["Enums"]["record_source"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          bank_name?: string | null
          created_at?: string
          ebusy_id?: number | null
          holder?: string
          iban_encrypted?: string
          iban_last4?: string
          id?: string
          member_id?: string
          source?: Database["public"]["Enums"]["record_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_periods: {
        Row: {
          charged_at: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          month: number
          status: Database["public"]["Enums"]["billing_period_status"]
          year: number
        }
        Insert: {
          charged_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          month: number
          status?: Database["public"]["Enums"]["billing_period_status"]
          year: number
        }
        Update: {
          charged_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          month?: number
          status?: Database["public"]["Enums"]["billing_period_status"]
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_players: {
        Row: {
          booking_id: string
          created_at: string
          guest_name: string | null
          id: string
          member_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          guest_name?: string | null
          id?: string
          member_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          guest_name?: string | null
          id?: string
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_players_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_players_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_series: {
        Row: {
          booking_type_id: string
          court_id: string
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          start_time: string
          title: string
          valid_from: string
          valid_to: string
          weekday: number
        }
        Insert: {
          booking_type_id: string
          court_id: string
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          start_time: string
          title: string
          valid_from: string
          valid_to: string
          weekday: number
        }
        Update: {
          booking_type_id?: string
          court_id?: string
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          start_time?: string
          title?: string
          valid_from?: string
          valid_to?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_series_booking_type_id_fkey"
            columns: ["booking_type_id"]
            isOneToOne: false
            referencedRelation: "booking_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_series_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_types: {
        Row: {
          active: boolean
          allowed_roles: Database["public"]["Enums"]["app_role"][] | null
          applies_to: Database["public"]["Enums"]["booking_kind"]
          code: string
          counts_towards_quota: boolean
          created_at: string
          duration_minutes: number
          id: string
          max_players: number
          min_players: number
          name: string
          requires_partner: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          allowed_roles?: Database["public"]["Enums"]["app_role"][] | null
          applies_to?: Database["public"]["Enums"]["booking_kind"]
          code: string
          counts_towards_quota?: boolean
          created_at?: string
          duration_minutes: number
          id?: string
          max_players?: number
          min_players?: number
          name: string
          requires_partner?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          allowed_roles?: Database["public"]["Enums"]["app_role"][] | null
          applies_to?: Database["public"]["Enums"]["booking_kind"]
          code?: string
          counts_towards_quota?: boolean
          created_at?: string
          duration_minutes?: number
          id?: string
          max_players?: number
          min_players?: number
          name?: string
          requires_partner?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          booking_code: string | null
          booking_type_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          court_id: string
          created_at: string
          created_by: string | null
          ebusy_id: number | null
          id: string
          kind: Database["public"]["Enums"]["booking_kind"]
          member_id: string | null
          series_id: string | null
          slot: unknown
          source: Database["public"]["Enums"]["record_source"]
          status: Database["public"]["Enums"]["booking_status"]
          title: string | null
        }
        Insert: {
          booking_code?: string | null
          booking_type_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          court_id: string
          created_at?: string
          created_by?: string | null
          ebusy_id?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["booking_kind"]
          member_id?: string | null
          series_id?: string | null
          slot: unknown
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          title?: string | null
        }
        Update: {
          booking_code?: string | null
          booking_type_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          court_id?: string
          created_at?: string
          created_by?: string | null
          ebusy_id?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["booking_kind"]
          member_id?: string | null
          series_id?: string | null
          slot?: unknown
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_booking_type_id_fkey"
            columns: ["booking_type_id"]
            isOneToOne: false
            referencedRelation: "booking_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "booking_series"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          due_date: string | null
          id: string
          kind: Database["public"]["Enums"]["charge_kind"]
          member_id: string
          notified_at: string | null
          payer_id: string
          period_label: string | null
          status: Database["public"]["Enums"]["charge_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          kind: Database["public"]["Enums"]["charge_kind"]
          member_id: string
          notified_at?: string | null
          payer_id: string
          period_label?: string | null
          status?: Database["public"]["Enums"]["charge_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["charge_kind"]
          member_id?: string
          notified_at?: string | null
          payer_id?: string
          period_label?: string | null
          status?: Database["public"]["Enums"]["charge_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charges_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          active: boolean
          created_at: string
          ebusy_id: number | null
          id: string
          name: string
          position: number
          short_name: string
          source: Database["public"]["Enums"]["record_source"]
          subline: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ebusy_id?: number | null
          id?: string
          name: string
          position?: number
          short_name: string
          source?: Database["public"]["Enums"]["record_source"]
          subline?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ebusy_id?: number | null
          id?: string
          name?: string
          position?: number
          short_name?: string
          source?: Database["public"]["Enums"]["record_source"]
          subline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      debit_batches: {
        Row: {
          collection_date: string
          created_at: string
          created_by: string | null
          creditor_id: string | null
          id: string
          item_count: number
          pain_version: string | null
          status: Database["public"]["Enums"]["debit_batch_status"]
          storage_path: string | null
          title: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          collection_date: string
          created_at?: string
          created_by?: string | null
          creditor_id?: string | null
          id?: string
          item_count?: number
          pain_version?: string | null
          status?: Database["public"]["Enums"]["debit_batch_status"]
          storage_path?: string | null
          title: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          collection_date?: string
          created_at?: string
          created_by?: string | null
          creditor_id?: string | null
          id?: string
          item_count?: number
          pain_version?: string | null
          status?: Database["public"]["Enums"]["debit_batch_status"]
          storage_path?: string | null
          title?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debit_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      debit_items: {
        Row: {
          amount_cents: number
          batch_id: string
          charge_id: string
          created_at: string
          id: string
          mandate_id: string
          mandate_reference: string
          mandate_signed_on: string
          result: Database["public"]["Enums"]["debit_item_result"]
          return_reason: string | null
          returned_on: string | null
          sequence_type: Database["public"]["Enums"]["mandate_sequence"]
        }
        Insert: {
          amount_cents: number
          batch_id: string
          charge_id: string
          created_at?: string
          id?: string
          mandate_id: string
          mandate_reference: string
          mandate_signed_on: string
          result?: Database["public"]["Enums"]["debit_item_result"]
          return_reason?: string | null
          returned_on?: string | null
          sequence_type: Database["public"]["Enums"]["mandate_sequence"]
        }
        Update: {
          amount_cents?: number
          batch_id?: string
          charge_id?: string
          created_at?: string
          id?: string
          mandate_id?: string
          mandate_reference?: string
          mandate_signed_on?: string
          result?: Database["public"]["Enums"]["debit_item_result"]
          return_reason?: string | null
          returned_on?: string | null
          sequence_type?: Database["public"]["Enums"]["mandate_sequence"]
        }
        Relationships: [
          {
            foreignKeyName: "debit_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "debit_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_items_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_items_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "sepa_mandates"
            referencedColumns: ["id"]
          },
        ]
      }
      drink_items: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["drink_category"]
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: Database["public"]["Enums"]["drink_category"]
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["drink_category"]
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      drink_prices: {
        Row: {
          created_at: string
          drink_item_id: string
          price_cents: number
          valid_from: string
        }
        Insert: {
          created_at?: string
          drink_item_id: string
          price_cents: number
          valid_from: string
        }
        Update: {
          created_at?: string
          drink_item_id?: string
          price_cents?: number
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "drink_prices_drink_item_id_fkey"
            columns: ["drink_item_id"]
            isOneToOne: false
            referencedRelation: "drink_items"
            referencedColumns: ["id"]
          },
        ]
      }
      drink_purchases: {
        Row: {
          billing_period_id: string
          created_at: string
          drink_item_id: string
          id: string
          member_id: string
          quantity: number
          recorded_by: string | null
          source: Database["public"]["Enums"]["purchase_source"]
          total_cents: number | null
          unit_price_cents: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          billing_period_id: string
          created_at?: string
          drink_item_id: string
          id?: string
          member_id: string
          quantity: number
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["purchase_source"]
          total_cents?: number | null
          unit_price_cents: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          billing_period_id?: string
          created_at?: string
          drink_item_id?: string
          id?: string
          member_id?: string
          quantity?: number
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["purchase_source"]
          total_cents?: number | null
          unit_price_cents?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drink_purchases_billing_period_id_fkey"
            columns: ["billing_period_id"]
            isOneToOne: false
            referencedRelation: "billing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drink_purchases_drink_item_id_fkey"
            columns: ["drink_item_id"]
            isOneToOne: false
            referencedRelation: "drink_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drink_purchases_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drink_purchases_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drink_purchases_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_prices: {
        Row: {
          amount_cents: number
          created_at: string
          fee_type_id: string
          valid_from_year: number
        }
        Insert: {
          amount_cents: number
          created_at?: string
          fee_type_id: string
          valid_from_year: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          fee_type_id?: string
          valid_from_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_prices_fee_type_id_fkey"
            columns: ["fee_type_id"]
            isOneToOne: false
            referencedRelation: "fee_types"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      kiosk_devices: {
        Row: {
          active: boolean
          auth_user_id: string
          created_at: string
          created_by: string | null
          id: string
          last_seen_at: string | null
          location: string | null
          name: string
        }
        Insert: {
          active?: boolean
          auth_user_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_seen_at?: string | null
          location?: string | null
          name: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_seen_at?: string | null
          location?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_devices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_fees: {
        Row: {
          created_at: string
          fee_type_id: string
          member_id: string
          note: string | null
          override_amount_cents: number | null
          year: number
        }
        Insert: {
          created_at?: string
          fee_type_id: string
          member_id: string
          note?: string | null
          override_amount_cents?: number | null
          year: number
        }
        Update: {
          created_at?: string
          fee_type_id?: string
          member_id?: string
          note?: string | null
          override_amount_cents?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "member_fees_fee_type_id_fkey"
            columns: ["fee_type_id"]
            isOneToOne: false
            referencedRelation: "fee_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_fees_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          member_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          member_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          member_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "member_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_roles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          auth_user_id: string | null
          billing_payer_id: string | null
          birthday: string | null
          city: string | null
          country_code: string | null
          created_at: string
          ebusy_person_id: number | null
          email: string | null
          first_name: string
          gender: Database["public"]["Enums"]["gender"] | null
          id: string
          import_notes: string | null
          imported_at: string | null
          last_name: string
          legacy_data: Json | null
          mobile: string | null
          notes: string | null
          phone: string | null
          postcode: string | null
          salutation: Database["public"]["Enums"]["salutation"] | null
          source: Database["public"]["Enums"]["record_source"]
          status: Database["public"]["Enums"]["member_status"]
          street: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          billing_payer_id?: string | null
          birthday?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          ebusy_person_id?: number | null
          email?: string | null
          first_name: string
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          import_notes?: string | null
          imported_at?: string | null
          last_name: string
          legacy_data?: Json | null
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          salutation?: Database["public"]["Enums"]["salutation"] | null
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["member_status"]
          street?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          billing_payer_id?: string | null
          birthday?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          ebusy_person_id?: number | null
          email?: string | null
          first_name?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          import_notes?: string | null
          imported_at?: string | null
          last_name?: string
          legacy_data?: Json | null
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          salutation?: Database["public"]["Enums"]["salutation"] | null
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["member_status"]
          street?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_billing_payer_id_fkey"
            columns: ["billing_payer_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          cancellation_date: string | null
          cancellation_reason: string | null
          created_at: string
          ebusy_id: number | null
          ended_on: string | null
          id: string
          import_notes: string | null
          imported_at: string | null
          member_id: string
          notes: string | null
          number: string
          source: Database["public"]["Enums"]["record_source"]
          started_on: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
        }
        Insert: {
          cancellation_date?: string | null
          cancellation_reason?: string | null
          created_at?: string
          ebusy_id?: number | null
          ended_on?: string | null
          id?: string
          import_notes?: string | null
          imported_at?: string | null
          member_id: string
          notes?: string | null
          number: string
          source?: Database["public"]["Enums"]["record_source"]
          started_on: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Update: {
          cancellation_date?: string | null
          cancellation_reason?: string | null
          created_at?: string
          ebusy_id?: number | null
          ended_on?: string | null
          id?: string
          import_notes?: string | null
          imported_at?: string | null
          member_id?: string
          notes?: string | null
          number?: string
          source?: Database["public"]["Enums"]["record_source"]
          started_on?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          mailed_at: string | null
          member_id: string
          read_at: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          mailed_at?: string | null
          member_id: string
          read_at?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          mailed_at?: string | null
          member_id?: string
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      sepa_mandates: {
        Row: {
          bank_account_id: string
          created_at: string
          ebusy_id: number | null
          id: string
          last_used_on: string | null
          member_id: string
          reference: string
          reference_conflict: boolean
          revoked_on: string | null
          scope: Database["public"]["Enums"]["mandate_scope"]
          sequence_type: Database["public"]["Enums"]["mandate_sequence"]
          signed_on: string
          source: Database["public"]["Enums"]["record_source"]
          status: Database["public"]["Enums"]["mandate_status"]
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          ebusy_id?: number | null
          id?: string
          last_used_on?: string | null
          member_id: string
          reference: string
          reference_conflict?: boolean
          revoked_on?: string | null
          scope?: Database["public"]["Enums"]["mandate_scope"]
          sequence_type?: Database["public"]["Enums"]["mandate_sequence"]
          signed_on: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["mandate_status"]
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          ebusy_id?: number | null
          id?: string
          last_used_on?: string | null
          member_id?: string
          reference?: string
          reference_conflict?: boolean
          revoked_on?: string | null
          scope?: Database["public"]["Enums"]["mandate_scope"]
          sequence_type?: Database["public"]["Enums"]["mandate_sequence"]
          signed_on?: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["mandate_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sepa_mandates_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sepa_mandates_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          description: string | null
          key: string
          label: string
          updated_at: string
          updated_by: string | null
          value: Json
          value_type: string
        }
        Insert: {
          description?: string | null
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
          value: Json
          value_type: string
        }
        Update: {
          description?: string | null
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      work_duty_entries: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          hours: number
          id: string
          member_id: string
          updated_at: string
          worked_on: string
          year: number
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hours: number
          id?: string
          member_id: string
          updated_at?: string
          worked_on: string
          year: number
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hours?: number
          id?: string
          member_id?: string
          updated_at?: string
          worked_on?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_duty_entries_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_duty_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_duty_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      work_duty_rules: {
        Row: {
          created_at: string
          fee_type_id: string
          required_hours: number
          year: number
        }
        Insert: {
          created_at?: string
          fee_type_id: string
          required_hours: number
          year: number
        }
        Update: {
          created_at?: string
          fee_type_id?: string
          required_hours?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_duty_rules_fee_type_id_fkey"
            columns: ["fee_type_id"]
            isOneToOne: false
            referencedRelation: "fee_types"
            referencedColumns: ["id"]
          },
        ]
      }
      work_duty_settlements: {
        Row: {
          amount_cents: number
          charge_id: string | null
          completed_hours: number
          hourly_rate_cents: number
          member_id: string
          missing_hours: number
          required_hours: number
          settled_at: string
          settled_by: string | null
          year: number
        }
        Insert: {
          amount_cents: number
          charge_id?: string | null
          completed_hours: number
          hourly_rate_cents: number
          member_id: string
          missing_hours: number
          required_hours: number
          settled_at?: string
          settled_by?: string | null
          year: number
        }
        Update: {
          amount_cents?: number
          charge_id?: string | null
          completed_hours?: number
          hourly_rate_cents?: number
          member_id?: string
          missing_hours?: number
          required_hours?: number
          settled_at?: string
          settled_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_duty_settlements_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_duty_settlements_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_duty_settlements_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      booking_settings: {
        Args: never
        Returns: {
          closing_time: string
          display_minutes: number
          guest_fee_cents: number
          lead_days: number
          max_open_bookings: number
          opening_time: string
          slot_minutes: number
        }[]
      }
      cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: undefined
      }
      create_booking: {
        Args: {
          p_booking_type_code: string
          p_court_id: string
          p_guest_names?: string[]
          p_player_member_ids?: string[]
          p_starts_at: string
        }
        Returns: string
      }
      create_series: {
        Args: {
          p_booking_type_code: string
          p_court_id: string
          p_displace?: boolean
          p_end_time: string
          p_start_time: string
          p_title: string
          p_valid_from: string
          p_valid_to: string
          p_weekday: number
        }
        Returns: {
          created_count: number
          displaced_count: number
          series_id: string
        }[]
      }
      day_schedule: {
        Args: { p_date: string }
        Returns: {
          booking_id: string
          court_id: string
          ends_at: string
          guest_names: string[]
          is_own: boolean
          kind: Database["public"]["Enums"]["booking_kind"]
          owner_name: string
          player_member_ids: string[]
          players: string[]
          starts_at: string
          title: string
          type_code: string
          type_name: string
        }[]
      }
      drink_menu: {
        Args: never
        Returns: {
          category: Database["public"]["Enums"]["drink_category"]
          description: string
          id: string
          name: string
          price_cents: number
          sort_order: number
        }[]
      }
      ensure_default_settings: { Args: never; Returns: number }
      fee_run_preview: {
        Args: { p_year: number }
        Returns: {
          already_charged: boolean
          amount_cents: number
          fee_types: string
          has_mandate: boolean
          mandate_scope: Database["public"]["Enums"]["mandate_scope"]
          member_id: string
          member_name: string
          payer_name: string
        }[]
      }
      iban_check_digits: {
        Args: { p_bban: string; p_country?: string }
        Returns: string
      }
      iban_is_valid: { Args: { p_iban: string }; Returns: boolean }
      iban_to_numeric: { Args: { p_text: string }; Returns: string }
      member_directory: {
        Args: { p_query?: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
        }[]
      }
      mod97: { Args: { p_digits: string }; Returns: number }
      my_booking_quota: {
        Args: never
        Returns: {
          allowed: number
          used: number
        }[]
      }
      my_charges: {
        Args: never
        Returns: {
          amount_cents: number
          description: string
          due_date: string
          id: string
          is_for_other: boolean
          kind: Database["public"]["Enums"]["charge_kind"]
          member_name: string
          period_label: string
          status: Database["public"]["Enums"]["charge_status"]
        }[]
      }
      my_drink_purchases: {
        Args: never
        Returns: {
          created_at: string
          id: string
          item_name: string
          quantity: number
          source: Database["public"]["Enums"]["purchase_source"]
          total_cents: number
          unit_price_cents: number
          voided_at: string
        }[]
      }
      my_drink_summary: {
        Args: { p_month?: number; p_year?: number }
        Returns: {
          item_name: string
          quantity: number
          total_cents: number
        }[]
      }
      my_work_duty: {
        Args: { p_year?: number }
        Returns: {
          completed_hours: number
          missing_hours: number
          required_hours: number
          year: number
        }[]
      }
      preview_series: {
        Args: {
          p_court_id: string
          p_end_time: string
          p_start_time: string
          p_valid_from: string
          p_valid_to: string
          p_weekday: number
        }
        Returns: {
          conflict_booking_id: string
          conflict_kind: Database["public"]["Enums"]["booking_kind"]
          conflict_member_name: string
          ends_at: string
          starts_at: string
        }[]
      }
      record_drink_purchase: {
        Args: { p_item_id: string; p_quantity?: number }
        Returns: string
      }
      record_drink_purchase_for: {
        Args: { p_item_id: string; p_member_id: string; p_quantity?: number }
        Returns: string
      }
      set_setting: {
        Args: { p_key: string; p_value: string }
        Returns: undefined
      }
      setting_int: { Args: { p_key: string }; Returns: number }
      setting_text: { Args: { p_key: string }; Returns: string }
      setting_time: { Args: { p_key: string }; Returns: string }
      update_booking_players: {
        Args: {
          p_booking_id: string
          p_guest_names?: string[]
          p_member_ids?: string[]
        }
        Returns: undefined
      }
      void_drink_purchase: {
        Args: { p_purchase_id: string; p_reason?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "member" | "admin"
      billing_period_status: "open" | "closed" | "charged"
      booking_kind: "booking" | "blocking"
      booking_status: "active" | "cancelled"
      charge_kind: "fee" | "drinks" | "deposit" | "work_duty" | "misc"
      charge_status:
        | "open"
        | "notified"
        | "submitted"
        | "settled"
        | "returned"
        | "waived"
      debit_batch_status: "draft" | "generated" | "submitted" | "completed"
      debit_item_result: "pending" | "settled" | "returned"
      drink_category: "drink" | "food" | "other"
      gender: "female" | "male" | "diverse"
      mandate_scope: "fees_only" | "all_payments"
      mandate_sequence: "FRST" | "RCUR" | "OOFF" | "FNAL"
      mandate_status: "active" | "revoked" | "expired"
      member_status: "active" | "inactive" | "archived"
      membership_status: "active" | "requested" | "declined" | "ended"
      purchase_source: "app" | "kiosk" | "bar_duty"
      record_source: "app" | "ebusy_import"
      salutation: "female" | "male" | "none"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["member", "admin"],
      billing_period_status: ["open", "closed", "charged"],
      booking_kind: ["booking", "blocking"],
      booking_status: ["active", "cancelled"],
      charge_kind: ["fee", "drinks", "deposit", "work_duty", "misc"],
      charge_status: [
        "open",
        "notified",
        "submitted",
        "settled",
        "returned",
        "waived",
      ],
      debit_batch_status: ["draft", "generated", "submitted", "completed"],
      debit_item_result: ["pending", "settled", "returned"],
      drink_category: ["drink", "food", "other"],
      gender: ["female", "male", "diverse"],
      mandate_scope: ["fees_only", "all_payments"],
      mandate_sequence: ["FRST", "RCUR", "OOFF", "FNAL"],
      mandate_status: ["active", "revoked", "expired"],
      member_status: ["active", "inactive", "archived"],
      membership_status: ["active", "requested", "declined", "ended"],
      purchase_source: ["app", "kiosk", "bar_duty"],
      record_source: ["app", "ebusy_import"],
      salutation: ["female", "male", "none"],
    },
  },
} as const
