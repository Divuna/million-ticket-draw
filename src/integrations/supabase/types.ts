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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      _messages_policies_backup: {
        Row: {
          backed_at: string | null
          cmd: string | null
          db: unknown
          permissive: string | null
          policyname: unknown
          qual: string | null
          roles: unknown[] | null
          schemaname: unknown
          tablename: unknown
          with_check: string | null
        }
        Insert: {
          backed_at?: string | null
          cmd?: string | null
          db?: unknown
          permissive?: string | null
          policyname?: unknown
          qual?: string | null
          roles?: unknown[] | null
          schemaname?: unknown
          tablename?: unknown
          with_check?: string | null
        }
        Update: {
          backed_at?: string | null
          cmd?: string | null
          db?: unknown
          permissive?: string | null
          policyname?: unknown
          qual?: string | null
          roles?: unknown[] | null
          schemaname?: unknown
          tablename?: unknown
          with_check?: string | null
        }
        Relationships: []
      }
      admin_actions: {
        Row: {
          action_type: string
          admin_id: string
          id: string
          metadata: Json | null
          notes: string | null
          target_id: string | null
          target_table: string
          timestamp: string
        }
        Insert: {
          action_type: string
          admin_id: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          target_id?: string | null
          target_table: string
          timestamp?: string
        }
        Update: {
          action_type?: string
          admin_id?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          target_id?: string | null
          target_table?: string
          timestamp?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          created_at: string | null
          event: string
          event_type: string | null
          id: string
          metadata: Json | null
          reference_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event: string
          event_type?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event?: string
          event_type?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          active: boolean
          created_at: string
          end_date: string | null
          homepage_video_active: boolean | null
          homepage_youtube_url: string | null
          id: string
          image_url: string
          start_date: string | null
          target_page: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          homepage_video_active?: boolean | null
          homepage_youtube_url?: string | null
          id?: string
          image_url: string
          start_date?: string | null
          target_page?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          homepage_video_active?: boolean | null
          homepage_youtube_url?: string | null
          id?: string
          image_url?: string
          start_date?: string | null
          target_page?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      bonus_prizes: {
        Row: {
          admin_notes: string | null
          amount: number | null
          contest_id: string
          created_at: string
          description: string
          detailed_description: string | null
          guardian_required: boolean
          id: string
          image_url: string | null
          status: string
          ticket_position: number
          title: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount?: number | null
          contest_id: string
          created_at?: string
          description: string
          detailed_description?: string | null
          guardian_required?: boolean
          id?: string
          image_url?: string | null
          status?: string
          ticket_position: number
          title?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number | null
          contest_id?: string
          created_at?: string
          description?: string
          detailed_description?: string | null
          guardian_required?: boolean
          id?: string
          image_url?: string | null
          status?: string
          ticket_position?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_transfer_history: {
        Row: {
          amount: number
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      coming_soon_banners: {
        Row: {
          created_at: string
          id: string
          image_url: string
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          title?: string | null
        }
        Relationships: []
      }
      content_pages: {
        Row: {
          content: string
          created_at: string | null
          deleted_at: string | null
          id: string
          is_active: boolean | null
          order: number | null
          section: string
          slug: string
          title: string
          updated_at: string | null
          version: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          order?: number | null
          section: string
          slug: string
          title: string
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          order?: number | null
          section?: string
          slug?: string
          title?: string
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      contest_media: {
        Row: {
          contest_id: string
          created_at: string | null
          id: string
          sort_order: number | null
          type: string
          url: string
        }
        Insert: {
          contest_id: string
          created_at?: string | null
          id?: string
          sort_order?: number | null
          type: string
          url: string
        }
        Update: {
          contest_id?: string
          created_at?: string | null
          id?: string
          sort_order?: number | null
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_media_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_media_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_media_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_media_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_media_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_media_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_media_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
      }
      contests: {
        Row: {
          banner_image: string | null
          created_at: string
          description: string | null
          generated_poster_url: string | null
          id: string
          main_image: string | null
          main_prize: string
          main_prize_secondary_image: string | null
          name: string
          next_ticket_number: number
          status: string
          ticket_count: number
          ticket_price: number
          title: string
          total_miocoin_bonus: number | null
          updated_at: string
        }
        Insert: {
          banner_image?: string | null
          created_at?: string
          description?: string | null
          generated_poster_url?: string | null
          id?: string
          main_image?: string | null
          main_prize: string
          main_prize_secondary_image?: string | null
          name?: string
          next_ticket_number?: number
          status?: string
          ticket_count?: number
          ticket_price?: number
          title: string
          total_miocoin_bonus?: number | null
          updated_at?: string
        }
        Update: {
          banner_image?: string | null
          created_at?: string
          description?: string | null
          generated_poster_url?: string | null
          id?: string
          main_image?: string | null
          main_prize?: string
          main_prize_secondary_image?: string | null
          name?: string
          next_ticket_number?: number
          status?: string
          ticket_count?: number
          ticket_price?: number
          title?: string
          total_miocoin_bonus?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cron_audit_log: {
        Row: {
          executed_at: string
          id: string
          invoices_count: number | null
          job_name: string
          partners_count: number | null
          period_from: string | null
          period_to: string | null
        }
        Insert: {
          executed_at?: string
          id?: string
          invoices_count?: number | null
          job_name: string
          partners_count?: number | null
          period_from?: string | null
          period_to?: string | null
        }
        Update: {
          executed_at?: string
          id?: string
          invoices_count?: number | null
          job_name?: string
          partners_count?: number | null
          period_from?: string | null
          period_to?: string | null
        }
        Relationships: []
      }
      debug_event_log: {
        Row: {
          created_at: string | null
          event_name: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string | null
          event_name?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string | null
          event_name?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      email_queue: {
        Row: {
          attachment_url: string | null
          body: string
          created_at: string | null
          email: string
          id: string
          sent_at: string | null
          status: string | null
          subject: string
        }
        Insert: {
          attachment_url?: string | null
          body: string
          created_at?: string | null
          email: string
          id?: string
          sent_at?: string | null
          status?: string | null
          subject: string
        }
        Update: {
          attachment_url?: string | null
          body?: string
          created_at?: string | null
          email?: string
          id?: string
          sent_at?: string | null
          status?: string | null
          subject?: string
        }
        Relationships: []
      }
      event_forward_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_id: number | null
          event_name: string
          id: string
          payload: Json
          record_id: string | null
          request_body: Json | null
          response_body: Json | null
          response_data: Json | null
          response_status: number | null
          retry_count: number | null
          status: string
          table_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_id?: number | null
          event_name: string
          id?: string
          payload: Json
          record_id?: string | null
          request_body?: Json | null
          response_body?: Json | null
          response_data?: Json | null
          response_status?: number | null
          retry_count?: number | null
          status?: string
          table_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_id?: number | null
          event_name?: string
          id?: string
          payload?: Json
          record_id?: string | null
          request_body?: Json | null
          response_body?: Json | null
          response_data?: Json | null
          response_status?: number | null
          retry_count?: number | null
          status?: string
          table_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      event_logs: {
        Row: {
          contest_id: string | null
          event_name: string | null
          id: number
          metadata: Json | null
          project_id: string | null
          source_system: string
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          contest_id?: string | null
          event_name?: string | null
          id?: never
          metadata?: Json | null
          project_id?: string | null
          source_system?: string
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          contest_id?: string | null
          event_name?: string | null
          id?: never
          metadata?: Json | null
          project_id?: string | null
          source_system?: string
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      event_queue: {
        Row: {
          contest_id: string | null
          created_at: string | null
          dead_lettered_at: string | null
          error_category: string | null
          event_name: string
          first_attempt_at: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_http_status: number | null
          max_retry_count: number
          metadata: Json | null
          next_retry_at: string | null
          processed_at: string | null
          processing_time_ms: number | null
          request_id: number | null
          retry_count: number | null
          source_request_id: string | null
          source_system: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          contest_id?: string | null
          created_at?: string | null
          dead_lettered_at?: string | null
          error_category?: string | null
          event_name: string
          first_attempt_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_http_status?: number | null
          max_retry_count?: number
          metadata?: Json | null
          next_retry_at?: string | null
          processed_at?: string | null
          processing_time_ms?: number | null
          request_id?: number | null
          retry_count?: number | null
          source_request_id?: string | null
          source_system?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          contest_id?: string | null
          created_at?: string | null
          dead_lettered_at?: string | null
          error_category?: string | null
          event_name?: string
          first_attempt_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_http_status?: number | null
          max_retry_count?: number
          metadata?: Json | null
          next_retry_at?: string | null
          processed_at?: string | null
          processing_time_ms?: number | null
          request_id?: number | null
          retry_count?: number | null
          source_request_id?: string | null
          source_system?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      influencer_campaign_bonuses_czk: {
        Row: {
          amount_czk: number
          campaign_id: string
          created_at: string
          id: string
          influencer_partner_id: string
          user_id: string
        }
        Insert: {
          amount_czk: number
          campaign_id: string
          created_at?: string
          id?: string
          influencer_partner_id: string
          user_id: string
        }
        Update: {
          amount_czk?: number
          campaign_id?: string
          created_at?: string
          id?: string
          influencer_partner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "influencer_campaign_bonuses_czk_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "influencer_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "influencer_campaign_bonuses_czk_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      influencer_campaign_events: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          influencer_partner_id: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          influencer_partner_id: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          influencer_partner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "influencer_campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "influencer_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "influencer_campaign_events_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      influencer_campaign_partners: {
        Row: {
          campaign_id: string
          influencer_partner_id: string
        }
        Insert: {
          campaign_id: string
          influencer_partner_id: string
        }
        Update: {
          campaign_id?: string
          influencer_partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "influencer_campaign_partners_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "influencer_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "influencer_campaign_partners_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      influencer_campaigns: {
        Row: {
          active: boolean
          bonus_czk_per_new_user: number
          bonus_mc_for_user: number
          created_at: string
          ends_at: string
          id: string
          name: string
          starts_at: string
        }
        Insert: {
          active?: boolean
          bonus_czk_per_new_user?: number
          bonus_mc_for_user?: number
          created_at?: string
          ends_at: string
          id?: string
          name: string
          starts_at: string
        }
        Update: {
          active?: boolean
          bonus_czk_per_new_user?: number
          bonus_mc_for_user?: number
          created_at?: string
          ends_at?: string
          id?: string
          name?: string
          starts_at?: string
        }
        Relationships: []
      }
      influencer_commissions: {
        Row: {
          amount_czk: number
          created_at: string
          id: string
          influencer_partner_id: string
          period_month: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_czk?: number
          created_at?: string
          id?: string
          influencer_partner_id: string
          period_month: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_czk?: number
          created_at?: string
          id?: string
          influencer_partner_id?: string
          period_month?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "influencer_commissions_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      influencer_referrals: {
        Row: {
          created_at: string
          id: string
          influencer_partner_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          influencer_partner_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          influencer_partner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "influencer_referrals_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string
          event: string | null
          extension: string | null
          id: string
          payload: Json | null
          private: boolean | null
          read: boolean
          sender: string
          topic: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          event?: string | null
          extension?: string | null
          id?: string
          payload?: Json | null
          private?: boolean | null
          read?: boolean
          sender: string
          topic?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          event?: string | null
          extension?: string | null
          id?: string
          payload?: Json | null
          private?: boolean | null
          read?: boolean
          sender?: string
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          push_delivered: boolean | null
          push_response: Json | null
          sent_at: string | null
          status: string
          title: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          push_delivered?: boolean | null
          push_response?: Json | null
          sent_at?: string | null
          status?: string
          title?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          push_delivered?: boolean | null
          push_response?: Json | null
          sent_at?: string | null
          status?: string
          title?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_api_key_usage: {
        Row: {
          id: string
          key_id: string
          partner_id: string
          used_at: string
        }
        Insert: {
          id?: string
          key_id: string
          partner_id: string
          used_at?: string
        }
        Update: {
          id?: string
          key_id?: string
          partner_id?: string
          used_at?: string
        }
        Relationships: []
      }
      partner_api_keys: {
        Row: {
          api_key_hash: string | null
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          partner_id: string
          revoked_at: string | null
        }
        Insert: {
          api_key_hash?: string | null
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          partner_id: string
          revoked_at?: string | null
        }
        Update: {
          api_key_hash?: string | null
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          partner_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_api_keys_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_api_requests: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          partner_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          partner_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          partner_id?: string
        }
        Relationships: []
      }
      partner_coin_activations: {
        Row: {
          activated_at: string
          code: string
          coins: number
          created_at: string
          external_order_id: string | null
          id: string
          invoiced: boolean
          partner_id: string
          user_id: string
        }
        Insert: {
          activated_at?: string
          code: string
          coins: number
          created_at?: string
          external_order_id?: string | null
          id?: string
          invoiced?: boolean
          partner_id: string
          user_id: string
        }
        Update: {
          activated_at?: string
          code?: string
          coins?: number
          created_at?: string
          external_order_id?: string | null
          id?: string
          invoiced?: boolean
          partner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_coin_activations_code_fkey"
            columns: ["code"]
            isOneToOne: true
            referencedRelation: "partner_reward_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "partner_coin_activations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invoice_exports: {
        Row: {
          created_at: string | null
          file_url: string | null
          format: string
          id: string
          invoice_id: string
        }
        Insert: {
          created_at?: string | null
          file_url?: string | null
          format: string
          id?: string
          invoice_id: string
        }
        Update: {
          created_at?: string | null
          file_url?: string | null
          format?: string
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_invoice_exports_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "partner_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invoice_lines: {
        Row: {
          activated_at: string
          activation_id: string
          coins: number
          external_order_id: string | null
          id: number
          invoice_id: string
        }
        Insert: {
          activated_at: string
          activation_id: string
          coins: number
          external_order_id?: string | null
          id?: number
          invoice_id: string
        }
        Update: {
          activated_at?: string
          activation_id?: string
          coins?: number
          external_order_id?: string | null
          id?: number
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_invoice_lines_activation_id_fkey"
            columns: ["activation_id"]
            isOneToOne: false
            referencedRelation: "partner_coin_activations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "partner_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invoices: {
        Row: {
          amount_ex_vat: number
          amount_gross: number | null
          amount_inc_vat: number
          amount_net: number | null
          coins_activated: number
          coins_total: number | null
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string | null
          issue_date: string | null
          issued_at: string | null
          paid_at: string | null
          partner_id: string
          period_end: string
          period_from: string | null
          period_start: string
          period_to: string | null
          status: Database["public"]["Enums"]["partner_invoice_status"]
          taxable_date: string | null
          variable_symbol: string | null
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          amount_ex_vat?: number
          amount_gross?: number | null
          amount_inc_vat?: number
          amount_net?: number | null
          coins_activated?: number
          coins_total?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          issued_at?: string | null
          paid_at?: string | null
          partner_id: string
          period_end: string
          period_from?: string | null
          period_start: string
          period_to?: string | null
          status?: Database["public"]["Enums"]["partner_invoice_status"]
          taxable_date?: string | null
          variable_symbol?: string | null
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          amount_ex_vat?: number
          amount_gross?: number | null
          amount_inc_vat?: number
          amount_net?: number | null
          coins_activated?: number
          coins_total?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          issued_at?: string | null
          paid_at?: string | null
          partner_id?: string
          period_end?: string
          period_from?: string | null
          period_start?: string
          period_to?: string | null
          status?: Database["public"]["Enums"]["partner_invoice_status"]
          taxable_date?: string | null
          variable_symbol?: string | null
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_invoices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_reward_codes: {
        Row: {
          activated_at: string | null
          activated_by_user_id: string | null
          cancelled_at: string | null
          code: string
          coins: number
          customer_email: string | null
          expired_at: string | null
          external_order_id: string | null
          issued_at: string
          issued_to_email: string | null
          metadata: Json
          partner_id: string
          status: Database["public"]["Enums"]["partner_code_status"]
        }
        Insert: {
          activated_at?: string | null
          activated_by_user_id?: string | null
          cancelled_at?: string | null
          code: string
          coins: number
          customer_email?: string | null
          expired_at?: string | null
          external_order_id?: string | null
          issued_at?: string
          issued_to_email?: string | null
          metadata?: Json
          partner_id: string
          status?: Database["public"]["Enums"]["partner_code_status"]
        }
        Update: {
          activated_at?: string | null
          activated_by_user_id?: string | null
          cancelled_at?: string | null
          code?: string
          coins?: number
          customer_email?: string | null
          expired_at?: string | null
          external_order_id?: string | null
          issued_at?: string
          issued_to_email?: string | null
          metadata?: Json
          partner_id?: string
          status?: Database["public"]["Enums"]["partner_code_status"]
        }
        Relationships: [
          {
            foreignKeyName: "partner_reward_codes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          approved_at: string | null
          auth_user_id: string | null
          billing_city: string | null
          billing_country: string | null
          billing_street: string | null
          billing_zip: string | null
          company_name: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          dic: string | null
          ico: string | null
          id: string
          logo_status: string
          logo_url: string
          mc_per_99_czk: number
          name: string
          notes: string | null
          payout_account: string | null
          payout_bank: string | null
          payout_currency: string | null
          payout_ready: boolean
          payout_updated_at: string | null
          price_per_coin: number
          rejected_at: string | null
          reward_base_czk: number
          reward_mc: number
          status: Database["public"]["Enums"]["partner_status"]
          suspended_at: string | null
          terms_accepted_at: string | null
          updated_at: string
          vat_rate: number
          website_url: string
        }
        Insert: {
          approved_at?: string | null
          auth_user_id?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          dic?: string | null
          ico?: string | null
          id?: string
          logo_status?: string
          logo_url: string
          mc_per_99_czk?: number
          name: string
          notes?: string | null
          payout_account?: string | null
          payout_bank?: string | null
          payout_currency?: string | null
          payout_ready?: boolean
          payout_updated_at?: string | null
          price_per_coin?: number
          rejected_at?: string | null
          reward_base_czk?: number
          reward_mc?: number
          status?: Database["public"]["Enums"]["partner_status"]
          suspended_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          vat_rate?: number
          website_url: string
        }
        Update: {
          approved_at?: string | null
          auth_user_id?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          dic?: string | null
          ico?: string | null
          id?: string
          logo_status?: string
          logo_url?: string
          mc_per_99_czk?: number
          name?: string
          notes?: string | null
          payout_account?: string | null
          payout_bank?: string | null
          payout_currency?: string | null
          payout_ready?: boolean
          payout_updated_at?: string | null
          price_per_coin?: number
          rejected_at?: string | null
          reward_base_czk?: number
          reward_mc?: number
          status?: Database["public"]["Enums"]["partner_status"]
          suspended_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          vat_rate?: number
          website_url?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          status: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          status?: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          status?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prizes: {
        Row: {
          claimed: boolean | null
          contest_id: string
          created_at: string | null
          description: string | null
          id: string
          prize_type: string
          ticket_number: number
          winner_user_id: string | null
        }
        Insert: {
          claimed?: boolean | null
          contest_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          prize_type: string
          ticket_number: number
          winner_user_id?: string | null
        }
        Update: {
          claimed?: boolean | null
          contest_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          prize_type?: string
          ticket_number?: number
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          country: string | null
          date_of_birth: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          street: string | null
          updated_at: string | null
          user_id: string | null
          zip: string | null
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          street?: string | null
          updated_at?: string | null
          user_id?: string | null
          zip?: string | null
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          street?: string | null
          updated_at?: string | null
          user_id?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      push_log: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          player_id: string | null
          response: Json | null
          sent_at: string | null
          status: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          player_id?: string | null
          response?: Json | null
          sent_at?: string | null
          status?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          player_id?: string | null
          response?: Json | null
          sent_at?: string | null
          status?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_retry: {
        Row: {
          attempts: number
          created_at: string
          id: string
          next_try: string
          raw_id: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id: string
          next_try?: string
          raw_id: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          next_try?: string
          raw_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      referral_attempts: {
        Row: {
          attempted_code: string | null
          created_at: string
          device_id: string | null
          fingerprint_hash: string | null
          id: string
          ip_hash: string | null
          reason: string | null
          referred_user_id: string
          result: string
          source: string | null
        }
        Insert: {
          attempted_code?: string | null
          created_at?: string
          device_id?: string | null
          fingerprint_hash?: string | null
          id?: string
          ip_hash?: string | null
          reason?: string | null
          referred_user_id: string
          result: string
          source?: string | null
        }
        Update: {
          attempted_code?: string | null
          created_at?: string
          device_id?: string | null
          fingerprint_hash?: string | null
          id?: string
          ip_hash?: string | null
          reason?: string | null
          referred_user_id?: string
          result?: string
          source?: string | null
        }
        Relationships: []
      }
      referral_blocked_users: {
        Row: {
          blocked: boolean
          blocked_at: string
          reason: string | null
          user_id: string
        }
        Insert: {
          blocked?: boolean
          blocked_at?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          blocked?: boolean
          blocked_at?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          commission_rate: number
          created_at: string
          id: string
          paid_amount_mc: number
          payment_id: string | null
          payment_stripe_session_id: string | null
          referred_user_id: string
          referrer_user_id: string
          reverse_reason: string | null
          reversed_at: string | null
          reward_mc: number
          status: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          id?: string
          paid_amount_mc: number
          payment_id?: string | null
          payment_stripe_session_id?: string | null
          referred_user_id: string
          referrer_user_id: string
          reverse_reason?: string | null
          reversed_at?: string | null
          reward_mc: number
          status?: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          id?: string
          paid_amount_mc?: number
          payment_id?: string | null
          payment_stripe_session_id?: string | null
          referred_user_id?: string
          referrer_user_id?: string
          reverse_reason?: string | null
          reversed_at?: string | null
          reward_mc?: number
          status?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          blocked_at: string | null
          blocked_reason: string | null
          code_used: string
          created_at: string
          permanently_inactive_at: string | null
          referred_user_id: string
          referrer_user_id: string
          source: string | null
          status: string
        }
        Insert: {
          blocked_at?: string | null
          blocked_reason?: string | null
          code_used: string
          created_at?: string
          permanently_inactive_at?: string | null
          referred_user_id: string
          referrer_user_id: string
          source?: string | null
          status?: string
        }
        Update: {
          blocked_at?: string | null
          blocked_reason?: string | null
          code_used?: string
          created_at?: string
          permanently_inactive_at?: string | null
          referred_user_id?: string
          referrer_user_id?: string
          source?: string | null
          status?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          contest_id: string
          created_at: string
          id: string
          number: number
          user_id: string
        }
        Insert: {
          contest_id: string
          created_at?: string
          id?: string
          number: number
          user_id: string
        }
        Update: {
          contest_id?: string
          created_at?: string
          id?: string
          number?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_contest_favorites: {
        Row: {
          contest_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          contest_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          contest_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_contest_favorites_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "user_contest_favorites_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "user_contest_favorites_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "user_contest_favorites_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "user_contest_favorites_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "user_contest_favorites_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "user_contest_favorites_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          created_at: string | null
          device_type: string
          email: string | null
          id: string
          onesignal_player_id: string | null
          player_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_type?: string
          email?: string | null
          id?: string
          onesignal_player_id?: string | null
          player_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_type?: string
          email?: string | null
          id?: string
          onesignal_player_id?: string | null
          player_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_legal_acceptances: {
        Row: {
          accepted_at: string
          document_slug: string
          document_version: string
          id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_slug: string
          document_version: string
          id?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_slug?: string
          document_version?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_play_activity: {
        Row: {
          last_played_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          last_played_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          last_played_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_security_signals: {
        Row: {
          created_at: string
          device_id: string | null
          fingerprint_hash: string | null
          ip_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          fingerprint_hash?: string | null
          ip_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          fingerprint_hash?: string | null
          ip_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_vouchers: {
        Row: {
          created_at: string
          id: string
          redeemed: boolean
          updated_at: string
          user_id: string
          voucher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          redeemed?: boolean
          updated_at?: string
          user_id: string
          voucher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          redeemed?: boolean
          updated_at?: string
          user_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_vouchers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_vouchers_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          address: string | null
          apple_id: string | null
          created_at: string
          email: string
          first_name: string | null
          google_id: string | null
          id: string
          last_name: string | null
          name: string | null
          nickname: string | null
          onesignal_player_id: string | null
          phone: string | null
          role: string
          show_user_menu: boolean | null
        }
        Insert: {
          address?: string | null
          apple_id?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          google_id?: string | null
          id: string
          last_name?: string | null
          name?: string | null
          nickname?: string | null
          onesignal_player_id?: string | null
          phone?: string | null
          role?: string
          show_user_menu?: boolean | null
        }
        Update: {
          address?: string | null
          apple_id?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          google_id?: string | null
          id?: string
          last_name?: string | null
          name?: string | null
          nickname?: string | null
          onesignal_player_id?: string | null
          phone?: string | null
          role?: string
          show_user_menu?: boolean | null
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          banner_url: string | null
          created_at: string
          end_date: string | null
          id: string
          image_url: string
          is_public: boolean
          max_quantity: number | null
          name: string
          redeem_price_vouchers: number
          redeemed_count: number
          start_date: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          image_url: string
          is_public?: boolean
          max_quantity?: number | null
          name?: string
          redeem_price_vouchers?: number
          redeemed_count?: number
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          image_url?: string
          is_public?: boolean
          max_quantity?: number | null
          name?: string
          redeem_price_vouchers?: number
          redeemed_count?: number
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          metadata: Json | null
          reference_id: string | null
          source: string
          type: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          source: string
          type: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          source?: string
          type?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance_coins: number
          balance_vouchers: number
          bonus_balance_coins: number
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          balance_coins?: number
          balance_vouchers?: number
          bonus_balance_coins?: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          balance_coins?: number
          balance_vouchers?: number
          bonus_balance_coins?: number
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      winner_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: string
          old_status: string | null
          winner_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: string
          old_status?: string | null
          winner_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: string
          old_status?: string | null
          winner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "winner_status_history_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "winner_status_history_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "winners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "winner_status_history_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "winners_with_contest"
            referencedColumns: ["id"]
          },
        ]
      }
      winners: {
        Row: {
          contest_id: string
          created_at: string
          delivered: boolean
          id: string
          notes: string | null
          prize_id: string | null
          status: string | null
          ticket_id: string | null
          type: string
          user_id: string
          user_seen: boolean
        }
        Insert: {
          contest_id: string
          created_at?: string
          delivered?: boolean
          id?: string
          notes?: string | null
          prize_id?: string | null
          status?: string | null
          ticket_id?: string | null
          type: string
          user_id: string
          user_seen?: boolean
        }
        Update: {
          contest_id?: string
          created_at?: string
          delivered?: boolean
          id?: string
          notes?: string | null
          prize_id?: string | null
          status?: string | null
          ticket_id?: string | null
          type?: string
          user_id?: string
          user_seen?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_winners_ticket_id"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "winners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      winners_orphan_backup: {
        Row: {
          contest_id: string | null
          created_at: string | null
          delivered: boolean | null
          id: string | null
          notes: string | null
          prize_id: string | null
          status: string | null
          ticket_id: string | null
          type: string | null
          user_id: string | null
          user_seen: boolean | null
        }
        Insert: {
          contest_id?: string | null
          created_at?: string | null
          delivered?: boolean | null
          id?: string | null
          notes?: string | null
          prize_id?: string | null
          status?: string | null
          ticket_id?: string | null
          type?: string | null
          user_id?: string | null
          user_seen?: boolean | null
        }
        Update: {
          contest_id?: string | null
          created_at?: string | null
          delivered?: boolean | null
          id?: string | null
          notes?: string | null
          prize_id?: string | null
          status?: string | null
          ticket_id?: string | null
          type?: string | null
          user_id?: string | null
          user_seen?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      admin_bonus_delivery_status: {
        Row: {
          bonus_positions: string | null
          contest_name: string | null
          delivered_bonus_count: number | null
          total_bonus_count: number | null
          undelivered_bonus_count: number | null
          won_bonus_count: number | null
        }
        Relationships: []
      }
      admin_bonus_overview: {
        Row: {
          assigned_bonus_count: number | null
          bonus_positions: string | null
          contest_name: string | null
          total_bonus_count: number | null
          unassigned_bonus_count: number | null
        }
        Relationships: []
      }
      admin_bonus_overview_limited_string: {
        Row: {
          assigned_bonus_count: number | null
          contest_name: string | null
          limited_bonus_positions: string | null
          total_bonus_count: number | null
          unassigned_bonus_count: number | null
        }
        Relationships: []
      }
      admin_contest_status: {
        Row: {
          contest_id: string | null
          contest_name: string | null
          ticket_ids: string | null
          total_tickets: number | null
        }
        Relationships: []
      }
      admin_winner_delivery_detail: {
        Row: {
          contest_id: string | null
          contest_name: string | null
          created_at: string | null
          email: string | null
          id: string | null
          status: string | null
          type: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "winners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_winner_delivery_stats: {
        Row: {
          contest_id: string | null
          contest_name: string | null
          delivered: number | null
          pending: number | null
          total_winners: number | null
        }
        Relationships: []
      }
      contest_activity_last_24h: {
        Row: {
          contest_id: string | null
          tickets_last_24h: number | null
          users_last_24h: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_analytics: {
        Row: {
          coins_spent: number | null
          contest_id: string | null
          contest_progress_percent: number | null
          contest_status: string | null
          contest_title: string | null
          first_ticket_time: string | null
          last_ticket_time: string | null
          max_tickets: number | null
          ticket_price: number | null
          tickets_remaining: number | null
          tickets_sold: number | null
        }
        Relationships: []
      }
      contest_integrity_check: {
        Row: {
          bonus_prizes_defined: number | null
          bonus_prizes_triggered: number | null
          coins_spent_ledger: number | null
          contest_id: string | null
          contest_title: string | null
          expected_ticket_sales: number | null
          tickets_sold: number | null
          wallet_vs_ticket_check: string | null
          winners_count: number | null
        }
        Insert: {
          bonus_prizes_defined?: never
          bonus_prizes_triggered?: never
          coins_spent_ledger?: never
          contest_id?: string | null
          contest_title?: string | null
          expected_ticket_sales?: never
          tickets_sold?: never
          wallet_vs_ticket_check?: never
          winners_count?: never
        }
        Update: {
          bonus_prizes_defined?: never
          bonus_prizes_triggered?: never
          coins_spent_ledger?: never
          contest_id?: string | null
          contest_title?: string | null
          expected_ticket_sales?: never
          tickets_sold?: never
          wallet_vs_ticket_check?: never
          winners_count?: never
        }
        Relationships: []
      }
      contest_miocoin_totals: {
        Row: {
          contest_id: string | null
          total_miocoin: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "bonus_prizes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_progress: {
        Row: {
          contest_id: string | null
          sold_percent: number | null
          tickets_remaining: number | null
          tickets_sold: number | null
          tickets_total: number | null
        }
        Relationships: []
      }
      contest_revenue: {
        Row: {
          coins_spent: number | null
          contest_id: string | null
          estimated_revenue: number | null
          tickets_sold: number | null
        }
        Relationships: []
      }
      contest_ticket_map: {
        Row: {
          contest_id: string | null
          created_at: string | null
          ticket_number: number | null
          ticket_status: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "tickets_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_platform_metrics: {
        Row: {
          coins_redeemed: number | null
          date: string | null
          new_users: number | null
          tickets_played: number | null
          vouchers_purchased: number | null
        }
        Relationships: []
      }
      event_queue_failed_summary: {
        Row: {
          error_category: string | null
          event_ids: string | null
          total: number | null
        }
        Relationships: []
      }
      event_queue_monitoring: {
        Row: {
          avg_processing_time_ms: number | null
          completed_events: number | null
          dead_events: number | null
          failed_events: number | null
          max_processing_time_ms: number | null
          minute_bucket: string | null
          processing_events: number | null
          total_events: number | null
        }
        Relationships: []
      }
      partner_api_activity: {
        Row: {
          created_at: string | null
          endpoint: string | null
          partner_id: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint?: string | null
          partner_id?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string | null
          partner_id?: string | null
        }
        Relationships: []
      }
      system_health_monitor: {
        Row: {
          active_contests: number | null
          audit_events_last_hour: number | null
          last_payment_time: string | null
          last_ticket_time: string | null
          payments_last_hour: number | null
          tickets_last_hour: number | null
          total_users: number | null
          wallet_tx_last_hour: number | null
        }
        Relationships: []
      }
      v_first_topup_valid: {
        Row: {
          first_topup_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_influencer_referrals_paid: {
        Row: {
          created_at: string | null
          id: string | null
          influencer_partner_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "influencer_referrals_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      v_influencer_referrals_valid: {
        Row: {
          created_at: string | null
          id: string | null
          influencer_partner_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "influencer_referrals_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_wallets: {
        Row: {
          balance_coins: number | null
          bonus_balance_coins: number | null
          created_at: string | null
          user_id: string | null
        }
        Insert: {
          balance_coins?: number | null
          bonus_balance_coins?: number | null
          created_at?: string | null
          user_id?: string | null
        }
        Update: {
          balance_coins?: number | null
          bonus_balance_coins?: number | null
          created_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      valid_partner_api_keys: {
        Row: {
          key_id: string | null
          partner_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_api_keys_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      winners_with_contest: {
        Row: {
          contest_id: string | null
          contest_name: string | null
          created_at: string | null
          delivered: boolean | null
          id: string | null
          notes: string | null
          prize_id: string | null
          status: string | null
          type: string | null
          user_id: string | null
          user_seen: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "winners_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "winners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _invoke_forward_messages_to_sofinity: { Args: never; Returns: undefined }
      _test_buy_ticket: {
        Args: { p_contest_id: string; p_user_id: string }
        Returns: Json
      }
      activate_partner_coins_from_order: {
        Args: {
          p_external_order_id: string
          p_order_amount_czk: number
          p_partner_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      activate_partner_reward: {
        Args: { p_code: string; p_user_id: string }
        Returns: undefined
      }
      activate_partner_reward_code: {
        Args: { p_reward_code: string }
        Returns: undefined
      }
      activate_partner_reward_code_for_user: {
        Args: { p_reward_code: string; p_user_id: string }
        Returns: undefined
      }
      activate_partner_reward_sql: {
        Args: { p_api_key: string; p_partner_id: string; p_reward_code: string }
        Returns: Json
      }
      admin_block_referrer: {
        Args: { p_blocked: boolean; p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      admin_manage_bonus_prize: {
        Args: {
          p_amount?: number
          p_contest_id?: string
          p_description?: string
          p_operation?: string
          p_prize_id?: string
          p_status?: string
          p_ticket_position?: number
        }
        Returns: Json
      }
      admin_manage_contest: {
        Args: {
          p_contest_id?: string
          p_description?: string
          p_main_image?: string
          p_main_prize?: string
          p_operation?: string
          p_status?: string
          p_ticket_count?: number
          p_ticket_price?: number
          p_title?: string
        }
        Returns: Json
      }
      admin_manage_notification: {
        Args: {
          p_message?: string
          p_notification_id?: string
          p_operation?: string
          p_title?: string
          p_type?: string
          p_user_email?: string
        }
        Returns: Json
      }
      admin_unread_support_user_messages_count: { Args: never; Returns: number }
      admin_manage_payment: {
        Args: {
          p_new_status: string
          p_operation: string
          p_payment_id: string
        }
        Returns: Json
      }
      admin_set_partner_status: {
        Args: {
          p_notes?: string
          p_partner_id: string
          p_status: Database["public"]["Enums"]["partner_status"]
        }
        Returns: undefined
      }
      admin_update_referral_reward: {
        Args: { p_new_status: string; p_reward_id: string }
        Returns: undefined
      }
      api_activate_partner_coins: {
        Args: {
          p_api_key: string
          p_external_order_id: string
          p_order_amount_czk: number
          p_user_id: string
        }
        Returns: undefined
      }
      build_isdoc_payload: { Args: { p_invoice_id: string }; Returns: Json }
      buy_ticket_atomic: {
        Args: { p_contest_id: string; p_user_id: string }
        Returns: Json
      }
      buy_voucher_atomic: {
        Args: { p_user_id: string; p_voucher_id: string }
        Returns: Json
      }
      calculate_influencer_commissions_current_month: {
        Args: never
        Returns: undefined
      }
      check_guardian_notifications_batch: { Args: never; Returns: Json }
      check_partner_api_rate_limit: {
        Args: { p_limit: number; p_partner_id: string; p_window: string }
        Returns: boolean
      }
      claim_miocoin_bonus:
        | {
            Args: { p_bonus_id: string; p_user_id: string }
            Returns: undefined
          }
        | { Args: { p_bonus_prize_id: string }; Returns: undefined }
      close_contest: { Args: { p_contest_id: string }; Returns: undefined }
      create_guardian_message_for_user:
        | {
            Args: {
              p_contest_id: string
              p_prize_title: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_contest_id: string
              p_prize_title: string
              p_user_id: string
            }
            Returns: undefined
          }
      create_guardian_notification_if_needed: {
        Args: { p_contest_id: string; p_prize_id: string; p_user_id: string }
        Returns: Json
      }
      create_partner_api_key: {
        Args: { p_partner_id: string }
        Returns: string
      }
      create_partner_invoices_for_last_week: { Args: never; Returns: undefined }
      create_partner_invoices_for_period: {
        Args: { p_period_from: string; p_period_to: string }
        Returns: undefined
      }
      create_referral_reward_from_wallet_credit: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      create_test_result: {
        Args: {
          p_details?: Json
          p_execution_time_ms?: number
          p_message?: string
          p_status: string
          p_test_name: string
        }
        Returns: Json
      }
      deduct_wallet_for_refund: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
      }
      enqueue_partner_invoice_email: {
        Args: {
          p_partner_id: string
          p_period_from: string
          p_period_to: string
        }
        Returns: undefined
      }
      ensure_referral_code: { Args: { p_user_id: string }; Returns: string }
      fn_close_contest: { Args: { p_contest: string }; Returns: undefined }
      forward_event_to_sofinity: {
        Args: { v_payload: Json }
        Returns: undefined
      }
      generate_invoice_number: {
        Args: { p_issue_date: string }
        Returns: {
          invoice_number: string
          variable_symbol: string
        }[]
      }
      generate_miocoin_bonus: {
        Args: { p_contest_id: string; p_count: number }
        Returns: undefined
      }
      generate_partner_api_key: {
        Args: { p_partner_id: string }
        Returns: {
          api_key: string
          created_at: string
          key_id: string
          key_prefix: string
        }[]
      }
      generate_partner_invoice: {
        Args: {
          p_partner_id: string
          p_period_from: string
          p_period_to: string
        }
        Returns: string
      }
      generate_partner_reward_code: {
        Args: {
          p_coins: number
          p_customer_email?: string
          p_external_order_id?: string
          p_metadata?: Json
          p_partner_id: string
        }
        Returns: string
      }
      generate_referral_code: { Args: never; Returns: string }
      generate_winner: { Args: { p_contest_id: string }; Returns: undefined }
      get_active_banners_summary: { Args: never; Returns: string }
      get_admin_actions_summary: {
        Args: {
          p_action_type?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_target_table?: string
        }
        Returns: {
          recent_actions: string
          summary_line: string
          total_actions: number
          unique_admins: number
        }[]
      }
      get_admin_summary_dashboard: {
        Args: never
        Returns: {
          bonus_prizes_summary: string
          contests_summary: string
          notifications_summary: string
          payments_summary: string
          recent_actions: string
          vouchers_summary: string
        }[]
      }
      get_available_vouchers: {
        Args: { p_user_id?: string }
        Returns: {
          banner_url: string
          code: string
          end_date: string
          id: string
          image_url: string
          is_active: boolean
          max_quantity: number
          redeemed_count: number
          remaining_vouchers: number
          start_date: string
          user_already_redeemed: boolean
          value: number
        }[]
      }
      get_contest_bonus_stats: {
        Args: { contest_id: string }
        Returns: {
          pending_bonuses: number
          physical_items: number
          total_bonus_units: number
          total_miocoins: number
          won_bonuses: number
        }[]
      }
      get_contest_bonus_stats_enhanced: {
        Args: { contest_id: string }
        Returns: {
          first_20_positions: string
          max_position: number
          min_position: number
          pending_count: number
          physical_items: number
          total_miocoins: number
          total_positions: number
          won_count: number
        }[]
      }
      get_contest_management_data: {
        Args: { p_contest_id_filter?: string }
        Returns: {
          contest_id: string
          created_at: string
          description: string
          main_image: string
          main_prize: string
          progress_percentage: number
          status: string
          ticket_count: number
          ticket_price: number
          tickets_sold: number
          title: string
          total_miocoin_bonus: number
          updated_at: string
        }[]
      }
      get_contest_miocoin_bonus: {
        Args: { p_contest_id: string }
        Returns: number
      }
      get_contest_miocoin_sum: {
        Args: { p_contest_id: string }
        Returns: number
      }
      get_contests_json: { Args: never; Returns: Json }
      get_current_user_role: { Args: never; Returns: string }
      get_latest_winners: {
        Args: { winners_limit?: number }
        Returns: {
          contest_id: string
          contest_title: string
          created_at: string
          id: string
          prize_id: string
          prize_image_url: string
          prize_name: string
          type: string
          user_avatar_url: string
          user_id: string
          user_name: string
          user_nickname: string
        }[]
      }
      get_pending_event_forward_log: {
        Args: { _limit: number }
        Returns: {
          created_at: string
          event_name: string
          id: string
          payload: Json
          request_body: Json
          status: string
          table_name: string
        }[]
      }
      get_prizes_delivery_summary: {
        Args: { p_contest_id?: string }
        Returns: {
          contest_title: string
          delivered_count: number
          pending_count: number
          prize_positions: string
          summary_text: string
          total_prizes: number
          won_count: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      handle_influencer_signup: {
        Args: { p_influencer_partner_id: string; p_user_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_ai_message: {
        Args: { p_content: string; p_message_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_self_referral: {
        Args: { p_referred_user_id: string; p_referrer_user_id: string }
        Returns: boolean
      }
      log_admin_action: {
        Args: {
          action_name: string
          entity_id?: string
          entity_type: string
          new_data?: Json
          old_data?: Json
        }
        Returns: undefined
      }
      log_partner_api_key_usage:
        | {
            Args: {
              p_endpoint: string
              p_ip: unknown
              p_partner_id: string
              p_user_agent: string
            }
            Returns: undefined
          }
        | {
            Args: { p_key_id: string; p_partner_id: string }
            Returns: undefined
          }
      log_partner_api_request: {
        Args: { p_endpoint: string; p_partner_id: string }
        Returns: undefined
      }
      mark_user_played: {
        Args: { p_played_at?: string; p_user_id: string }
        Returns: undefined
      }
      mark_wins_as_seen: { Args: never; Returns: undefined }
      notify_sofinity_event: {
        Args: {
          p_contest_id: string
          p_event_name: string
          p_metadata: Json
          p_user_id: string
        }
        Returns: string
      }
      partner_api_example_endpoint: {
        Args: { p_api_key: string; p_payload: Json }
        Returns: {
          ok: boolean
          partner_id: string
        }[]
      }
      partner_api_guard: {
        Args: {
          p_api_key: string
          p_endpoint: string
          p_limit?: number
          p_window?: string
        }
        Returns: string
      }
      partner_api_ping: {
        Args: { p_api_key: string }
        Returns: {
          ok: boolean
          partner_id: string
        }[]
      }
      pause_contest: { Args: { contest_id: string }; Returns: undefined }
      process_event_queue_miocoin: { Args: never; Returns: undefined }
      process_push_retries: { Args: never; Returns: undefined }
      process_referral_inactivity: { Args: never; Returns: number }
      proxy_post_to_onesignal: {
        Args: {
          event_name: string
          external_id: string
          message: string
          player_id: string
          title: string
        }
        Returns: {
          response_body: Json
          status_code: number
        }[]
      }
      recalculate_bonus_wallet: { Args: never; Returns: undefined }
      redeem_miocoin: {
        Args: {
          p_contest_id: string
          p_ticket_position: number
          p_user_id: string
        }
        Returns: {
          message: string
          new_status: string
          success: boolean
        }[]
      }
      redeem_voucher: { Args: { p_voucher_id: string }; Returns: Json }
      resolve_partner_by_api_key: { Args: { p_key: string }; Returns: string }
      resume_contest: { Args: { contest_id: string }; Returns: undefined }
      rotate_partner_api_key: {
        Args: { p_partner_id: string }
        Returns: {
          api_key: string
          key_prefix: string
        }[]
      }
      run_complete_admin_test_suite: { Args: never; Returns: Json }
      run_deep_sofinity_test_suite: {
        Args: { p_performance_events?: number }
        Returns: Json
      }
      run_monthly_partner_invoicing: {
        Args: { p_period_from: string; p_period_to: string }
        Returns: undefined
      }
      run_pipeline_alerts: { Args: never; Returns: undefined }
      safe_send_message: {
        Args: { p_content: string; p_sender: string; p_user_id: string }
        Returns: undefined
      }
      send_push_via_onesignal: {
        Args: {
          p_message: string
          p_player_id: string
          p_push_log_id: string
          p_title: string
        }
        Returns: undefined
      }
      set_my_referrer_by_code: {
        Args: {
          p_code: string
          p_device_id?: string
          p_fingerprint_hash?: string
          p_ip_hash?: string
          p_source?: string
        }
        Returns: string
      }
      set_user_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      setup_crud_test_data: { Args: { p_user_email?: string }; Returns: Json }
      test_admin_crud_operations: { Args: never; Returns: Json }
      test_admin_security_rls: { Args: never; Returns: Json }
      test_audit_logging: { Args: never; Returns: Json }
      test_deep_data_integrity: { Args: never; Returns: Json }
      test_partner_api_key: {
        Args: { p_api_key: string }
        Returns: {
          partner_id: string
          partner_name: string
        }[]
      }
      test_rl: { Args: never; Returns: number }
      test_sofinity_edge_cases: { Args: never; Returns: Json }
      test_sofinity_integration: { Args: never; Returns: Json }
      test_sofinity_performance: {
        Args: { p_event_count?: number }
        Returns: Json
      }
      test_sofinity_player_sync: { Args: never; Returns: Json }
      transfer_all_bonus_to_main_wallet: { Args: never; Returns: number }
      transfer_bonus_to_main:
        | { Args: never; Returns: undefined }
        | { Args: { p_user_id: string }; Returns: undefined }
      trigger_contest_draw: { Args: { contest_id: string }; Returns: undefined }
      try_credit_wallet_mc:
        | {
            Args: { p_amount: number; p_reason?: string; p_user_id: string }
            Returns: undefined
          }
        | { Args: { p_amount_mc: number; p_user_id: string }; Returns: boolean }
      unlock_ticket: {
        Args: { contest_id: string; user_id: string }
        Returns: Json
      }
      update_bonus_prize_delivery_status: {
        Args: { p_admin_notes?: string; p_prize_id: string; p_status: string }
        Returns: Json
      }
      update_onesignal_id: {
        Args: { p_player_id: string; p_user_id: string }
        Returns: Json
      }
      upsert_user_security_signals: {
        Args: {
          p_device_id: string
          p_fingerprint_hash: string
          p_ip_hash: string
          p_user_id: string
        }
        Returns: undefined
      }
      validate_crud_test_data: {
        Args: { p_user_email?: string }
        Returns: Json
      }
      validate_partner_api_key: { Args: { p_api_key: string }; Returns: string }
      validate_sofinity_events: {
        Args: { p_hours_back?: number }
        Returns: {
          count: number
          event_name: string
          latest_timestamp: string
          sample_metadata: Json
        }[]
      }
      verify_partner_api_key: {
        Args: { p_api_key: string }
        Returns: {
          key_id: string
          partner_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "superadmin" | "user"
      partner_code_status: "issued" | "activated" | "cancelled" | "expired"
      partner_invoice_status: "draft" | "issued" | "paid" | "void"
      partner_status: "pending" | "approved" | "suspended" | "rejected"
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
      app_role: ["admin", "superadmin", "user"],
      partner_code_status: ["issued", "activated", "cancelled", "expired"],
      partner_invoice_status: ["draft", "issued", "paid", "void"],
      partner_status: ["pending", "approved", "suspended", "rejected"],
    },
  },
} as const
