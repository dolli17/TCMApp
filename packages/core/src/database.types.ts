export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          created_at: string
          id: string
          member_id: string
          message: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          message?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          active: boolean
          bank_name: string | null
          created_at: string
          ebusy_id: number | null
          holder: string
          iban_encrypted: string
          iban_fingerprint: string | null
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
          iban_fingerprint?: string | null
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
          iban_fingerprint?: string | null
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
          partner_wanted: boolean
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
          partner_wanted?: boolean
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
          partner_wanted?: boolean
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
      change_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changed_by_auth: string | null
          diff: Json
          ereignis: string | null
          id: number
          kenn: Json | null
          member_id: string | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changed_by_auth?: string | null
          diff: Json
          ereignis?: string | null
          id?: never
          kenn?: Json | null
          member_id?: string | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_auth?: string | null
          diff?: Json
          ereignis?: string | null
          id?: never
          kenn?: Json | null
          member_id?: string | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          amount_cents: number
          booking_id: string | null
          created_at: string
          description: string
          due_date: string | null
          event_id: string | null
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
          booking_id?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          event_id?: string | null
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
          booking_id?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          event_id?: string | null
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
            foreignKeyName: "charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
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
          kinds: Database["public"]["Enums"]["charge_kind"][] | null
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
          kinds?: Database["public"]["Enums"]["charge_kind"][] | null
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
          kinds?: Database["public"]["Enums"]["charge_kind"][] | null
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
          end_to_end_id: string | null
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
          end_to_end_id?: string | null
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
          end_to_end_id?: string | null
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
      event_registrations: {
        Row: {
          attended: boolean
          cancelled_at: string | null
          companions: number
          event_id: string
          id: string
          member_id: string
          note: string | null
          registered_at: string
          status: Database["public"]["Enums"]["event_registration_status"]
          updated_at: string
          waitlisted_at: string | null
        }
        Insert: {
          attended?: boolean
          cancelled_at?: string | null
          companions?: number
          event_id: string
          id?: string
          member_id: string
          note?: string | null
          registered_at?: string
          status?: Database["public"]["Enums"]["event_registration_status"]
          updated_at?: string
          waitlisted_at?: string | null
        }
        Update: {
          attended?: boolean
          cancelled_at?: string | null
          companions?: number
          event_id?: string
          id?: string
          member_id?: string
          note?: string | null
          registered_at?: string
          status?: Database["public"]["Enums"]["event_registration_status"]
          updated_at?: string
          waitlisted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          cancelled_at: string | null
          companions_allowed: boolean
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          fee_cents: number | null
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          location: string | null
          max_participants: number | null
          members_notified_at: string | null
          published_at: string | null
          registration_deadline: string | null
          registration_enabled: boolean
          reminder_sent_at: string | null
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
          work_hours: number | null
        }
        Insert: {
          cancelled_at?: string | null
          companions_allowed?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          fee_cents?: number | null
          id?: string
          kind: Database["public"]["Enums"]["event_kind"]
          location?: string | null
          max_participants?: number | null
          members_notified_at?: string | null
          published_at?: string | null
          registration_deadline?: string | null
          registration_enabled?: boolean
          reminder_sent_at?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string
          work_hours?: number | null
        }
        Update: {
          cancelled_at?: string | null
          companions_allowed?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          fee_cents?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          location?: string | null
          max_participants?: number | null
          members_notified_at?: string | null
          published_at?: string | null
          registration_deadline?: string | null
          registration_enabled?: boolean
          reminder_sent_at?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string
          work_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
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
      legal_documents: {
        Row: {
          active: boolean
          body_md: string
          code: string
          created_at: string
          id: string
          title: string
          valid_from: string
          version: number
        }
        Insert: {
          active?: boolean
          body_md: string
          code: string
          created_at?: string
          id?: string
          title: string
          valid_from?: string
          version: number
        }
        Update: {
          active?: boolean
          body_md?: string
          code?: string
          created_at?: string
          id?: string
          title?: string
          valid_from?: string
          version?: number
        }
        Relationships: []
      }
      member_attribute_options: {
        Row: {
          active: boolean
          attribute_type_id: string
          id: string
          label: string
          sort_order: number
          value: string
        }
        Insert: {
          active?: boolean
          attribute_type_id: string
          id?: string
          label: string
          sort_order?: number
          value: string
        }
        Update: {
          active?: boolean
          attribute_type_id?: string
          id?: string
          label?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_attribute_options_attribute_type_id_fkey"
            columns: ["attribute_type_id"]
            isOneToOne: false
            referencedRelation: "member_attribute_types"
            referencedColumns: ["id"]
          },
        ]
      }
      member_attribute_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string
          id: string
          in_application: boolean
          multiple: boolean
          name: string
          self_editable: boolean
          sort_order: number
          updated_at: string
          value_kind: Database["public"]["Enums"]["attribute_kind"]
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description: string
          id?: string
          in_application?: boolean
          multiple?: boolean
          name: string
          self_editable?: boolean
          sort_order?: number
          updated_at?: string
          value_kind?: Database["public"]["Enums"]["attribute_kind"]
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string
          id?: string
          in_application?: boolean
          multiple?: boolean
          name?: string
          self_editable?: boolean
          sort_order?: number
          updated_at?: string
          value_kind?: Database["public"]["Enums"]["attribute_kind"]
        }
        Relationships: []
      }
      member_attribute_values: {
        Row: {
          attribute_type_id: string
          id: string
          member_id: string
          option_id: string | null
          set_at: string
          set_by: string | null
          text_value: string | null
        }
        Insert: {
          attribute_type_id: string
          id?: string
          member_id: string
          option_id?: string | null
          set_at?: string
          set_by?: string | null
          text_value?: string | null
        }
        Update: {
          attribute_type_id?: string
          id?: string
          member_id?: string
          option_id?: string | null
          set_at?: string
          set_by?: string | null
          text_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_attribute_values_attribute_type_id_fkey"
            columns: ["attribute_type_id"]
            isOneToOne: false
            referencedRelation: "member_attribute_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_attribute_values_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_attribute_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "member_attribute_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_attribute_values_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_consents: {
        Row: {
          accepted_at: string
          document_code: string
          id: string
          member_id: string
          version: number
        }
        Insert: {
          accepted_at?: string
          document_code: string
          id?: string
          member_id: string
          version: number
        }
        Update: {
          accepted_at?: string
          document_code?: string
          id?: string
          member_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "member_consents_document_code_version_fkey"
            columns: ["document_code", "version"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["code", "version"]
          },
          {
            foreignKeyName: "member_consents_member_id_fkey"
            columns: ["member_id"]
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
          birthday: string | null
          city: string | null
          country_code: string | null
          created_at: string
          ebusy_person_id: number | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          first_name: string
          gender: Database["public"]["Enums"]["gender"] | null
          guardian_consent_at: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          import_notes: string | null
          imported_at: string | null
          invited_at: string | null
          is_team_captain: boolean
          is_trainer: boolean
          last_name: string
          legacy_data: Json | null
          login_disabled_at: string | null
          mobile: string | null
          nationality_code: string | null
          notes: string | null
          nuliga_id: string | null
          onboarding_completed_at: string | null
          onboarding_stammdaten_at: string | null
          phone: string | null
          playing_right: Database["public"]["Enums"]["playing_right"]
          playing_right_since: string | null
          postcode: string | null
          salutation: Database["public"]["Enums"]["salutation"] | null
          source: Database["public"]["Enums"]["record_source"]
          status: Database["public"]["Enums"]["member_status"]
          street: string | null
          team_id: string | null
          tennis_lk: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          birthday?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          ebusy_person_id?: number | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name: string
          gender?: Database["public"]["Enums"]["gender"] | null
          guardian_consent_at?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          import_notes?: string | null
          imported_at?: string | null
          invited_at?: string | null
          is_team_captain?: boolean
          is_trainer?: boolean
          last_name: string
          legacy_data?: Json | null
          login_disabled_at?: string | null
          mobile?: string | null
          nationality_code?: string | null
          notes?: string | null
          nuliga_id?: string | null
          onboarding_completed_at?: string | null
          onboarding_stammdaten_at?: string | null
          phone?: string | null
          playing_right?: Database["public"]["Enums"]["playing_right"]
          playing_right_since?: string | null
          postcode?: string | null
          salutation?: Database["public"]["Enums"]["salutation"] | null
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["member_status"]
          street?: string | null
          team_id?: string | null
          tennis_lk?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          birthday?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          ebusy_person_id?: number | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          guardian_consent_at?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          import_notes?: string | null
          imported_at?: string | null
          invited_at?: string | null
          is_team_captain?: boolean
          is_trainer?: boolean
          last_name?: string
          legacy_data?: Json | null
          login_disabled_at?: string | null
          mobile?: string | null
          nationality_code?: string | null
          notes?: string | null
          nuliga_id?: string | null
          onboarding_completed_at?: string | null
          onboarding_stammdaten_at?: string | null
          phone?: string | null
          playing_right?: Database["public"]["Enums"]["playing_right"]
          playing_right_since?: string | null
          postcode?: string | null
          salutation?: Database["public"]["Enums"]["salutation"] | null
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["member_status"]
          street?: string | null
          team_id?: string | null
          tennis_lk?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_applications: {
        Row: {
          attribute_choices: Json
          birthday: string
          city: string | null
          confirmation_mails: number
          confirmation_sent_at: string | null
          confirmation_token_hash: string | null
          confirmed_at: string | null
          country_code: string | null
          created_member_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          desired_fee_type_id: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          first_name: string
          gender: Database["public"]["Enums"]["gender"] | null
          guardian_email: string | null
          guardian_name: string | null
          id: string
          ip_hash: string | null
          last_name: string
          message: string | null
          mobile: string | null
          phone: string | null
          possible_duplicate: boolean
          postcode: string | null
          salutation: Database["public"]["Enums"]["salutation"] | null
          status: Database["public"]["Enums"]["application_status"]
          street: string | null
          submitted_at: string
          title: string | null
          user_agent: string | null
        }
        Insert: {
          attribute_choices?: Json
          birthday: string
          city?: string | null
          confirmation_mails?: number
          confirmation_sent_at?: string | null
          confirmation_token_hash?: string | null
          confirmed_at?: string | null
          country_code?: string | null
          created_member_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          desired_fee_type_id?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name: string
          gender?: Database["public"]["Enums"]["gender"] | null
          guardian_email?: string | null
          guardian_name?: string | null
          id?: string
          ip_hash?: string | null
          last_name: string
          message?: string | null
          mobile?: string | null
          phone?: string | null
          possible_duplicate?: boolean
          postcode?: string | null
          salutation?: Database["public"]["Enums"]["salutation"] | null
          status?: Database["public"]["Enums"]["application_status"]
          street?: string | null
          submitted_at?: string
          title?: string | null
          user_agent?: string | null
        }
        Update: {
          attribute_choices?: Json
          birthday?: string
          city?: string | null
          confirmation_mails?: number
          confirmation_sent_at?: string | null
          confirmation_token_hash?: string | null
          confirmed_at?: string | null
          country_code?: string | null
          created_member_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          desired_fee_type_id?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          guardian_email?: string | null
          guardian_name?: string | null
          id?: string
          ip_hash?: string | null
          last_name?: string
          message?: string | null
          mobile?: string | null
          phone?: string | null
          possible_duplicate?: boolean
          postcode?: string | null
          salutation?: Database["public"]["Enums"]["salutation"] | null
          status?: Database["public"]["Enums"]["application_status"]
          street?: string | null
          submitted_at?: string
          title?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_applications_created_member_id_fkey"
            columns: ["created_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_applications_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_applications_desired_fee_type_id_fkey"
            columns: ["desired_fee_type_id"]
            isOneToOne: false
            referencedRelation: "fee_types"
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
          legacy_data: Json | null
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
          legacy_data?: Json | null
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
          legacy_data?: Json | null
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
          booking_id: string | null
          created_at: string
          event_id: string | null
          id: string
          kind: string
          mail_discarded_at: string | null
          mailed_at: string | null
          member_id: string
          push_discarded_at: string | null
          pushed_at: string | null
          read_at: string | null
          title: string
        }
        Insert: {
          body: string
          booking_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          kind: string
          mail_discarded_at?: string | null
          mailed_at?: string | null
          member_id: string
          push_discarded_at?: string | null
          pushed_at?: string | null
          read_at?: string | null
          title: string
        }
        Update: {
          body?: string
          booking_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          kind?: string
          mail_discarded_at?: string | null
          mailed_at?: string | null
          member_id?: string
          push_discarded_at?: string | null
          pushed_at?: string | null
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          disabled_at: string | null
          id: string
          last_seen_at: string
          member_id: string
          platform: string
          provider: string
          token: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          disabled_at?: string | null
          id?: string
          last_seen_at?: string
          member_id: string
          platform: string
          provider?: string
          token: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          disabled_at?: string | null
          id?: string
          last_seen_at?: string
          member_id?: string
          platform?: string
          provider?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      sepa_mandates: {
        Row: {
          accepted_holder: string | null
          bank_account_id: string
          created_at: string
          ebusy_id: number | null
          granted_online_at: string | null
          id: string
          last_used_on: string | null
          mandate_text: string | null
          member_id: string
          reference: string
          reference_conflict: boolean
          revoked_on: string | null
          sequence_type: Database["public"]["Enums"]["mandate_sequence"]
          signed_on: string
          source: Database["public"]["Enums"]["record_source"]
          status: Database["public"]["Enums"]["mandate_status"]
          updated_at: string
        }
        Insert: {
          accepted_holder?: string | null
          bank_account_id: string
          created_at?: string
          ebusy_id?: number | null
          granted_online_at?: string | null
          id?: string
          last_used_on?: string | null
          mandate_text?: string | null
          member_id: string
          reference: string
          reference_conflict?: boolean
          revoked_on?: string | null
          sequence_type?: Database["public"]["Enums"]["mandate_sequence"]
          signed_on: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["mandate_status"]
          updated_at?: string
        }
        Update: {
          accepted_holder?: string | null
          bank_account_id?: string
          created_at?: string
          ebusy_id?: number | null
          granted_online_at?: string | null
          id?: string
          last_used_on?: string | null
          mandate_text?: string | null
          member_id?: string
          reference?: string
          reference_conflict?: boolean
          revoked_on?: string | null
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
      teams: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      work_duty_entries: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string | null
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
          event_id?: string | null
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
          event_id?: string | null
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
            foreignKeyName: "work_duty_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
      accept_membership_application: {
        Args: {
          p_application_id: string
          p_auth_user_id?: string
          p_fee_type_ids?: string[]
          p_number?: string
          p_started_on?: string
        }
        Returns: {
          member_id: string
          membership_number: string
        }[]
      }
      add_bank_account: {
        Args: {
          p_bank_name?: string
          p_holder?: string
          p_iban: string
          p_member_id: string
        }
        Returns: string
      }
      add_charges_to_debit_batch: {
        Args: { p_batch_id: string; p_payer_ids?: string[] }
        Returns: {
          aufgenommen: number
          summe_cents: number
          uebersprungen: number
        }[]
      }
      am_i_admin: { Args: never; Returns: boolean }
      announce_charges: {
        Args: {
          p_charge_ids?: string[]
          p_due_date: string
          p_kind?: Database["public"]["Enums"]["charge_kind"]
          p_period_label?: string
        }
        Returns: {
          angekuendigt: number
          empfaenger: number
          faellig_am: string
          summe_cents: number
        }[]
      }
      announceable_charges: {
        Args: {
          p_kind?: Database["public"]["Enums"]["charge_kind"]
          p_period_label?: string
        }
        Returns: {
          anzahl: number
          summe_cents: number
          zahler: number
        }[]
      }
      anonymize_member: {
        Args: { p_member_id: string; p_reason?: string }
        Returns: undefined
      }
      application_form_options: {
        Args: never
        Returns: {
          amount_cents: number
          art: string
          code: string
          description: string
          name: string
        }[]
      }
      archive_member: {
        Args: { p_force?: boolean; p_member_id: string; p_reason?: string }
        Returns: {
          cancelled_bookings: number
          open_amount_cents: number
          open_charges: number
        }[]
      }
      begin_membership_application: {
        Args: { p_data: Json; p_ip?: string; p_user_agent?: string }
        Returns: {
          application_id: string
          email: string
          first_name: string
          token: string
        }[]
      }
      billing_period_overview: {
        Args: { p_limit?: number }
        Returns: {
          buchungen: number
          charged_at: string
          closed_at: string
          forderungen: number
          id: string
          mitglieder: number
          month: number
          offen: number
          offen_cents: number
          status: Database["public"]["Enums"]["billing_period_status"]
          summe_cents: number
          year: number
        }[]
      }
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
      booking_types_aktiv: {
        Args: { p_applies_to: Database["public"]["Enums"]["booking_kind"] }
        Returns: {
          code: string
          duration_minutes: number
          max_players: number
          min_players: number
          name: string
          requires_partner: boolean
          sort_order: number
        }[]
      }
      cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: undefined
      }
      cancel_series_occurrence: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: undefined
      }
      charge_billing_period: {
        Args: { p_due_date?: string; p_month: number; p_year: number }
        Returns: {
          erzeugt: number
          summe_cents: number
        }[]
      }
      charge_overview: {
        Args: {
          p_kind?: Database["public"]["Enums"]["charge_kind"]
          p_limit?: number
          p_status?: Database["public"]["Enums"]["charge_status"]
        }
        Returns: {
          amount_cents: number
          created_at: string
          description: string
          due_date: string
          hat_mandat: boolean
          id: string
          kind: Database["public"]["Enums"]["charge_kind"]
          member_id: string
          member_name: string
          notified_at: string
          payer_id: string
          payer_name: string
          period_label: string
          status: Database["public"]["Enums"]["charge_status"]
        }[]
      }
      claim_notification_mails: {
        Args: { p_limit?: number }
        Returns: {
          email: string
          first_name: string
          items: Json
          member_id: string
          notification_ids: string[]
        }[]
      }
      claim_notification_pushes: {
        Args: { p_limit?: number }
        Returns: {
          geraete: Json
          items: Json
          member_id: string
          notification_ids: string[]
          tokens: string[]
        }[]
      }
      close_billing_period: {
        Args: { p_month: number; p_year: number }
        Returns: {
          buchungen: number
          mitglieder: number
          summe_cents: number
        }[]
      }
      complete_debit_batch: {
        Args: { p_batch_id: string }
        Returns: {
          eingezogen: number
          summe_cents: number
          zurueck: number
        }[]
      }
      complete_onboarding: { Args: never; Returns: string }
      confirm_membership_application: {
        Args: { p_token: string }
        Returns: string
      }
      court_overview: {
        Args: never
        Returns: {
          active: boolean
          id: string
          name: string
          offene_buchungen: number
          short_name: string
          sort_position: number
          subline: string
        }[]
      }
      courts_aktiv: {
        Args: never
        Returns: {
          id: string
          name: string
          position: number
          short_name: string
        }[]
      }
      create_blocking: {
        Args: {
          p_bis: string
          p_court_ids: string[]
          p_force?: boolean
          p_title: string
          p_type_code: string
          p_von: string
        }
        Returns: {
          created_count: number
          displaced_count: number
        }[]
      }
      create_booking: {
        Args: {
          p_booking_type_code: string
          p_court_id: string
          p_guest_names?: string[]
          p_partner_wanted?: boolean
          p_player_member_ids?: string[]
          p_starts_at: string
        }
        Returns: string
      }
      create_debit_batch: {
        Args: {
          p_collection_date: string
          p_kinds?: Database["public"]["Enums"]["charge_kind"][]
          p_title: string
        }
        Returns: string
      }
      create_manual_charge: {
        Args: {
          p_amount_cents: number
          p_description: string
          p_due_date?: string
          p_kind: Database["public"]["Enums"]["charge_kind"]
          p_member_id: string
          p_period_label?: string
        }
        Returns: string
      }
      create_member: {
        Args: {
          p_auth_user_id?: string
          p_birthday?: string
          p_city?: string
          p_country_code?: string
          p_email?: string
          p_fee_type_ids?: string[]
          p_first_name: string
          p_gender?: Database["public"]["Enums"]["gender"]
          p_last_name: string
          p_mobile?: string
          p_notes?: string
          p_number?: string
          p_phone?: string
          p_postcode?: string
          p_salutation?: Database["public"]["Enums"]["salutation"]
          p_started_on?: string
          p_street?: string
          p_title?: string
        }
        Returns: string
      }
      create_my_sepa_mandate: {
        Args: { p_accept?: boolean; p_holder?: string; p_iban: string }
        Returns: string
      }
      create_sepa_mandate: {
        Args: {
          p_bank_account_id: string
          p_member_id: string
          p_reference?: string
          p_signed_on?: string
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
          bin_dabei: boolean
          booking_id: string
          court_id: string
          ends_at: string
          frei: number
          guest_names: string[]
          is_own: boolean
          kind: Database["public"]["Enums"]["booking_kind"]
          owner_member_id: string
          owner_name: string
          partner_wanted: boolean
          player_member_ids: string[]
          players: string[]
          series_id: string
          starts_at: string
          title: string
          type_code: string
          type_name: string
        }[]
      }
      deactivate_bank_account: {
        Args: { p_bank_account_id: string }
        Returns: undefined
      }
      debit_batch_candidates: {
        Args: {
          p_collection_date: string
          p_kinds?: Database["public"]["Enums"]["charge_kind"][]
        }
        Returns: {
          amount_cents: number
          arten: string
          charge_ids: string[]
          einzugsfaehig: boolean
          grund: string
          kinds: Database["public"]["Enums"]["charge_kind"][]
          mandate_id: string
          mandate_reference: string
          payer_id: string
          payer_name: string
          positionen: number
        }[]
      }
      debit_batch_items: {
        Args: { p_batch_id: string }
        Returns: {
          amount_cents: number
          end_to_end_id: string
          kinds: Database["public"]["Enums"]["charge_kind"][]
          mandate_reference: string
          mitglieder: string
          payer_name: string
          positionen: number
          result: Database["public"]["Enums"]["debit_item_result"]
          return_reason: string
          returned_on: string
        }[]
      }
      debit_batch_kinds: {
        Args: { p_batch_id: string }
        Returns: {
          kind: Database["public"]["Enums"]["charge_kind"]
          positionen: number
          summe_cents: number
        }[]
      }
      debit_batch_overview: {
        Args: { p_limit?: number }
        Returns: {
          collection_date: string
          created_at: string
          hat_datei: boolean
          id: string
          item_count: number
          kinds: Database["public"]["Enums"]["charge_kind"][]
          positionen: number
          status: Database["public"]["Enums"]["debit_batch_status"]
          title: string
          total_cents: number
          zurueck: number
        }[]
      }
      debit_batch_payload: {
        Args: { p_batch_id: string }
        Returns: {
          amount_cents: number
          collection_date: string
          creditor_bic: string
          creditor_iban: string
          creditor_id: string
          creditor_name: string
          debtor_iban: string
          debtor_name: string
          end_to_end_id: string
          kind: Database["public"]["Enums"]["charge_kind"]
          mandate_last_used_on: string
          mandate_reference: string
          mandate_signed_on: string
          pain_version: string
          remittance_info: string
          sequence_type: Database["public"]["Enums"]["mandate_sequence"]
          title: string
        }[]
      }
      decline_membership_application: {
        Args: { p_application_id: string; p_note?: string }
        Returns: undefined
      }
      delete_member: {
        Args: { p_confirm_name: string; p_member_id: string }
        Returns: undefined
      }
      delete_member_attribute_type: {
        Args: { p_code: string }
        Returns: undefined
      }
      delete_team: { Args: { p_id: string }; Returns: undefined }
      delete_work_duty: { Args: { p_entry_id: string }; Returns: undefined }
      disable_push_token: { Args: { p_token: string }; Returns: undefined }
      drink_item_overview: {
        Args: never
        Returns: {
          active: boolean
          buchungen: number
          buchungen_offen: number
          category: Database["public"]["Enums"]["drink_category"]
          description: string
          id: string
          naechster_preis_ab: string
          naechster_preis_cents: number
          name: string
          price_cents: number
          price_valid_from: string
          sort_order: number
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
      drink_price_history: {
        Args: { p_item_id: string }
        Returns: {
          geplant: boolean
          ist_aktuell: boolean
          price_cents: number
          valid_from: string
        }[]
      }
      drink_void_window_minutes: { Args: never; Returns: number }
      einzug_gruppen: {
        Args: never
        Returns: {
          anzahl: number
          event_id: string
          kind: Database["public"]["Enums"]["charge_kind"]
          mitglieder: number
          period_label: string
          ruecklaeufer: boolean
          summe_cents: number
          titel: string
        }[]
      }
      einzug_loeschen: { Args: { p_batch_id: string }; Returns: undefined }
      einzug_mitglied_entfernen: {
        Args: { p_batch_id: string; p_end_to_end_id: string }
        Returns: undefined
      }
      einzug_vorbereiten: {
        Args: { p_collection_date: string; p_gruppen: Json; p_title?: string }
        Returns: {
          ausnahmen: number
          batch_id: string
          forderungen: number
          lastschriften: number
          summe_cents: number
        }[]
      }
      einzug_vorschau: {
        Args: { p_collection_date: string; p_gruppen: Json }
        Returns: {
          amount_cents: number
          arten: string
          einzugsfaehig: boolean
          grund: string
          kinds: Database["public"]["Enums"]["charge_kind"][]
          mandate_reference: string
          member_id: string
          member_name: string
          positionen: number
        }[]
      }
      end_membership: {
        Args: {
          p_cancellation_date?: string
          p_ended_on?: string
          p_member_id: string
          p_reason?: string
          p_set_inactive?: boolean
        }
        Returns: {
          future_bookings: number
          open_amount_cents: number
          open_charges: number
        }[]
      }
      end_series: {
        Args: { p_ab?: string; p_series_id: string }
        Returns: number
      }
      ensure_default_settings: { Args: never; Returns: number }
      event_abmelden: { Args: { p_event_id: string }; Returns: undefined }
      event_absagen: {
        Args: { p_id: string }
        Returns: {
          geloescht: number
          verbleibend: number
        }[]
      }
      event_admin_abmelden: {
        Args: { p_registration_id: string }
        Returns: undefined
      }
      event_admin_aendern: {
        Args: {
          p_companions: number
          p_note?: string
          p_registration_id: string
        }
        Returns: undefined
      }
      event_admin_anmelden: {
        Args: {
          p_companions?: number
          p_event_id: string
          p_member_id: string
          p_note?: string
        }
        Returns: string
      }
      event_anmelden: {
        Args: { p_companions?: number; p_event_id: string; p_note?: string }
        Returns: Database["public"]["Enums"]["event_registration_status"]
      }
      event_anmeldung_aendern: {
        Args: { p_companions: number; p_event_id: string; p_note?: string }
        Returns: Database["public"]["Enums"]["event_registration_status"]
      }
      event_anwesenheit_setzen: {
        Args: { p_attended: boolean; p_registration_id: string }
        Returns: undefined
      }
      event_loeschen: { Args: { p_id: string }; Returns: undefined }
      event_mein_wartelistenplatz: {
        Args: { p_event_id: string }
        Returns: number
      }
      event_mitglieder_benachrichtigen: {
        Args: { p_id: string }
        Returns: number
      }
      event_speichern: {
        Args: {
          p_companions_allowed: boolean
          p_description: string
          p_ends_at: string
          p_fee_cents: number
          p_id: string
          p_kind: Database["public"]["Enums"]["event_kind"]
          p_location: string
          p_max_participants: number
          p_registration_deadline: string
          p_registration_enabled: boolean
          p_starts_at: string
          p_title: string
          p_veroeffentlichen?: boolean
          p_work_hours: number
        }
        Returns: string
      }
      event_stunden_gutschreiben: {
        Args: { p_event_id: string }
        Returns: {
          gutgeschrieben: number
          uebersprungen: number
        }[]
      }
      event_teilnehmer: {
        Args: { p_event_id: string }
        Returns: {
          attended: boolean
          cancelled_at: string
          charge_cents: number
          charge_gesperrt: boolean
          charge_id: string
          charge_status: Database["public"]["Enums"]["charge_status"]
          companions: number
          gutgeschrieben: boolean
          member_id: string
          member_name: string
          note: string
          registered_at: string
          registration_id: string
          status: Database["public"]["Enums"]["event_registration_status"]
          waitlisted_at: string
        }[]
      }
      event_veroeffentlichen: { Args: { p_id: string }; Returns: undefined }
      event_verwaltung: {
        Args: never
        Returns: {
          abgemeldet: number
          anmeldungen: number
          anwesend: number
          begleitpersonen: number
          cancelled_at: string
          companions_allowed: boolean
          created_at: string
          description: string
          einziehbar: number
          einziehbar_cents: number
          ends_at: string
          fee_cents: number
          forderungen: number
          forderungen_cents: number
          gutgeschrieben: number
          id: string
          im_einzug: number
          kind: Database["public"]["Enums"]["event_kind"]
          location: string
          max_participants: number
          personen: number
          published_at: string
          registration_deadline: string
          registration_enabled: boolean
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          warteliste: number
          work_hours: number
        }[]
      }
      events_fuer_mitglied: {
        Args: never
        Returns: {
          companions_allowed: boolean
          description: string
          ends_at: string
          fee_cents: number
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          location: string
          max_participants: number
          mein_status: Database["public"]["Enums"]["event_registration_status"]
          meine_begleitpersonen: number
          meine_bemerkung: string
          meine_forderung_cents: number
          meine_forderung_status: Database["public"]["Enums"]["charge_status"]
          personen: number
          registration_deadline: string
          registration_enabled: boolean
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          warteliste: number
          work_hours: number
        }[]
      }
      fee_run_execute: {
        Args: { p_due_date?: string; p_year: number }
        Returns: {
          erzeugt: number
          summe_cents: number
          uebersprungen: number
        }[]
      }
      fee_run_preview: {
        Args: { p_year: number }
        Returns: {
          already_charged: boolean
          amount_cents: number
          fee_types: string
          has_mandate: boolean
          member_id: string
          member_name: string
          payer_name: string
        }[]
      }
      fee_type_overview: {
        Args: { p_year?: number }
        Returns: {
          active: boolean
          code: string
          description: string
          id: string
          mitglieder: number
          naechster_preis_ab_jahr: number
          naechster_preis_cents: number
          name: string
          preis_ab_jahr: number
          preis_cents: number
          soll_stunden: number
          sort_order: number
        }[]
      }
      iban_check_digits: {
        Args: { p_bban: string; p_country?: string }
        Returns: string
      }
      iban_is_valid: { Args: { p_iban: string }; Returns: boolean }
      iban_to_numeric: { Args: { p_text: string }; Returns: string }
      ich: {
        Args: never
        Returns: {
          admin: boolean
          first_name: string
          grund: string
          kiosk: boolean
          last_name: string
          member_id: string
          onboarding_offen: boolean
          platz_rechte: boolean
          roles: Database["public"]["Enums"]["app_role"][]
          zugang: boolean
        }[]
      }
      ist_testadresse: { Args: { p_email: string }; Returns: boolean }
      join_booking: { Args: { p_booking_id: string }; Returns: undefined }
      konto_loeschung_beantragen: {
        Args: { p_nachricht?: string }
        Returns: boolean
      }
      leave_booking: { Args: { p_booking_id: string }; Returns: undefined }
      link_auth_user: {
        Args: { p_auth_user_id: string; p_member_id: string }
        Returns: undefined
      }
      mark_application_spam: {
        Args: { p_application_id: string }
        Returns: undefined
      }
      mark_debit_batch_generated: {
        Args: {
          p_batch_id: string
          p_item_count: number
          p_storage_path: string
          p_total_cents: number
        }
        Returns: undefined
      }
      mark_debit_batch_submitted: {
        Args: { p_batch_id: string; p_submitted_on?: string }
        Returns: undefined
      }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      mein_mandat: {
        Args: never
        Returns: {
          bank_name: string
          holder: string
          iban_last4: string
          reference: string
          signed_on: string
          status: Database["public"]["Enums"]["mandate_status"]
        }[]
      }
      mein_profil: {
        Args: never
        Returns: {
          city: string
          emergency_contact_name: string
          emergency_contact_phone: string
          emergency_contact_relation: string
          first_name: string
          is_team_captain: boolean
          last_name: string
          member_since: string
          membership_number: string
          mobile: string
          phone: string
          postcode: string
          street: string
          team_name: string
          title: string
        }[]
      }
      mein_zugang: {
        Args: never
        Returns: {
          grund: string
          onboarding_offen: boolean
          zugang: boolean
        }[]
      }
      member_attributes: {
        Args: { p_member_id: string }
        Returns: {
          code: string
          darf_ich: boolean
          description: string
          multiple: boolean
          name: string
          option_label: string
          option_value: string
          optionen: Json
          self_editable: boolean
          set_at: string
          text_value: string
          value_kind: Database["public"]["Enums"]["attribute_kind"]
        }[]
      }
      member_delete_impact: {
        Args: { p_member_id: string }
        Returns: {
          bank_accounts: number
          booking_players: number
          bookings: number
          can_delete: boolean
          charges: number
          drink_purchases: number
          mandates: number
          reason: string
          work_duty_entries: number
        }[]
      }
      member_directory: {
        Args: { p_query?: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
        }[]
      }
      member_fee_overview: {
        Args: { p_member_id: string; p_year: number }
        Returns: {
          code: string
          effektiv_cents: number
          fee_type_id: string
          name: string
          note: string
          override_amount_cents: number
          preis_cents: number
          zugeordnet: boolean
        }[]
      }
      member_finances: {
        Args: { p_member_id: string }
        Returns: {
          bank_account_id: string
          bank_name: string
          holder: string
          iban_last4: string
          im_einzug: boolean
          konto_aktiv: boolean
          last_used_on: string
          mandat_status: Database["public"]["Enums"]["mandate_status"]
          mandate_id: string
          reference: string
          reference_conflict: boolean
          revoked_on: string
          sequence_type: Database["public"]["Enums"]["mandate_sequence"]
          signed_on: string
        }[]
      }
      member_for_login_admin: {
        Args: { p_member_id: string }
        Returns: {
          auth_user_id: string
          email: string
          id: string
          name: string
          status: Database["public"]["Enums"]["member_status"]
        }[]
      }
      member_login_state: {
        Args: { p_member_id: string }
        Returns: {
          disabled_at: string
          email: string
          grund: string
          hat_zugang: boolean
          invited_at: string
          ist_admin: boolean
          last_sign_in: string
        }[]
      }
      member_notes: { Args: { p_member_id: string }; Returns: string }
      member_overview: {
        Args: { p_filter?: string; p_limit?: number; p_query?: string }
        Returns: {
          birthday: string
          email: string
          ended_on: string
          first_name: string
          has_login: boolean
          id: string
          is_admin: boolean
          is_trainer: boolean
          last_name: string
          number: string
          roles: Database["public"]["Enums"]["app_role"][]
          started_on: string
          status: Database["public"]["Enums"]["member_status"]
        }[]
      }
      membership_application_confirmation_state: {
        Args: { p_token: string }
        Returns: string
      }
      mod97: { Args: { p_digits: string }; Returns: number }
      move_booking: {
        Args: {
          p_booking_id: string
          p_court_id: string
          p_reason?: string
          p_starts_at: string
        }
        Returns: undefined
      }
      my_booking_quota: {
        Args: never
        Returns: {
          allowed: number
          used: number
        }[]
      }
      my_bookings: {
        Args: { p_ab?: string }
        Returns: {
          bin_bucher: boolean
          booking_id: string
          court_name: string
          ends_at: string
          kind: Database["public"]["Enums"]["booking_kind"]
          owner_name: string
          players: string[]
          starts_at: string
          title: string
          type_code: string
          type_name: string
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
      my_notifications: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          created_at: string
          event_id: string
          id: string
          kind: string
          read_at: string
          title: string
        }[]
      }
      my_onboarding: { Args: never; Returns: Json }
      my_unread_notification_count: { Args: never; Returns: number }
      my_work_duty: {
        Args: { p_year?: number }
        Returns: {
          completed_hours: number
          missing_hours: number
          required_hours: number
          year: number
        }[]
      }
      my_work_duty_entries: {
        Args: { p_year?: number }
        Returns: {
          bestaetigt: boolean
          created_at: string
          description: string
          erfasst_von: string
          hours: number
          id: string
          worked_on: string
        }[]
      }
      onboarding_accept_documents: {
        Args: { p_codes: string[] }
        Returns: undefined
      }
      onboarding_save_guardian: {
        Args: {
          p_consent?: boolean
          p_email?: string
          p_name: string
          p_phone?: string
        }
        Returns: undefined
      }
      onboarding_save_notfallkontakt: {
        Args: { p_name: string; p_phone: string; p_relation?: string }
        Returns: undefined
      }
      onboarding_save_stammdaten: {
        Args: {
          p_birthday: string
          p_city: string
          p_country_code?: string
          p_first_name: string
          p_gender: Database["public"]["Enums"]["gender"]
          p_last_name: string
          p_mobile?: string
          p_nationality_code?: string
          p_phone?: string
          p_postcode: string
          p_salutation?: Database["public"]["Enums"]["salutation"]
          p_street: string
          p_title?: string
        }
        Returns: undefined
      }
      open_matches: {
        Args: { p_bis?: string; p_von?: string }
        Returns: {
          bin_dabei: boolean
          booking_id: string
          court_name: string
          ends_at: string
          frei: number
          owner_member_id: string
          owner_name: string
          players: string[]
          starts_at: string
          type_code: string
          type_name: string
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
      protokoll_zugang: {
        Args: { p_ereignis: string; p_member_id: string }
        Returns: undefined
      }
      push_token_aktiv: { Args: { p_token: string }; Returns: boolean }
      reactivate_member: { Args: { p_member_id: string }; Returns: undefined }
      reactivate_membership: {
        Args: {
          p_fee_type_ids?: string[]
          p_member_id: string
          p_number?: string
          p_started_on?: string
        }
        Returns: string
      }
      record_debit_return: {
        Args: {
          p_end_to_end_id: string
          p_reason: string
          p_returned_on?: string
        }
        Returns: {
          forderungen: number
          payer_name: string
          summe_cents: number
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
      record_work_duty: {
        Args: {
          p_description?: string
          p_hours: number
          p_member_id: string
          p_worked_on: string
        }
        Returns: string
      }
      register_push_token: {
        Args: {
          p_device_name?: string
          p_platform: string
          p_provider?: string
          p_token: string
        }
        Returns: undefined
      }
      release_membership_application_mail: {
        Args: { p_application_id: string }
        Returns: undefined
      }
      release_notification_mails: { Args: { p_ids: string[] }; Returns: number }
      release_notification_pushes: {
        Args: { p_ids: string[] }
        Returns: number
      }
      remove_charge_from_debit_batch: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      remove_drink_price: {
        Args: { p_item_id: string; p_valid_from: string }
        Returns: undefined
      }
      remove_member_attribute: {
        Args: {
          p_member_id: string
          p_option_value?: string
          p_type_code: string
        }
        Returns: undefined
      }
      remove_member_fee: {
        Args: { p_fee_type_id: string; p_member_id: string; p_year: number }
        Returns: undefined
      }
      remove_push_token: { Args: { p_token: string }; Returns: undefined }
      remove_work_duty_rule: {
        Args: { p_fee_type_id: string; p_year: number }
        Returns: undefined
      }
      reorder_courts: { Args: { p_ids: string[] }; Returns: number }
      reorder_drink_items: { Args: { p_ids: string[] }; Returns: number }
      revoke_sepa_mandate: {
        Args: { p_mandate_id: string; p_revoked_on?: string }
        Returns: undefined
      }
      save_my_notfallkontakt: {
        Args: { p_name: string; p_phone: string; p_relation?: string }
        Returns: undefined
      }
      save_my_profile: {
        Args: {
          p_city?: string
          p_first_name?: string
          p_last_name?: string
          p_mobile?: string
          p_phone?: string
          p_postcode?: string
          p_street?: string
          p_title?: string
        }
        Returns: undefined
      }
      save_my_tennis: {
        Args: {
          p_mannschaft_interesse?: boolean
          p_nuliga_id?: string
          p_tennis_lk?: string
        }
        Returns: undefined
      }
      series_overview: {
        Args: never
        Returns: {
          court_name: string
          end_time: string
          id: string
          kuenftige: number
          start_time: string
          title: string
          type_name: string
          valid_from: string
          valid_to: string
          weekday: number
        }[]
      }
      set_court_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: number
      }
      set_drink_item_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: number
      }
      set_drink_price: {
        Args: {
          p_item_id: string
          p_price_cents: number
          p_valid_from?: string
        }
        Returns: number
      }
      set_fee_price: {
        Args: {
          p_amount_cents: number
          p_fee_type_id: string
          p_valid_from_year: number
        }
        Returns: undefined
      }
      set_fee_type_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: number
      }
      set_login_disabled: {
        Args: { p_disabled: boolean; p_member_id: string }
        Returns: undefined
      }
      set_member_attribute: {
        Args: {
          p_member_id: string
          p_option_value?: string
          p_text_value?: string
          p_type_code: string
        }
        Returns: undefined
      }
      set_member_attribute_options: {
        Args: { p_options: Json; p_type_id: string }
        Returns: number
      }
      set_member_fee: {
        Args: {
          p_fee_type_id: string
          p_member_id: string
          p_note?: string
          p_override_amount_cents?: number
          p_year: number
        }
        Returns: {
          already_charged: boolean
        }[]
      }
      set_member_role: {
        Args: {
          p_granted: boolean
          p_member_id: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      set_member_team: {
        Args: {
          p_is_captain?: boolean
          p_member_id: string
          p_team_id?: string
        }
        Returns: undefined
      }
      set_partner_wanted: {
        Args: { p_booking_id: string; p_wanted: boolean }
        Returns: undefined
      }
      set_setting: {
        Args: { p_key: string; p_value: string }
        Returns: undefined
      }
      setting_int: { Args: { p_key: string }; Returns: number }
      setting_text: { Args: { p_key: string }; Returns: string }
      setting_time: { Args: { p_key: string }; Returns: string }
      settle_charge_manually: {
        Args: { p_charge_id: string; p_note?: string }
        Returns: undefined
      }
      submit_membership_application: {
        Args: { p_data: Json; p_ip?: string; p_user_agent?: string }
        Returns: undefined
      }
      team_overview: {
        Args: never
        Returns: {
          active: boolean
          captain_name: string
          id: string
          member_count: number
          name: string
          sort_order: number
        }[]
      }
      team_roster: {
        Args: { p_team_id: string }
        Returns: {
          first_name: string
          is_team_captain: boolean
          last_name: string
          member_id: string
        }[]
      }
      update_blocking: {
        Args: {
          p_bis: string
          p_booking_id: string
          p_court_ids: string[]
          p_force?: boolean
          p_title: string
          p_type_code: string
          p_von: string
        }
        Returns: {
          created_count: number
          displaced_count: number
        }[]
      }
      update_booking_players: {
        Args: {
          p_booking_id: string
          p_guest_names?: string[]
          p_member_ids?: string[]
        }
        Returns: undefined
      }
      update_member: {
        Args: { p_member_id: string; p_patch: Json }
        Returns: undefined
      }
      update_membership: {
        Args: { p_membership_id: string; p_patch: Json }
        Returns: undefined
      }
      update_series: {
        Args: {
          p_displace?: boolean
          p_end_time: string
          p_series_id: string
          p_start_time: string
          p_title: string
          p_valid_to?: string
        }
        Returns: {
          cancelled_count: number
          created_count: number
          displaced_count: number
        }[]
      }
      upsert_booking_type: {
        Args: {
          p_active?: boolean
          p_applies_to: Database["public"]["Enums"]["booking_kind"]
          p_code: string
          p_counts_towards_quota: boolean
          p_duration_minutes: number
          p_max_players: number
          p_min_players: number
          p_name: string
          p_requires_partner: boolean
          p_sort_order?: number
        }
        Returns: string
      }
      upsert_court: {
        Args: {
          p_id: string
          p_name: string
          p_position?: number
          p_short_name: string
          p_subline?: string
        }
        Returns: string
      }
      upsert_drink_item: {
        Args: {
          p_category?: Database["public"]["Enums"]["drink_category"]
          p_description?: string
          p_id: string
          p_name: string
          p_price_cents?: number
          p_sort_order?: number
        }
        Returns: string
      }
      upsert_fee_type: {
        Args: {
          p_code: string
          p_description?: string
          p_id: string
          p_name: string
          p_sort_order?: number
        }
        Returns: string
      }
      upsert_member_attribute_type: {
        Args: {
          p_active?: boolean
          p_code: string
          p_description: string
          p_in_application?: boolean
          p_multiple?: boolean
          p_name: string
          p_self_editable?: boolean
          p_sort_order?: number
          p_value_kind?: Database["public"]["Enums"]["attribute_kind"]
        }
        Returns: string
      }
      upsert_team: {
        Args: {
          p_active?: boolean
          p_id?: string
          p_name: string
          p_sort_order?: number
        }
        Returns: string
      }
      upsert_work_duty_rule: {
        Args: {
          p_fee_type_id: string
          p_required_hours: number
          p_year: number
        }
        Returns: undefined
      }
      void_drink_purchase: {
        Args: { p_purchase_id: string; p_reason?: string }
        Returns: undefined
      }
      waive_charge: {
        Args: { p_charge_id: string; p_reason: string }
        Returns: undefined
      }
      work_duty_entries_for: {
        Args: { p_member_id: string; p_year?: number }
        Returns: {
          bestaetigt: boolean
          created_at: string
          description: string
          erfasst_von: string
          hours: number
          id: string
          worked_on: string
        }[]
      }
      work_duty_overview: {
        Args: { p_year?: number }
        Returns: {
          abgerechnet: boolean
          arten: string
          betrag_cents: number
          completed_hours: number
          eintraege: number
          member_id: string
          member_name: string
          missing_hours: number
          required_hours: number
        }[]
      }
      work_duty_settle_year: {
        Args: { p_due_date?: string; p_year: number }
        Returns: {
          abgerechnet: number
          forderungen: number
          summe_cents: number
        }[]
      }
      work_duty_settlement_preview: {
        Args: { p_year: number }
        Returns: {
          amount_cents: number
          completed_hours: number
          has_mandate: boolean
          hourly_rate_cents: number
          member_id: string
          member_name: string
          missing_hours: number
          required_hours: number
          schon_abgerechnet: boolean
        }[]
      }
    }
    Enums: {
      app_role: "member" | "admin" | "board" | "groundskeeper"
      application_status: "new" | "accepted" | "declined" | "spam"
      attribute_kind: "list" | "text" | "date" | "boolean" | "number"
      billing_period_status: "open" | "closed" | "charged"
      booking_kind: "booking" | "blocking"
      booking_status: "active" | "cancelled"
      charge_kind:
        | "fee"
        | "drinks"
        | "deposit"
        | "work_duty"
        | "misc"
        | "guest"
        | "event"
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
      event_kind: "arbeitsdienst" | "fest" | "termin"
      event_registration_status: "registered" | "waitlisted" | "cancelled"
      event_status: "draft" | "published" | "cancelled"
      gender: "female" | "male" | "diverse"
      mandate_sequence: "FRST" | "RCUR" | "OOFF" | "FNAL"
      mandate_status: "active" | "revoked" | "expired"
      member_status: "active" | "inactive" | "archived"
      membership_status: "active" | "requested" | "declined" | "ended"
      playing_right: "none" | "own_club" | "second_club"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["member", "admin", "board", "groundskeeper"],
      application_status: ["new", "accepted", "declined", "spam"],
      attribute_kind: ["list", "text", "date", "boolean", "number"],
      billing_period_status: ["open", "closed", "charged"],
      booking_kind: ["booking", "blocking"],
      booking_status: ["active", "cancelled"],
      charge_kind: [
        "fee",
        "drinks",
        "deposit",
        "work_duty",
        "misc",
        "guest",
        "event",
      ],
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
      event_kind: ["arbeitsdienst", "fest", "termin"],
      event_registration_status: ["registered", "waitlisted", "cancelled"],
      event_status: ["draft", "published", "cancelled"],
      gender: ["female", "male", "diverse"],
      mandate_sequence: ["FRST", "RCUR", "OOFF", "FNAL"],
      mandate_status: ["active", "revoked", "expired"],
      member_status: ["active", "inactive", "archived"],
      membership_status: ["active", "requested", "declined", "ended"],
      playing_right: ["none", "own_club", "second_club"],
      purchase_source: ["app", "kiosk", "bar_duty"],
      record_source: ["app", "ebusy_import"],
      salutation: ["female", "male", "none"],
    },
  },
} as const

