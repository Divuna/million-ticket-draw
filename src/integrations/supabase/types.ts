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
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event?: string
          id?: string
          metadata?: Json | null
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
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_wallets"
            referencedColumns: ["user_id"]
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
          id: string
          is_active: boolean | null
          section: string
          slug: string
          title: string
          updated_at: string | null
          version: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          section: string
          slug: string
          title: string
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          section?: string
          slug?: string
          title?: string
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
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
          status?: string
          ticket_count?: number
          ticket_price?: number
          title?: string
          total_miocoin_bonus?: number | null
          updated_at?: string
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
          event_name: string
          id: string
          last_error: string | null
          metadata: Json | null
          processed_at: string | null
          request_id: number | null
          retry_count: number | null
          source_system: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          contest_id?: string | null
          created_at?: string | null
          event_name: string
          id?: string
          last_error?: string | null
          metadata?: Json | null
          processed_at?: string | null
          request_id?: number | null
          retry_count?: number | null
          source_system?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          contest_id?: string | null
          created_at?: string | null
          event_name?: string
          id?: string
          last_error?: string | null
          metadata?: Json | null
          processed_at?: string | null
          request_id?: number | null
          retry_count?: number | null
          source_system?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
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
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_wallets"
            referencedColumns: ["user_id"]
          },
        ]
      }
      partners: {
        Row: {
          created_at: string
          id: string
          logo_url: string
          name: string
          updated_at: string
          website_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url: string
          name: string
          updated_at?: string
          website_url: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string
          name?: string
          updated_at?: string
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
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_wallets"
            referencedColumns: ["user_id"]
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
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          date_of_birth: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
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
          {
            foreignKeyName: "push_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_wallets"
            referencedColumns: ["user_id"]
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
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_wallets"
            referencedColumns: ["user_id"]
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
          {
            foreignKeyName: "vouchers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_wallets"
            referencedColumns: ["user_id"]
          },
        ]
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
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_wallets"
            referencedColumns: ["user_id"]
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
            referencedRelation: "winners"
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
          type?: string
          user_id?: string
          user_seen?: boolean
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
          {
            foreignKeyName: "winners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_wallets"
            referencedColumns: ["user_id"]
          },
        ]
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
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_wallets: {
        Row: {
          balance_coins: number | null
          balance_vouchers: number | null
          created_at: string | null
          email: string | null
          name: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _invoke_forward_messages_to_sofinity: { Args: never; Returns: undefined }
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
      admin_manage_payment: {
        Args: {
          p_new_status?: string
          p_operation?: string
          p_payment_id?: string
        }
        Returns: Json
      }
      buy_ticket_atomic: {
        Args: { p_contest_id: string; p_user_id: string }
        Returns: Json
      }
      check_guardian_notifications_batch: { Args: never; Returns: Json }
      claim_miocoin_bonus: {
        Args: { p_bonus_id: string; p_user_id: string }
        Returns: undefined
      }
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
      fn_close_contest: { Args: { p_contest: string }; Returns: undefined }
      forward_event_to_sofinity: {
        Args: { v_payload: Json }
        Returns: undefined
      }
      generate_miocoin_bonus: {
        Args: { p_contest_id: string; p_count: number }
        Returns: undefined
      }
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
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
      mark_wins_as_seen: { Args: never; Returns: undefined }
      notify_sofinity_event: {
        Args: {
          p_contest_id?: string
          p_event_name: string
          p_metadata?: Json
          p_user_id?: string
        }
        Returns: string
      }
      process_event_queue_miocoin: { Args: never; Returns: undefined }
      process_push_retries: { Args: never; Returns: undefined }
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
      run_complete_admin_test_suite: { Args: never; Returns: Json }
      run_deep_sofinity_test_suite: {
        Args: { p_performance_events?: number }
        Returns: Json
      }
      safe_send_message: {
        Args: { p_content: string; p_sender: string; p_user_id: string }
        Returns: undefined
      }
      send_push_via_onesignal:
        | {
            Args: { p_message: string; p_player_id: string; p_title: string }
            Returns: undefined
          }
        | {
            Args: {
              p_message: string
              p_player_id: string
              p_push_log_id: string
              p_title: string
            }
            Returns: undefined
          }
        | {
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
      setup_crud_test_data: { Args: { p_user_email?: string }; Returns: Json }
      test_admin_crud_operations: { Args: never; Returns: Json }
      test_admin_security_rls: { Args: never; Returns: Json }
      test_audit_logging: { Args: never; Returns: Json }
      test_deep_data_integrity: { Args: never; Returns: Json }
      test_sofinity_edge_cases: { Args: never; Returns: Json }
      test_sofinity_integration: { Args: never; Returns: Json }
      test_sofinity_performance: {
        Args: { p_event_count?: number }
        Returns: Json
      }
      test_sofinity_player_sync: { Args: never; Returns: Json }
      transfer_bonus_to_main:
        | { Args: never; Returns: undefined }
        | { Args: { p_user_id: string }; Returns: undefined }
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
      validate_crud_test_data: {
        Args: { p_user_email?: string }
        Returns: Json
      }
      validate_sofinity_events: {
        Args: { p_hours_back?: number }
        Returns: {
          count: number
          event_name: string
          latest_timestamp: string
          sample_metadata: Json
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "superadmin" | "user"
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
    },
  },
} as const
