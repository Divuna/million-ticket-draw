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
      admin_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: []
      }
      affiliate_accounts: {
        Row: {
          approved_at: string | null
          audience_size: string | null
          auth_user_id: string | null
          billing_city: string | null
          billing_country: string | null
          billing_street: string | null
          billing_zip: string | null
          commission_rate_company: number
          commission_rate_customer: number
          content_categories: string | null
          created_at: string
          email: string
          facebook_url: string | null
          ico: string | null
          id: string
          instagram_url: string | null
          is_vat_payer: boolean
          modes: string[]
          name: string
          notes: string | null
          payout_account: string | null
          payout_bank: string | null
          phone: string | null
          ref_code: string
          rejected_at: string | null
          status: string
          tiktok_url: string | null
          updated_at: string
          vat_id: string | null
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          approved_at?: string | null
          audience_size?: string | null
          auth_user_id?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          commission_rate_company?: number
          commission_rate_customer?: number
          content_categories?: string | null
          created_at?: string
          email: string
          facebook_url?: string | null
          ico?: string | null
          id?: string
          instagram_url?: string | null
          is_vat_payer?: boolean
          modes?: string[]
          name: string
          notes?: string | null
          payout_account?: string | null
          payout_bank?: string | null
          phone?: string | null
          ref_code: string
          rejected_at?: string | null
          status?: string
          tiktok_url?: string | null
          updated_at?: string
          vat_id?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          approved_at?: string | null
          audience_size?: string | null
          auth_user_id?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          commission_rate_company?: number
          commission_rate_customer?: number
          content_categories?: string | null
          created_at?: string
          email?: string
          facebook_url?: string | null
          ico?: string | null
          id?: string
          instagram_url?: string | null
          is_vat_payer?: boolean
          modes?: string[]
          name?: string
          notes?: string | null
          payout_account?: string | null
          payout_bank?: string | null
          phone?: string | null
          ref_code?: string
          rejected_at?: string | null
          status?: string
          tiktok_url?: string | null
          updated_at?: string
          vat_id?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      affiliate_commissions: {
        Row: {
          affiliate_id: string
          amount_base_czk: number
          amount_total_czk: number
          commission_type: string
          company_ref_id: string | null
          confirmation_sent_at: string | null
          created_at: string
          customer_ref_id: string | null
          id: string
          paid_at: string | null
          paid_by: string | null
          payout_batch_id: string | null
          payout_document_id: string | null
          period_month: string | null
          source_invoice_id: string | null
          status: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          affiliate_id: string
          amount_base_czk: number
          amount_total_czk: number
          commission_type: string
          company_ref_id?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          customer_ref_id?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payout_batch_id?: string | null
          payout_document_id?: string | null
          period_month?: string | null
          source_invoice_id?: string | null
          status?: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          affiliate_id?: string
          amount_base_czk?: number
          amount_total_czk?: number
          commission_type?: string
          company_ref_id?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          customer_ref_id?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payout_batch_id?: string | null
          payout_document_id?: string | null
          period_month?: string | null
          source_invoice_id?: string | null
          status?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_company_ref_id_fkey"
            columns: ["company_ref_id"]
            isOneToOne: false
            referencedRelation: "affiliate_company_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_customer_ref_id_fkey"
            columns: ["customer_ref_id"]
            isOneToOne: false
            referencedRelation: "affiliate_customer_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_source_invoice_id_fkey"
            columns: ["source_invoice_id"]
            isOneToOne: false
            referencedRelation: "partner_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ac_payout_batch"
            columns: ["payout_batch_id"]
            isOneToOne: false
            referencedRelation: "affiliate_payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ac_payout_document"
            columns: ["payout_document_id"]
            isOneToOne: false
            referencedRelation: "affiliate_payout_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_company_leads: {
        Row: {
          admin_rejection_reason: string | null
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          affiliate_id: string | null
          approved_at: string | null
          company_confirmation_expires_at: string | null
          company_confirmation_sent_at: string | null
          company_confirmation_token_hash: string | null
          company_confirmation_used_at: string | null
          company_confirmed_at: string | null
          company_email: string
          company_name: string
          company_rejected_at: string | null
          company_rejection_reason: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          dic: string | null
          ico: string | null
          id: string
          partner_id: string | null
          sales_rep_affiliate_id_snapshot: string | null
          sales_rep_email_snapshot: string | null
          sales_rep_name_snapshot: string | null
          sales_rep_note: string | null
          sales_rep_ref_code_snapshot: string | null
          status: string
          submitted_to_admin_at: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          admin_rejection_reason?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          affiliate_id?: string | null
          approved_at?: string | null
          company_confirmation_expires_at?: string | null
          company_confirmation_sent_at?: string | null
          company_confirmation_token_hash?: string | null
          company_confirmation_used_at?: string | null
          company_confirmed_at?: string | null
          company_email: string
          company_name: string
          company_rejected_at?: string | null
          company_rejection_reason?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          dic?: string | null
          ico?: string | null
          id?: string
          partner_id?: string | null
          sales_rep_affiliate_id_snapshot?: string | null
          sales_rep_email_snapshot?: string | null
          sales_rep_name_snapshot?: string | null
          sales_rep_note?: string | null
          sales_rep_ref_code_snapshot?: string | null
          status?: string
          submitted_to_admin_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          admin_rejection_reason?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          affiliate_id?: string | null
          approved_at?: string | null
          company_confirmation_expires_at?: string | null
          company_confirmation_sent_at?: string | null
          company_confirmation_token_hash?: string | null
          company_confirmation_used_at?: string | null
          company_confirmed_at?: string | null
          company_email?: string
          company_name?: string
          company_rejected_at?: string | null
          company_rejection_reason?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          dic?: string | null
          ico?: string | null
          id?: string
          partner_id?: string | null
          sales_rep_affiliate_id_snapshot?: string | null
          sales_rep_email_snapshot?: string | null
          sales_rep_name_snapshot?: string | null
          sales_rep_note?: string | null
          sales_rep_ref_code_snapshot?: string | null
          status?: string
          submitted_to_admin_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_company_leads_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_company_leads_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_company_leads_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_company_refs: {
        Row: {
          affiliate_id: string
          created_at: string
          id: string
          partner_id: string
          source: string | null
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          id?: string
          partner_id: string
          source?: string | null
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          id?: string
          partner_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_company_refs_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_company_refs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_company_refs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "public_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_customer_refs: {
        Row: {
          affiliate_id: string
          created_at: string
          id: string
          source: string | null
          user_id: string
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          id?: string
          source?: string | null
          user_id: string
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          id?: string
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_customer_refs_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payout_batch_items: {
        Row: {
          amount_czk: number
          batch_id: string
          commission_id: string
          constant_symbol: string
          created_at: string
          id: string
          payment_message: string | null
          recipient_account: string
          recipient_bank_code: string
          recipient_name: string
          specific_symbol: string | null
          variable_symbol: string
        }
        Insert: {
          amount_czk: number
          batch_id: string
          commission_id: string
          constant_symbol?: string
          created_at?: string
          id?: string
          payment_message?: string | null
          recipient_account: string
          recipient_bank_code: string
          recipient_name: string
          specific_symbol?: string | null
          variable_symbol: string
        }
        Update: {
          amount_czk?: number
          batch_id?: string
          commission_id?: string
          constant_symbol?: string
          created_at?: string
          id?: string
          payment_message?: string | null
          recipient_account?: string
          recipient_bank_code?: string
          recipient_name?: string
          specific_symbol?: string | null
          variable_symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payout_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "affiliate_payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_payout_batch_items_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: true
            referencedRelation: "affiliate_commissions"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payout_batches: {
        Row: {
          bank: string
          bank_export_encoding: string
          bank_export_error: string | null
          bank_export_format: string
          bank_export_generated_at: string | null
          bank_export_line_endings: string
          bank_export_sha256: string | null
          bank_export_size_bytes: number | null
          bank_export_storage_path: string | null
          bank_export_url: string | null
          batch_number: string
          cancelled_at: string | null
          created_at: string
          created_by: string
          due_date: string | null
          exported_at: string | null
          id: string
          item_count: number
          marked_paid_at: string | null
          marked_paid_by: string | null
          payer_account: string | null
          payer_bank_code: string
          status: string
          total_amount_czk: number
        }
        Insert: {
          bank?: string
          bank_export_encoding?: string
          bank_export_error?: string | null
          bank_export_format?: string
          bank_export_generated_at?: string | null
          bank_export_line_endings?: string
          bank_export_sha256?: string | null
          bank_export_size_bytes?: number | null
          bank_export_storage_path?: string | null
          bank_export_url?: string | null
          batch_number: string
          cancelled_at?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          exported_at?: string | null
          id?: string
          item_count?: number
          marked_paid_at?: string | null
          marked_paid_by?: string | null
          payer_account?: string | null
          payer_bank_code?: string
          status?: string
          total_amount_czk?: number
        }
        Update: {
          bank?: string
          bank_export_encoding?: string
          bank_export_error?: string | null
          bank_export_format?: string
          bank_export_generated_at?: string | null
          bank_export_line_endings?: string
          bank_export_sha256?: string | null
          bank_export_size_bytes?: number | null
          bank_export_storage_path?: string | null
          bank_export_url?: string | null
          batch_number?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          exported_at?: string | null
          id?: string
          item_count?: number
          marked_paid_at?: string | null
          marked_paid_by?: string | null
          payer_account?: string | null
          payer_bank_code?: string
          status?: string
          total_amount_czk?: number
        }
        Relationships: []
      }
      affiliate_payout_documents: {
        Row: {
          accounting_email: string | null
          accounting_email_queue_id: string | null
          affiliate_email: string | null
          affiliate_id: string
          amount_base_czk: number
          amount_total_czk: number
          commission_id: string
          created_at: string
          document_number: string
          document_type: string
          email_error: string | null
          email_queue_id: string | null
          email_status: string
          id: string
          pdf_generated_at: string | null
          pdf_sha256: string | null
          pdf_storage_path: string | null
          pdf_url: string | null
          recipient_billing_address: string | null
          recipient_email: string | null
          recipient_ico: string | null
          recipient_is_vat_payer: boolean
          recipient_name: string
          recipient_subject_type: string | null
          recipient_vat_id: string | null
          sent_at: string | null
          vat_rate: number
        }
        Insert: {
          accounting_email?: string | null
          accounting_email_queue_id?: string | null
          affiliate_email?: string | null
          affiliate_id: string
          amount_base_czk: number
          amount_total_czk: number
          commission_id: string
          created_at?: string
          document_number: string
          document_type?: string
          email_error?: string | null
          email_queue_id?: string | null
          email_status?: string
          id?: string
          pdf_generated_at?: string | null
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          recipient_billing_address?: string | null
          recipient_email?: string | null
          recipient_ico?: string | null
          recipient_is_vat_payer?: boolean
          recipient_name: string
          recipient_subject_type?: string | null
          recipient_vat_id?: string | null
          sent_at?: string | null
          vat_rate?: number
        }
        Update: {
          accounting_email?: string | null
          accounting_email_queue_id?: string | null
          affiliate_email?: string | null
          affiliate_id?: string
          amount_base_czk?: number
          amount_total_czk?: number
          commission_id?: string
          created_at?: string
          document_number?: string
          document_type?: string
          email_error?: string | null
          email_queue_id?: string | null
          email_status?: string
          id?: string
          pdf_generated_at?: string | null
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          recipient_billing_address?: string | null
          recipient_email?: string | null
          recipient_ico?: string | null
          recipient_is_vat_payer?: boolean
          recipient_name?: string
          recipient_subject_type?: string | null
          recipient_vat_id?: string | null
          sent_at?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payout_documents_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_payout_documents_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: true
            referencedRelation: "affiliate_commissions"
            referencedColumns: ["id"]
          },
        ]
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
      backup_audit_logs: {
        Row: {
          created_at: string | null
          event: string | null
          event_type: string | null
          id: string | null
          metadata: Json | null
          reference_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event?: string | null
          event_type?: string | null
          id?: string | null
          metadata?: Json | null
          reference_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event?: string | null
          event_type?: string | null
          id?: string | null
          metadata?: Json | null
          reference_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_contests: {
        Row: {
          banner_image: string | null
          created_at: string | null
          description: string | null
          generated_poster_url: string | null
          id: string | null
          main_image: string | null
          main_prize: string | null
          main_prize_secondary_image: string | null
          name: string | null
          next_ticket_number: number | null
          status: string | null
          ticket_count: number | null
          ticket_price: number | null
          title: string | null
          total_miocoin_bonus: number | null
          updated_at: string | null
        }
        Insert: {
          banner_image?: string | null
          created_at?: string | null
          description?: string | null
          generated_poster_url?: string | null
          id?: string | null
          main_image?: string | null
          main_prize?: string | null
          main_prize_secondary_image?: string | null
          name?: string | null
          next_ticket_number?: number | null
          status?: string | null
          ticket_count?: number | null
          ticket_price?: number | null
          title?: string | null
          total_miocoin_bonus?: number | null
          updated_at?: string | null
        }
        Update: {
          banner_image?: string | null
          created_at?: string | null
          description?: string | null
          generated_poster_url?: string | null
          id?: string | null
          main_image?: string | null
          main_prize?: string | null
          main_prize_secondary_image?: string | null
          name?: string | null
          next_ticket_number?: number | null
          status?: string | null
          ticket_count?: number | null
          ticket_price?: number | null
          title?: string | null
          total_miocoin_bonus?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_tickets: {
        Row: {
          contest_id: string | null
          created_at: string | null
          id: string | null
          number: number | null
          user_id: string | null
        }
        Insert: {
          contest_id?: string | null
          created_at?: string | null
          id?: string | null
          number?: number | null
          user_id?: string | null
        }
        Update: {
          contest_id?: string | null
          created_at?: string | null
          id?: string | null
          number?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_winners: {
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
          handling_override_czk: number | null
          id: string
          image_url: string | null
          status: string
          supplier_name: string | null
          ticket_position: number
          title: string | null
          unit_cost_czk: number | null
          vat_rate_percent: number | null
        }
        Insert: {
          admin_notes?: string | null
          amount?: number | null
          contest_id: string
          created_at?: string
          description: string
          detailed_description?: string | null
          guardian_required?: boolean
          handling_override_czk?: number | null
          id?: string
          image_url?: string | null
          status?: string
          supplier_name?: string | null
          ticket_position: number
          title?: string | null
          unit_cost_czk?: number | null
          vat_rate_percent?: number | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number | null
          contest_id?: string
          created_at?: string
          description?: string
          detailed_description?: string | null
          guardian_required?: boolean
          handling_override_czk?: number | null
          id?: string
          image_url?: string | null
          status?: string
          supplier_name?: string | null
          ticket_position?: number
          title?: string | null
          unit_cost_czk?: number | null
          vat_rate_percent?: number | null
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
          description: string | null
          id: string
          image_url: string
          title: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url: string
          title?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
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
      contest_economy: {
        Row: {
          contest_id: string
          created_at: string
          default_handling_czk: number
          main_prize_cost_czk: number
          marketing_percent: number
          miocoin_real_cost_czk: number
          setup_cost_czk: number
          target_margin_percent: number
          updated_at: string
          vat_rate_percent: number
        }
        Insert: {
          contest_id: string
          created_at?: string
          default_handling_czk?: number
          main_prize_cost_czk?: number
          marketing_percent?: number
          miocoin_real_cost_czk?: number
          setup_cost_czk?: number
          target_margin_percent?: number
          updated_at?: string
          vat_rate_percent?: number
        }
        Update: {
          contest_id?: string
          created_at?: string
          default_handling_czk?: number
          main_prize_cost_czk?: number
          marketing_percent?: number
          miocoin_real_cost_czk?: number
          setup_cost_czk?: number
          target_margin_percent?: number
          updated_at?: string
          vat_rate_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "contest_economy_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: true
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_economy_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: true
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_economy_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: true
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_economy_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: true
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_economy_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: true
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_economy_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: true
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "contest_economy_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: true
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
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
          fast_game: boolean
          generated_poster_url: string | null
          id: string
          main_image: string | null
          main_prize: string
          main_prize_secondary_image: string | null
          name: string
          next_ticket_number: number
          rules: string | null
          rules_pdf_url: string | null
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
          fast_game?: boolean
          generated_poster_url?: string | null
          id?: string
          main_image?: string | null
          main_prize: string
          main_prize_secondary_image?: string | null
          name?: string
          next_ticket_number?: number
          rules?: string | null
          rules_pdf_url?: string | null
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
          fast_game?: boolean
          generated_poster_url?: string | null
          id?: string
          main_image?: string | null
          main_prize?: string
          main_prize_secondary_image?: string | null
          name?: string
          next_ticket_number?: number
          rules?: string | null
          rules_pdf_url?: string | null
          status?: string
          ticket_count?: number
          ticket_price?: number
          title?: string
          total_miocoin_bonus?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cookie_consents: {
        Row: {
          analytics: boolean | null
          consent_given_at: string | null
          id: string
          ip_address: string | null
          marketing: boolean | null
          necessary: boolean | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          analytics?: boolean | null
          consent_given_at?: string | null
          id?: string
          ip_address?: string | null
          marketing?: boolean | null
          necessary?: boolean | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          analytics?: boolean | null
          consent_given_at?: string | null
          id?: string
          ip_address?: string | null
          marketing?: boolean | null
          necessary?: boolean | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
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
          attachment_content_type: string | null
          attachment_filename: string | null
          attachment_required: boolean
          attachment_storage_bucket: string | null
          attachment_storage_path: string | null
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
          attachment_content_type?: string | null
          attachment_filename?: string | null
          attachment_required?: boolean
          attachment_storage_bucket?: string | null
          attachment_storage_path?: string | null
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
          attachment_content_type?: string | null
          attachment_filename?: string | null
          attachment_required?: boolean
          attachment_storage_bucket?: string | null
          attachment_storage_path?: string | null
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
          {
            foreignKeyName: "influencer_campaign_bonuses_czk_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
          {
            foreignKeyName: "influencer_campaign_events_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
          {
            foreignKeyName: "influencer_campaign_partners_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
          {
            foreignKeyName: "influencer_commissions_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
          {
            foreignKeyName: "influencer_referrals_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_affiliate_referrals: {
        Row: {
          activated_at: string | null
          affiliate_code_id: string | null
          affiliate_partner_id: string
          approved_at: string | null
          bonus_eligible_at: string | null
          created_by: string | null
          id: string
          merchant_partner_id: string
          metadata: Json
          registered_at: string
          status: string
        }
        Insert: {
          activated_at?: string | null
          affiliate_code_id?: string | null
          affiliate_partner_id: string
          approved_at?: string | null
          bonus_eligible_at?: string | null
          created_by?: string | null
          id?: string
          merchant_partner_id: string
          metadata?: Json
          registered_at?: string
          status?: string
        }
        Update: {
          activated_at?: string | null
          affiliate_code_id?: string | null
          affiliate_partner_id?: string
          approved_at?: string | null
          bonus_eligible_at?: string | null
          created_by?: string | null
          id?: string
          merchant_partner_id?: string
          metadata?: Json
          registered_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_affiliate_referrals_merchant_partner_id_fkey"
            columns: ["merchant_partner_id"]
            isOneToOne: true
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_affiliate_referrals_merchant_partner_id_fkey"
            columns: ["merchant_partner_id"]
            isOneToOne: true
            referencedRelation: "public_partners"
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
          {
            foreignKeyName: "partner_api_keys_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
          {
            foreignKeyName: "partner_coin_activations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
          metadata: Json
          storage_bucket: string | null
          storage_path: string | null
        }
        Insert: {
          created_at?: string | null
          file_url?: string | null
          format: string
          id?: string
          invoice_id: string
          metadata?: Json
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Update: {
          created_at?: string | null
          file_url?: string | null
          format?: string
          id?: string
          invoice_id?: string
          metadata?: Json
          storage_bucket?: string | null
          storage_path?: string | null
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
          type: string
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
          type?: string
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
          type?: string
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
          {
            foreignKeyName: "partner_invoices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_offer_activations: {
        Row: {
          activated_at: string
          created_at: string
          id: string
          invoice_id: string | null
          invoiced: boolean
          offer_id: string
          partner_id: string
          upo_id: string
          user_id: string
        }
        Insert: {
          activated_at: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          invoiced?: boolean
          offer_id: string
          partner_id: string
          upo_id: string
          user_id: string
        }
        Update: {
          activated_at?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          invoiced?: boolean
          offer_id?: string
          partner_id?: string
          upo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_offer_activations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "partner_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_offer_activations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_offer_activations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_offer_activations_upo_id_fkey"
            columns: ["upo_id"]
            isOneToOne: true
            referencedRelation: "user_partner_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_offer_billing_configs: {
        Row: {
          billing_mode: string
          created_at: string
          id: string
          notes: string | null
          partner_id: string
          price_per_activation: number
          updated_at: string
        }
        Insert: {
          billing_mode?: string
          created_at?: string
          id?: string
          notes?: string | null
          partner_id: string
          price_per_activation?: number
          updated_at?: string
        }
        Update: {
          billing_mode?: string
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string
          price_per_activation?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_offer_billing_configs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_offer_billing_configs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "public_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_offer_clicks: {
        Row: {
          clicked_at: string
          contest_id: string | null
          id: string
          offer_id: string
          user_id: string | null
        }
        Insert: {
          clicked_at?: string
          contest_id?: string | null
          id?: string
          offer_id: string
          user_id?: string | null
        }
        Update: {
          clicked_at?: string
          contest_id?: string | null
          id?: string
          offer_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_offer_clicks_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_clicks_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_clicks_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_clicks_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_clicks_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_clicks_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_clicks_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_offer_clicks_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "partner_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_offer_contests: {
        Row: {
          attached_at: string
          contest_id: string
          detached_at: string | null
          id: string
          offer_id: string
        }
        Insert: {
          attached_at?: string
          contest_id: string
          detached_at?: string | null
          id?: string
          offer_id: string
        }
        Update: {
          attached_at?: string
          contest_id?: string
          detached_at?: string | null
          id?: string
          offer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_offer_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_offer_contests_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "partner_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_offer_invoice_lines: {
        Row: {
          activated_at: string
          activation_id: string
          amount: number
          created_at: string
          id: string
          invoice_id: string
        }
        Insert: {
          activated_at: string
          activation_id: string
          amount?: number
          created_at?: string
          id?: string
          invoice_id: string
        }
        Update: {
          activated_at?: string
          activation_id?: string
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_offer_invoice_lines_activation_id_fkey"
            columns: ["activation_id"]
            isOneToOne: true
            referencedRelation: "partner_offer_activations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_offer_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "partner_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_offer_selected_contests: {
        Row: {
          attached_at: string
          contest_id: string
          detached_at: string | null
          id: string
          offer_id: string
        }
        Insert: {
          attached_at?: string
          contest_id: string
          detached_at?: string | null
          id?: string
          offer_id: string
        }
        Update: {
          attached_at?: string
          contest_id?: string
          detached_at?: string | null
          id?: string
          offer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_offer_selected_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_contest_status"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_selected_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "admin_winner_delivery_stats"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_selected_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_analytics"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_selected_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_integrity_check"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_selected_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_progress"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_selected_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contest_revenue"
            referencedColumns: ["contest_id"]
          },
          {
            foreignKeyName: "partner_offer_selected_contests_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_offer_selected_contests_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "partner_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_offers: {
        Row: {
          approved_at: string | null
          banner_url: string | null
          billing_admin_override: boolean
          billing_mode: string
          created_at: string
          deployment_mode: string
          id: string
          last_assigned_at: string | null
          link_or_code: string | null
          logo_url: string | null
          partner_id: string
          price_per_activation: number
          priority: number
          rejected_at: string | null
          rejection_reason: string | null
          short_text: string
          status: string
          submitted_at: string | null
          title: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          approved_at?: string | null
          banner_url?: string | null
          billing_admin_override?: boolean
          billing_mode?: string
          created_at?: string
          deployment_mode: string
          id?: string
          last_assigned_at?: string | null
          link_or_code?: string | null
          logo_url?: string | null
          partner_id: string
          price_per_activation?: number
          priority?: number
          rejected_at?: string | null
          rejection_reason?: string | null
          short_text: string
          status?: string
          submitted_at?: string | null
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          approved_at?: string | null
          banner_url?: string | null
          billing_admin_override?: boolean
          billing_mode?: string
          created_at?: string
          deployment_mode?: string
          id?: string
          last_assigned_at?: string | null
          link_or_code?: string | null
          logo_url?: string | null
          partner_id?: string
          price_per_activation?: number
          priority?: number
          rejected_at?: string | null
          rejection_reason?: string | null
          short_text?: string
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_offers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_offers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
          {
            foreignKeyName: "partner_reward_codes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
          referred_by_affiliate_id: string | null
          rejected_at: string | null
          reward_base_czk: number
          reward_mc: number
          reward_trigger_status: string
          shoptet_customer_delivery: string
          shoptet_export_secret_name: string | null
          shoptet_import_enabled: boolean
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
          referred_by_affiliate_id?: string | null
          rejected_at?: string | null
          reward_base_czk?: number
          reward_mc?: number
          reward_trigger_status?: string
          shoptet_customer_delivery?: string
          shoptet_export_secret_name?: string | null
          shoptet_import_enabled?: boolean
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
          referred_by_affiliate_id?: string | null
          rejected_at?: string | null
          reward_base_czk?: number
          reward_mc?: number
          reward_trigger_status?: string
          shoptet_customer_delivery?: string
          shoptet_export_secret_name?: string | null
          shoptet_import_enabled?: boolean
          status?: Database["public"]["Enums"]["partner_status"]
          suspended_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          vat_rate?: number
          website_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_referred_by_affiliate_id_fkey"
            columns: ["referred_by_affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_accounts"
            referencedColumns: ["id"]
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
      sales_lead_activities: {
        Row: {
          activity_status: string
          activity_type: string
          body_snapshot: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          direction: string | null
          email_message_id: string | null
          id: string
          lead_id: string
          metadata: Json
          performed_by: string | null
          read_at: string | null
          read_by: string | null
          scheduled_for: string | null
          subject: string | null
        }
        Insert: {
          activity_status?: string
          activity_type: string
          body_snapshot?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          direction?: string | null
          email_message_id?: string | null
          id?: string
          lead_id: string
          metadata?: Json
          performed_by?: string | null
          read_at?: string | null
          read_by?: string | null
          scheduled_for?: string | null
          subject?: string | null
        }
        Update: {
          activity_status?: string
          activity_type?: string
          body_snapshot?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          direction?: string | null
          email_message_id?: string | null
          id?: string
          lead_id?: string
          metadata?: Json
          performed_by?: string | null
          read_at?: string | null
          read_by?: string | null
          scheduled_for?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_lead_duplicate_overrides: {
        Row: {
          confirmed_by: string
          created_at: string
          id: string
          lead_id: string
          match_type: string
          matched_lead_id: string
          matched_value: string
          reason: string
        }
        Insert: {
          confirmed_by: string
          created_at?: string
          id?: string
          lead_id: string
          match_type: string
          matched_lead_id: string
          matched_value: string
          reason: string
        }
        Update: {
          confirmed_by?: string
          created_at?: string
          id?: string
          lead_id?: string
          match_type?: string
          matched_lead_id?: string
          matched_value?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_lead_duplicate_overrides_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_lead_duplicate_overrides_matched_lead_id_fkey"
            columns: ["matched_lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_lead_email_suppression: {
        Row: {
          created_at: string
          created_by: string | null
          email_pattern: string
          id: string
          reason: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email_pattern: string
          id?: string
          reason: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email_pattern?: string
          id?: string
          reason?: string
        }
        Relationships: []
      }
      sales_lead_public_email_domains: {
        Row: {
          created_at: string
          domain: string
        }
        Insert: {
          created_at?: string
          domain: string
        }
        Update: {
          created_at?: string
          domain?: string
        }
        Relationships: []
      }
      sales_lead_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          lead_id: string
          new_status: string
          old_status: string
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          lead_id: string
          new_status: string
          old_status: string
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          new_status?: string
          old_status?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_lead_status_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_lead_tasks: {
        Row: {
          assigned_admin_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          due_at: string
          id: string
          lead_id: string
          note: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_admin_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          due_at: string
          id?: string
          lead_id: string
          note?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          due_at?: string
          id?: string
          lead_id?: string
          note?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_leads: {
        Row: {
          address: string | null
          ai_research_at: string | null
          ai_research_summary: string | null
          assigned_admin_id: string | null
          city: string | null
          company_name: string
          company_size: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          contact_role: string | null
          converted_partner_id: string | null
          created_at: string
          created_by: string
          dic: string | null
          discovery_meta: Json
          discovery_source: string | null
          do_not_contact: boolean
          do_not_contact_reason: string | null
          draft_approved_at: string | null
          draft_approved_by: string | null
          draft_email_body: string | null
          draft_email_subject: string | null
          draft_prepared_by: string | null
          email_source: string | null
          email_verified_by_admin: boolean
          ico: string | null
          id: string
          industry: string | null
          lead_group: string | null
          lead_quality: number
          next_action_at: string | null
          notes: string | null
          priority: number
          proposed_contact_at: string | null
          proposed_contact_by: string | null
          proposed_contact_email: string | null
          proposed_contact_source_url: string | null
          proposed_contact_status: string | null
          source: string
          status: string
          updated_at: string
          website: string | null
          website_domain: string | null
        }
        Insert: {
          address?: string | null
          ai_research_at?: string | null
          ai_research_summary?: string | null
          assigned_admin_id?: string | null
          city?: string | null
          company_name: string
          company_size?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          converted_partner_id?: string | null
          created_at?: string
          created_by: string
          dic?: string | null
          discovery_meta?: Json
          discovery_source?: string | null
          do_not_contact?: boolean
          do_not_contact_reason?: string | null
          draft_approved_at?: string | null
          draft_approved_by?: string | null
          draft_email_body?: string | null
          draft_email_subject?: string | null
          draft_prepared_by?: string | null
          email_source?: string | null
          email_verified_by_admin?: boolean
          ico?: string | null
          id?: string
          industry?: string | null
          lead_group?: string | null
          lead_quality?: number
          next_action_at?: string | null
          notes?: string | null
          priority?: number
          proposed_contact_at?: string | null
          proposed_contact_by?: string | null
          proposed_contact_email?: string | null
          proposed_contact_source_url?: string | null
          proposed_contact_status?: string | null
          source?: string
          status?: string
          updated_at?: string
          website?: string | null
          website_domain?: string | null
        }
        Update: {
          address?: string | null
          ai_research_at?: string | null
          ai_research_summary?: string | null
          assigned_admin_id?: string | null
          city?: string | null
          company_name?: string
          company_size?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          converted_partner_id?: string | null
          created_at?: string
          created_by?: string
          dic?: string | null
          discovery_meta?: Json
          discovery_source?: string | null
          do_not_contact?: boolean
          do_not_contact_reason?: string | null
          draft_approved_at?: string | null
          draft_approved_by?: string | null
          draft_email_body?: string | null
          draft_email_subject?: string | null
          draft_prepared_by?: string | null
          email_source?: string | null
          email_verified_by_admin?: boolean
          ico?: string | null
          id?: string
          industry?: string | null
          lead_group?: string | null
          lead_quality?: number
          next_action_at?: string | null
          notes?: string | null
          priority?: number
          proposed_contact_at?: string | null
          proposed_contact_by?: string | null
          proposed_contact_email?: string | null
          proposed_contact_source_url?: string | null
          proposed_contact_status?: string | null
          source?: string
          status?: string
          updated_at?: string
          website?: string | null
          website_domain?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_leads_converted_partner_id_fkey"
            columns: ["converted_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_leads_converted_partner_id_fkey"
            columns: ["converted_partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
            referencedColumns: ["id"]
          },
        ]
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
      shoptet_connection_requests: {
        Row: {
          created_at: string
          id: string
          partner_id: string
          partner_note: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reward_czk: number
          reward_mc: number
          shop_name: string
          status: string
          submitted_at: string | null
          trigger_status: string
          updated_at: string
          url_received: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          partner_id: string
          partner_note?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_czk: number
          reward_mc: number
          shop_name: string
          status?: string
          submitted_at?: string | null
          trigger_status?: string
          updated_at?: string
          url_received?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          partner_id?: string
          partner_note?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_czk?: number
          reward_mc?: number
          shop_name?: string
          status?: string
          submitted_at?: string | null
          trigger_status?: string
          updated_at?: string
          url_received?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "shoptet_connection_requests_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoptet_connection_requests_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      shoptet_import_row_log: {
        Row: {
          action: string
          created_at: string
          external_order_id: string | null
          id: string
          message: string | null
          result: string | null
          run_id: string
        }
        Insert: {
          action: string
          created_at?: string
          external_order_id?: string | null
          id?: string
          message?: string | null
          result?: string | null
          run_id: string
        }
        Update: {
          action?: string
          created_at?: string
          external_order_id?: string | null
          id?: string
          message?: string | null
          result?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoptet_import_row_log_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "shoptet_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      shoptet_import_runs: {
        Row: {
          error_summary: string | null
          finished_at: string | null
          id: string
          mode: string
          partner_id: string | null
          rows_created: number
          rows_failed: number
          rows_invalid: number
          rows_skipped_dup: number
          rows_status_updated: number
          rows_total: number
          rows_valid: number
          rows_would_create: number
          rows_would_status_update: number
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          mode?: string
          partner_id?: string | null
          rows_created?: number
          rows_failed?: number
          rows_invalid?: number
          rows_skipped_dup?: number
          rows_status_updated?: number
          rows_total?: number
          rows_valid?: number
          rows_would_create?: number
          rows_would_status_update?: number
          started_at?: string
          status?: string
          trigger?: string
        }
        Update: {
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          mode?: string
          partner_id?: string | null
          rows_created?: number
          rows_failed?: number
          rows_invalid?: number
          rows_skipped_dup?: number
          rows_status_updated?: number
          rows_total?: number
          rows_valid?: number
          rows_would_create?: number
          rows_would_status_update?: number
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoptet_import_runs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoptet_import_runs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
      user_partner_offers: {
        Row: {
          created_at: string
          hidden_at: string | null
          id: string
          last_reminder_at: string | null
          obtained_at: string
          offer_id: string
          opened_at: string | null
          status: string
          ticket_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          hidden_at?: string | null
          id?: string
          last_reminder_at?: string | null
          obtained_at?: string
          offer_id: string
          opened_at?: string | null
          status?: string
          ticket_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          hidden_at?: string | null
          id?: string
          last_reminder_at?: string | null
          obtained_at?: string
          offer_id?: string
          opened_at?: string | null
          status?: string
          ticket_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_partner_offers_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "partner_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_partner_offers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_partner_offers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
          voucher_code_id: string | null
          voucher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          redeemed?: boolean
          updated_at?: string
          user_id: string
          voucher_code_id?: string | null
          voucher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          redeemed?: boolean
          updated_at?: string
          user_id?: string
          voucher_code_id?: string | null
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
            foreignKeyName: "user_vouchers_voucher_code_id_fkey"
            columns: ["voucher_code_id"]
            isOneToOne: false
            referencedRelation: "voucher_codes"
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
          last_seen_at: string | null
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
          last_seen_at?: string | null
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
          last_seen_at?: string | null
          name?: string | null
          nickname?: string | null
          onesignal_player_id?: string | null
          phone?: string | null
          role?: string
          show_user_menu?: boolean | null
        }
        Relationships: []
      }
      voucher_code_batches: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          import_filename: string | null
          label: string | null
          notes: string | null
          source: string
          total_count: number
          updated_at: string
          voucher_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          import_filename?: string | null
          label?: string | null
          notes?: string | null
          source: string
          total_count?: number
          updated_at?: string
          voucher_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          import_filename?: string | null
          label?: string | null
          notes?: string | null
          source?: string
          total_count?: number
          updated_at?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_code_batches_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_codes: {
        Row: {
          batch_id: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          issued_at: string | null
          issued_to_user_id: string | null
          issued_user_voucher_id: string | null
          status: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voucher_id: string
        }
        Insert: {
          batch_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          issued_to_user_id?: string | null
          issued_user_voucher_id?: string | null
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voucher_id: string
        }
        Update: {
          batch_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          issued_to_user_id?: string | null
          issued_user_voucher_id?: string | null
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_codes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "voucher_code_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_codes_issued_to_user_id_fkey"
            columns: ["issued_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_codes_issued_user_voucher_id_fkey"
            columns: ["issued_user_voucher_id"]
            isOneToOne: true
            referencedRelation: "user_vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_codes_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          banner_url: string | null
          created_at: string
          end_date: string | null
          how_to_use_text: string | null
          id: string
          image_url: string
          is_public: boolean
          max_quantity: number | null
          name: string
          redeem_price_vouchers: number
          redeemed_count: number
          short_description: string | null
          start_date: string | null
          terms_text: string | null
          updated_at: string | null
          usage_description: string | null
          user_id: string | null
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          end_date?: string | null
          how_to_use_text?: string | null
          id?: string
          image_url: string
          is_public?: boolean
          max_quantity?: number | null
          name?: string
          redeem_price_vouchers?: number
          redeemed_count?: number
          short_description?: string | null
          start_date?: string | null
          terms_text?: string | null
          updated_at?: string | null
          usage_description?: string | null
          user_id?: string | null
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          end_date?: string | null
          how_to_use_text?: string | null
          id?: string
          image_url?: string
          is_public?: boolean
          max_quantity?: number | null
          name?: string
          redeem_price_vouchers?: number
          redeemed_count?: number
          short_description?: string | null
          start_date?: string | null
          terms_text?: string | null
          updated_at?: string | null
          usage_description?: string | null
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
          bonus_balance_coins: number
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          balance_coins?: number
          bonus_balance_coins?: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          balance_coins?: number
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
      public_bonus_prizes: {
        Row: {
          amount: number | null
          contest_id: string
          description: string
          detailed_description: string | null
          guardian_required: boolean
          id: string
          image_url: string | null
          status: string
          title: string | null
        }
        Insert: {
          amount?: number | null
          contest_id?: string | null
          description?: string | null
          detailed_description?: string | null
          guardian_required?: boolean | null
          id?: string | null
          image_url?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          amount?: number | null
          contest_id?: string | null
          description?: string | null
          detailed_description?: string | null
          guardian_required?: boolean | null
          id?: string | null
          image_url?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: []
      }
      public_partners: {
        Row: {
          created_at: string | null
          id: string | null
          logo_status: string | null
          logo_url: string | null
          name: string | null
          status: Database["public"]["Enums"]["partner_status"] | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          logo_status?: string | null
          logo_url?: string | null
          name?: string | null
          status?: Database["public"]["Enums"]["partner_status"] | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          logo_status?: string | null
          logo_url?: string | null
          name?: string | null
          status?: Database["public"]["Enums"]["partner_status"] | null
          updated_at?: string | null
          website_url?: string | null
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
        Insert: {
          created_at?: string | null
          id?: string | null
          influencer_partner_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          influencer_partner_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "influencer_referrals_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "influencer_referrals_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
          {
            foreignKeyName: "influencer_referrals_influencer_partner_id_fkey"
            columns: ["influencer_partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
          {
            foreignKeyName: "partner_api_keys_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "public_partners"
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
      admin_append_miocoin_chunk: {
        Args: { p_bonuses: Json; p_contest_id: string }
        Returns: Json
      }
      admin_begin_miocoin_save: {
        Args: { p_contest_id: string; p_expected_count: number }
        Returns: Json
      }
      admin_block_referrer: {
        Args: { p_blocked: boolean; p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      admin_bulk_insert_miocoin_bonuses: {
        Args: { p_bonuses: Json; p_contest_id: string }
        Returns: Json
      }
      admin_finalize_miocoin_save: {
        Args: { p_contest_id: string; p_expected_count: number }
        Returns: Json
      }
      admin_manage_bonus_prize:
        | {
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
        | {
            Args: {
              p_amount?: number
              p_contest_id?: string
              p_description?: string
              p_detailed_description?: string
              p_image_url?: string
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
          p_fast_game?: boolean
          p_main_image?: string
          p_main_prize?: string
          p_operation: string
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
          p_new_status: string
          p_operation: string
          p_payment_id: string
        }
        Returns: Json
      }
      admin_set_affiliate_commission_status: {
        Args: { p_commission_id: string; p_new_status: string }
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
      approve_affiliate_company_lead_txn: {
        Args: {
          p_action: string
          p_admin_user_id: string
          p_lead_id: string
          p_partner_auth_id: string
          p_rejection_reason: string
        }
        Returns: Json
      }
      assign_partner_offer_to_ticket: {
        Args: { p_contest_id: string; p_ticket_id?: string; p_user_id: string }
        Returns: string
      }
      build_isdoc_payload: { Args: { p_invoice_id: string }; Returns: Json }
      bump_user_last_seen: { Args: never; Returns: undefined }
      buy_ticket_atomic: {
        Args: { p_contest_id: string; p_user_id: string }
        Returns: Json
      }
      buy_ticket_public: {
        Args: { p_contest_id: string; p_user_id?: string }
        Returns: Json
      }
      buy_voucher_atomic: {
        Args: { p_user_id: string; p_voucher_id: string }
        Returns: Json
      }
      calculate_affiliate_commissions_for_month: {
        Args: { p_month: string }
        Returns: Json
      }
      calculate_influencer_commissions_current_month: {
        Args: never
        Returns: undefined
      }
      cancel_affiliate_payout_batch: {
        Args: { p_batch_id: string }
        Returns: Json
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
      create_affiliate_payout_batch: {
        Args: { p_commission_ids: string[] }
        Returns: Json
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
      create_partner_api_key: {
        Args: { p_partner_id: string }
        Returns: string
      }
      create_partner_invoices_for_last_week: { Args: never; Returns: undefined }
      create_partner_invoices_for_period: {
        Args: { p_period_from: string; p_period_to: string }
        Returns: undefined
      }
      create_partner_offer_invoices_for_period: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      create_partner_order_reward: {
        Args: {
          p_customer_email: string
          p_external_order_id: string
          p_metadata?: Json
          p_order_total_czk: number
          p_partner_id: string
        }
        Returns: Json
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
      delete_shoptet_pending_url: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      enqueue_partner_invoice_email:
        | { Args: { p_invoice_id: string }; Returns: undefined }
        | {
            Args: {
              p_partner_id: string
              p_period_from: string
              p_period_to: string
            }
            Returns: undefined
          }
      ensure_referral_code: { Args: { p_user_id: string }; Returns: string }
      ensure_wallet_exists: { Args: { p_user_id: string }; Returns: undefined }
      finalize_affiliate_bank_export: {
        Args: {
          p_batch_id: string
          p_sha256: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: Json
      }
      finalize_affiliate_payout_document: {
        Args: {
          p_accounting_email_body: string
          p_accounting_email_subject: string
          p_affiliate_email_body: string
          p_affiliate_email_subject: string
          p_commission_id: string
          p_document_number: string
          p_pdf_sha256: string
          p_pdf_storage_path: string
        }
        Returns: Json
      }
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
      get_admin_activation_summary: {
        Args: never
        Returns: {
          billing_mode: string
          display_name: string
          estimated_unbilled_czk: number
          hidden_count: number
          open_rate_pct: number
          opened_count: number
          partner_id: string
          partner_name: string
          price_per_activation: number
          total_activations: number
          unbilled_activations: number
        }[]
      }
      get_admin_online_users: {
        Args: { p_active_window_seconds?: number }
        Returns: Json
      }
      get_admin_subadmins_overview: {
        Args: never
        Returns: {
          created_at: string
          email: string
          email_confirmed_at: string
          full_name: string
          last_seen_at: string
          last_sign_in_at: string
          latest_invite_sent_at: string
          latest_invite_status: string
          profile_email: string
          role: string
          user_id: string
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
      get_admin_top_bar_stats: { Args: never; Returns: Json }
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
      get_bob_enabled: { Args: never; Returns: boolean }
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
          bonus_count: number
          total_miocoin_bonus: number
        }[]
      }
      get_contest_management_data: {
        Args: { p_contest_id_filter?: string }
        Returns: {
          contest_id: string
          created_at: string
          description: string
          fast_game: boolean
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
      get_contest_progress_admin: {
        Args: { p_contest_ids?: string[] | null }
        Returns: {
          contest_id: string
          sold_percent: number | null
          tickets_remaining: number | null
          tickets_sold: number | null
          tickets_total: number | null
        }[]
      }
      get_contests_json: { Args: never; Returns: Json }
      get_current_user_role: { Args: never; Returns: string }
      get_due_offer_reminder_rows: {
        Args: never
        Returns: {
          last_reminder_at: string
          obtained_at: string
          offer_id: string
          offer_short_text: string
          offer_title: string
          partner_display_name: string
          upo_id: string
          user_email: string
          user_id: string
          valid_to: string
        }[]
      }
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
      get_latest_winners_public: {
        Args: { winners_limit?: number }
        Returns: {
          contest_title: string
          created_at: string
          prize_image_url: string
          prize_name: string
          public_id: string
          type: string
          user_avatar_url: string
          user_name: string
          user_nickname: string
        }[]
      }
      get_my_tickets_public: {
        Args: { p_contest_id?: string | null }
        Returns: {
          contest_id: string
          contest_title: string
          created_at: string
          id: string
        }[]
      }
      get_partner_offer_billing_config: {
        Args: { p_partner_id: string }
        Returns: {
          billing_mode: string
          id: string
          notes: string
          partner_id: string
          price_per_activation: number
          updated_at: string
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
      get_public_available_vouchers: {
        Args: never
        Returns: {
          available_code_count: number
          banner_url: string
          end_date: string
          how_to_use_text: string
          id: string
          image_url: string
          is_public: boolean
          max_quantity: number
          name: string
          redeemed_count: number
          short_description: string
          start_date: string
          terms_text: string
          usage_description: string
          user_id: string
        }[]
      }
      get_shoptet_export_url: {
        Args: { p_partner_id: string }
        Returns: string
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      handle_influencer_signup: {
        Args: { p_influencer_partner_id: string; p_user_id: string }
        Returns: undefined
      }
      has_admin_permission: {
        Args: { check_key: string; check_user_id?: string }
        Returns: boolean
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
      is_superadmin: { Args: { check_user_id?: string }; Returns: boolean }
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
      mark_affiliate_payout_batch_paid: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      mark_user_played: {
        Args: { p_played_at?: string; p_user_id: string }
        Returns: undefined
      }
      mark_wins_as_seen: { Args: never; Returns: undefined }
      next_affiliate_payout_document_number: { Args: never; Returns: string }
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
      partner_invoice_post_create: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      pause_contest: { Args: { contest_id: string }; Returns: undefined }
      prepare_affiliate_bank_export: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      prepare_affiliate_payout_document: {
        Args: { p_commission_id: string }
        Returns: Json
      }
      process_event_queue_miocoin: { Args: never; Returns: undefined }
      process_push_retries: { Args: never; Returns: undefined }
      process_referral_inactivity: { Args: never; Returns: number }
      promote_shoptet_pending_url: {
        Args: { p_partner_id: string; p_request_id: string }
        Returns: string
      }
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
      record_affiliate_company_ref: {
        Args: { p_partner_id: string; p_via_code: string }
        Returns: Json
      }
      record_affiliate_company_ref_by_id: {
        Args: { p_affiliate_id: string; p_partner_id: string; p_source: string }
        Returns: Json
      }
      record_affiliate_customer_ref: {
        Args: { p_ref_code: string }
        Returns: Json
      }
      purchase_guaranteed_benefit_bundle_public: {
        Args: {
          p_contest_id: string
          p_idempotency_key: string
          p_user_id: string
        }
        Returns: Json
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
      redeem_miocoin_code: { Args: { p_code: string }; Returns: Json }
      referral_user_is_valid: { Args: { p_user_id: string }; Returns: boolean }
      register_affiliate_account:
        | {
            Args: {
              p_email: string
              p_modes: string[]
              p_name: string
              p_phone: string
              p_ref_code: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_audience_size: string
              p_content_categories: string
              p_email: string
              p_facebook_url: string
              p_instagram_url: string
              p_modes: string[]
              p_name: string
              p_phone: string
              p_ref_code: string
              p_tiktok_url: string
              p_website_url: string
              p_youtube_url: string
            }
            Returns: Json
          }
      request_partner_invoice_pdf: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      resolve_partner_by_api_key: { Args: { p_key: string }; Returns: string }
      resume_contest: { Args: { contest_id: string }; Returns: undefined }
      revise_partner_offer: { Args: { p_offer_id: string }; Returns: undefined }
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
      run_shoptet_cron_imports: { Args: never; Returns: Json }
      safe_send_message: {
        Args: { p_content: string; p_sender: string; p_user_id: string }
        Returns: undefined
      }
      sales_lead_check_duplicate: {
        Args: { p_contact_email: string; p_exclude_lead_id?: string }
        Returns: Json
      }
      sales_lead_create: {
        Args: {
          p_address?: string
          p_city?: string
          p_company_name: string
          p_company_size?: string
          p_contact_email?: string
          p_contact_person?: string
          p_contact_phone?: string
          p_contact_role?: string
          p_dic?: string
          p_duplicate_override?: boolean
          p_duplicate_override_reason?: string
          p_email_source?: string
          p_ico?: string
          p_industry?: string
          p_notes?: string
          p_website?: string
        }
        Returns: Json
      }
      sales_lead_delete: { Args: { p_lead_id: string }; Returns: Json }
      sales_lead_delete_bulk: { Args: { p_lead_ids: string[] }; Returns: Json }
      sales_lead_duplicate_matches: {
        Args: { p_contact_email: string; p_exclude_lead_id?: string }
        Returns: Json
      }
      sales_lead_email_send_guard: {
        Args: { p_lead_id: string }
        Returns: Json
      }
      sales_lead_log_activity: {
        Args: {
          p_happened_at: string
          p_kind: string
          p_lead_id: string
          p_next_step?: string
          p_note?: string
          p_result: string
        }
        Returns: Json
      }
      sales_lead_mark_emailed: {
        Args: { p_lead_id: string; p_performed_by: string }
        Returns: Json
      }
      sales_lead_mark_replied: {
        Args: { p_lead_id: string; p_performed_by?: string }
        Returns: Json
      }
      sales_lead_mark_replies_read: {
        Args: { p_lead_id: string }
        Returns: Json
      }
      sales_lead_overview: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      sales_lead_propose: {
        Args: {
          p_city?: string
          p_company_name: string
          p_created_by: string
          p_discovery_meta?: Json
          p_discovery_source: string
          p_ico?: string
          p_industry?: string
          p_lead_group: string
          p_lead_quality?: number
          p_website?: string
        }
        Returns: Json
      }
      sales_lead_propose_contact: {
        Args: {
          p_created_by: string
          p_email: string
          p_lead_id: string
          p_proposed_by?: string
          p_source_url: string
        }
        Returns: Json
      }
      sales_lead_propose_with_contact: {
        Args: {
          p_city?: string
          p_company_name: string
          p_created_by: string
          p_discovery_meta?: Json
          p_discovery_source: string
          p_email: string
          p_email_source_url: string
          p_ico?: string
          p_industry?: string
          p_lead_group: string
          p_lead_quality?: number
          p_proposed_by?: string
          p_website?: string
        }
        Returns: Json
      }
      sales_lead_record_duplicate_overrides: {
        Args: {
          p_caller: string
          p_lead_id: string
          p_matches: Json
          p_reason: string
        }
        Returns: undefined
      }
      sales_lead_review_contact: {
        Args: { p_decision: string; p_lead_id: string }
        Returns: Json
      }
      sales_lead_save_draft: {
        Args: { p_body: string; p_lead_id: string; p_subject: string }
        Returns: Json
      }
      sales_lead_scheduled_activity_set_status: {
        Args: { p_activity_id: string; p_status: string }
        Returns: Json
      }
      sales_lead_scheduled_activity_update: {
        Args: {
          p_activity_id: string
          p_next_step?: string
          p_note?: string
          p_result: string
          p_scheduled_for: string
        }
        Returns: Json
      }
      sales_lead_set_status: {
        Args: { p_lead_id: string; p_new_status: string; p_reason?: string }
        Returns: Json
      }
      sales_lead_task_create: {
        Args: {
          p_assigned_admin_id: string
          p_due_at: string
          p_lead_id: string
          p_note?: string
          p_title: string
        }
        Returns: Json
      }
      sales_lead_task_set_status: {
        Args: { p_status: string; p_task_id: string }
        Returns: Json
      }
      sales_lead_update_discovery: {
        Args: {
          p_discovery_source?: string
          p_lead_group: string
          p_lead_id: string
          p_lead_quality?: number
        }
        Returns: Json
      }
      sales_lead_update_fields: {
        Args: {
          p_address?: string
          p_city?: string
          p_company_name: string
          p_company_size?: string
          p_contact_email?: string
          p_contact_person?: string
          p_contact_phone?: string
          p_contact_role?: string
          p_dic?: string
          p_duplicate_override?: boolean
          p_duplicate_override_reason?: string
          p_email_source?: string
          p_email_verified_by_admin?: boolean
          p_ico?: string
          p_industry?: string
          p_lead_id: string
          p_notes?: string
          p_website?: string
        }
        Returns: Json
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
      set_shoptet_export_secret: {
        Args: { p_partner_id: string; p_url: string }
        Returns: string
      }
      set_user_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      setup_crud_test_data: { Args: { p_user_email?: string }; Returns: Json }
      store_shoptet_pending_url: {
        Args: { p_request_id: string; p_url: string }
        Returns: string
      }
      sync_partner_offer_activations: { Args: never; Returns: Json }
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
        | { Args: { p_user_id: string }; Returns: undefined }
        | {
            Args: { p_amount: number; p_reason?: string; p_user_id: string }
            Returns: undefined
          }
        | { Args: { p_amount_mc: number; p_user_id: string }; Returns: boolean }
      unlock_ticket: {
        Args: { contest_id: string; user_id: string }
        Returns: Json
      }
      update_affiliate_own_profile: {
        Args: {
          p_audience_size?: string
          p_billing_city: string
          p_billing_country: string
          p_billing_street: string
          p_billing_zip: string
          p_content_categories?: string
          p_email: string
          p_facebook_url?: string
          p_ico: string
          p_instagram_url?: string
          p_is_vat_payer: boolean
          p_name: string
          p_payout_account: string
          p_payout_bank: string
          p_phone: string
          p_tiktok_url?: string
          p_vat_id: string
          p_website_url: string
          p_youtube_url?: string
        }
        Returns: Json
      }
      update_affiliate_payout_batch_meta: {
        Args: {
          p_batch_id: string
          p_due_date: string
          p_payer_account: string
          p_payer_bank_code: string
        }
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
      update_partner_order_reward_status: {
        Args: {
          p_external_order_id: string
          p_order_status: string
          p_partner_id: string
        }
        Returns: Json
      }
      upsert_partner_offer_billing_config: {
        Args: {
          p_billing_mode: string
          p_notes: string
          p_partner_id: string
          p_price_per_activation: number
        }
        Returns: undefined
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
      user_completed_first_topup: {
        Args: { p_user_id: string }
        Returns: boolean
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
      verify_shoptet_cron_token: { Args: { p_token: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "superadmin" | "user"
      partner_code_status:
        | "issued"
        | "activated"
        | "cancelled"
        | "expired"
        | "pending"
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
      partner_code_status: [
        "issued",
        "activated",
        "cancelled",
        "expired",
        "pending",
      ],
      partner_invoice_status: ["draft", "issued", "paid", "void"],
      partner_status: ["pending", "approved", "suspended", "rejected"],
    },
  },
} as const
