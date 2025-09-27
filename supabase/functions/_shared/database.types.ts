export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          role: string
          created_at: string
          address: string | null
          google_id: string | null
          apple_id: string | null
          show_user_menu: boolean | null
          nickname: string | null
          first_name: string | null
          last_name: string | null
          phone: string | null
        }
        Insert: {
          id?: string
          email: string
          name?: string | null
          role?: string
          created_at?: string
          address?: string | null
          google_id?: string | null
          apple_id?: string | null
          show_user_menu?: boolean | null
          nickname?: string | null
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          role?: string
          created_at?: string
          address?: string | null
          google_id?: string | null
          apple_id?: string | null
          show_user_menu?: boolean | null
          nickname?: string | null
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
        }
      }
      contests: {
        Row: {
          id: string
          title: string
          description: string | null
          main_prize: string
          main_image: string | null
          status: string
          ticket_count: number
          ticket_price: number
          created_at: string
          updated_at: string
          name: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          main_prize: string
          main_image?: string | null
          status?: string
          ticket_count?: number
          ticket_price?: number
          created_at?: string
          updated_at?: string
          name?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          main_prize?: string
          main_image?: string | null
          status?: string
          ticket_count?: number
          ticket_price?: number
          created_at?: string
          updated_at?: string
          name?: string
        }
      }
      bonus_prizes: {
        Row: {
          id: string
          contest_id: string
          description: string
          ticket_position: number
          amount: number | null
          status: string
          admin_notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          contest_id: string
          description: string
          ticket_position: number
          amount?: number | null
          status?: string
          admin_notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          contest_id?: string
          description?: string
          ticket_position?: number
          amount?: number | null
          status?: string
          admin_notes?: string | null
          created_at?: string
        }
      }
      winners: {
        Row: {
          id: string
          contest_id: string
          user_id: string
          prize_id: string | null
          type: string
          status: string | null
          delivered: boolean
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          contest_id: string
          user_id: string
          prize_id?: string | null
          type: string
          status?: string | null
          delivered?: boolean
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          contest_id?: string
          user_id?: string
          prize_id?: string | null
          type?: string
          status?: string | null
          delivered?: boolean
          notes?: string | null
          created_at?: string
        }
      }
      event_logs: {
        Row: {
          id: number
          event_name: string | null
          user_id: string | null
          contest_id: string | null
          metadata: any | null
          timestamp: string | null
        }
        Insert: {
          id?: number
          event_name?: string | null
          user_id?: string | null
          contest_id?: string | null
          metadata?: any | null
          timestamp?: string | null
        }
        Update: {
          id?: number
          event_name?: string | null
          user_id?: string | null
          contest_id?: string | null
          metadata?: any | null
          timestamp?: string | null
        }
      }
      audit_logs: {
        Row: {
          id: number
          event: string
          user_id: string | null
          metadata: any | null
          created_at: string
        }
        Insert: {
          id?: number
          event: string
          user_id?: string | null
          metadata?: any | null
          created_at?: string
        }
        Update: {
          id?: number
          event?: string
          user_id?: string | null
          metadata?: any | null
          created_at?: string
        }
      }
      vouchers: {
        Row: {
          id: string
          name: string
          image_url: string
          banner_url: string | null
          max_quantity: number | null
          redeemed_count: number
          start_date: string | null
          end_date: string | null
          user_id: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          name?: string
          image_url: string
          banner_url?: string | null
          max_quantity?: number | null
          redeemed_count?: number
          start_date?: string | null
          end_date?: string | null
          user_id?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          image_url?: string
          banner_url?: string | null
          max_quantity?: number | null
          redeemed_count?: number
          start_date?: string | null
          end_date?: string | null
          user_id?: string | null
          created_at?: string
          updated_at?: string | null
        }
      }
      tickets: {
        Row: {
          id: string
          contest_id: string
          user_id: string
          number: number
          created_at: string
        }
        Insert: {
          id?: string
          contest_id: string
          user_id: string
          number: number
          created_at?: string
        }
        Update: {
          id?: string
          contest_id?: string
          user_id?: string
          number?: number
          created_at?: string
        }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string | null
          message: string
          status: string
          created_at: string
          sent_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title?: string | null
          message: string
          status?: string
          created_at?: string
          sent_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          title?: string | null
          message?: string
          status?: string
          created_at?: string
          sent_at?: string | null
        }
      }
      payments: {
        Row: {
          id: string
          user_id: string
          amount: number
          method: string
          status: string
          stripe_session_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          method: string
          status?: string
          stripe_session_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          method?: string
          status?: string
          stripe_session_id?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}