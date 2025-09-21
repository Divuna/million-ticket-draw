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
          created_at: string
          event: string
          id: number
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: number
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: number
          metadata?: Json | null
          user_id?: string | null
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
          id: string
          status: string
          ticket_position: number
        }
        Insert: {
          admin_notes?: string | null
          amount?: number | null
          contest_id: string
          created_at?: string
          description: string
          id?: string
          status?: string
          ticket_position: number
        }
        Update: {
          admin_notes?: string | null
          amount?: number | null
          contest_id?: string
          created_at?: string
          description?: string
          id?: string
          status?: string
          ticket_position?: number
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
      contests: {
        Row: {
          created_at: string
          description: string | null
          id: string
          main_image: string | null
          main_prize: string
          name: string
          status: string
          ticket_count: number
          ticket_price: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          main_image?: string | null
          main_prize: string
          name?: string
          status?: string
          ticket_count?: number
          ticket_price?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          main_image?: string | null
          main_prize?: string
          name?: string
          status?: string
          ticket_count?: number
          ticket_price?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_logs: {
        Row: {
          contest_id: string | null
          event_name: string | null
          id: number
          metadata: Json | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          contest_id?: string | null
          event_name?: string | null
          id?: never
          metadata?: Json | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          contest_id?: string | null
          event_name?: string | null
          id?: never
          metadata?: Json | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
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
          phone?: string | null
          role?: string
          show_user_menu?: boolean | null
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          code: string
          created_at: string
          id: string
          redeemed: boolean
          redeemed_at: string | null
          user_id: string
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          redeemed?: boolean
          redeemed_at?: string | null
          user_id: string
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          redeemed?: boolean
          redeemed_at?: string | null
          user_id?: string
          value?: number
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
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          balance_coins?: number
          balance_vouchers?: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          balance_coins?: number
          balance_vouchers?: number
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
      admin_manage_voucher: {
        Args: {
          p_code?: string
          p_operation?: string
          p_user_email?: string
          p_value?: number
          p_voucher_id?: string
        }
        Returns: Json
      }
      fn_close_contest: {
        Args: { p_contest: string }
        Returns: undefined
      }
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
        Args: Record<PropertyKey, never>
        Returns: {
          bonus_prizes_summary: string
          contests_summary: string
          notifications_summary: string
          payments_summary: string
          recent_actions: string
          vouchers_summary: string
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
        Args: { p_contest_id?: string }
        Returns: {
          bonus_count: number
          bonus_summary: string
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
          updated_at: string
        }[]
      }
      get_contests_json: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
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
      notify_sofinity_event: {
        Args: {
          p_contest_id?: string
          p_event_name: string
          p_metadata?: Json
          p_user_id?: string
        }
        Returns: undefined
      }
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
      unlock_ticket: {
        Args: { contest_id: string; user_id: string }
        Returns: Json
      }
      update_bonus_prize_delivery_status: {
        Args: { p_admin_notes?: string; p_prize_id: string; p_status: string }
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
