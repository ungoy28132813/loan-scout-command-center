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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          published: boolean
          title: string
        }
        Insert: {
          body: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          published?: boolean
          title: string
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          published?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: number
          match_mode: string
          public_signup: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          match_mode?: string
          public_signup?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          match_mode?: string
          public_signup?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      application_outcomes: {
        Row: {
          application_id: string
          approved_amount: number | null
          approved_apr: number | null
          approved_term_months: number | null
          client_id: string
          created_at: string
          created_by: string | null
          denial_bureau: string | null
          denial_reason: string | null
          denial_score_model: string | null
          evidence_document_id: string | null
          outcome_date: string | null
          outcome_source: string
          reported_at: string
          source_note: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          application_id: string
          approved_amount?: number | null
          approved_apr?: number | null
          approved_term_months?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          denial_bureau?: string | null
          denial_reason?: string | null
          denial_score_model?: string | null
          evidence_document_id?: string | null
          outcome_date?: string | null
          outcome_source?: string
          reported_at?: string
          source_note?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          application_id?: string
          approved_amount?: number | null
          approved_apr?: number | null
          approved_term_months?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          denial_bureau?: string | null
          denial_reason?: string | null
          denial_score_model?: string | null
          evidence_document_id?: string | null
          outcome_date?: string | null
          outcome_source?: string
          reported_at?: string
          source_note?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_outcomes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_outcomes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_outcomes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_outcomes_evidence_document_id_fkey"
            columns: ["evidence_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_outcomes_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          client_id: string
          created_at: string
          goal_id: string | null
          id: string
          lender_label: string
          match_result_id: string | null
          product_id: string | null
          status: string
          status_date: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          goal_id?: string | null
          id?: string
          lender_label: string
          match_result_id?: string | null
          product_id?: string | null
          status?: string
          status_date?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          goal_id?: string | null
          id?: string
          lender_label?: string
          match_result_id?: string | null
          product_id?: string | null
          status?: string
          status_date?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "funding_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_match_result_id_fkey"
            columns: ["match_result_id"]
            isOneToOne: false
            referencedRelation: "match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lender_products"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          client_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          metadata?: Json
        }
        Relationships: []
      }
      bureau_pull_observations: {
        Row: {
          application_id: string | null
          bureaus: string[]
          client_id: string | null
          confidence: string
          created_at: string
          created_by: string
          id: string
          location_state: string | null
          note: string | null
          observed_on: string
          product_id: string
          provenance: string
          pull_type: string
          source_url: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          application_id?: string | null
          bureaus?: string[]
          client_id?: string | null
          confidence?: string
          created_at?: string
          created_by?: string
          id?: string
          location_state?: string | null
          note?: string | null
          observed_on: string
          product_id: string
          provenance: string
          pull_type?: string
          source_url?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          application_id?: string | null
          bureaus?: string[]
          client_id?: string | null
          confidence?: string
          created_at?: string
          created_by?: string
          id?: string
          location_state?: string | null
          note?: string | null
          observed_on?: string
          product_id?: string
          provenance?: string
          pull_type?: string
          source_url?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bureau_pull_observations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bureau_pull_observations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bureau_pull_observations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lender_products"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          annual_revenue: number | null
          average_monthly_deposits: number | null
          banking_history_months: number | null
          business_credit_model: string | null
          business_credit_score: number | null
          business_credit_source_url: string | null
          business_credit_verified_on: string | null
          client_id: string
          created_at: string
          existing_monthly_debt_payments: number | null
          financial_source: string
          formation_date: string | null
          id: string
          industry: string | null
          lifecycle_status: string
          location_state: string | null
          monthly_expenses: number | null
          monthly_net_cash_flow: number | null
          monthly_revenue: number | null
          months_in_business: number | null
          name: string
          owner_share_pct: number | null
          source_note: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          annual_revenue?: number | null
          average_monthly_deposits?: number | null
          banking_history_months?: number | null
          business_credit_model?: string | null
          business_credit_score?: number | null
          business_credit_source_url?: string | null
          business_credit_verified_on?: string | null
          client_id: string
          created_at?: string
          existing_monthly_debt_payments?: number | null
          financial_source?: string
          formation_date?: string | null
          id?: string
          industry?: string | null
          lifecycle_status?: string
          location_state?: string | null
          monthly_expenses?: number | null
          monthly_net_cash_flow?: number | null
          monthly_revenue?: number | null
          months_in_business?: number | null
          name: string
          owner_share_pct?: number | null
          source_note?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          annual_revenue?: number | null
          average_monthly_deposits?: number | null
          banking_history_months?: number | null
          business_credit_model?: string | null
          business_credit_score?: number | null
          business_credit_source_url?: string | null
          business_credit_verified_on?: string | null
          client_id?: string
          created_at?: string
          existing_monthly_debt_payments?: number | null
          financial_source?: string
          formation_date?: string | null
          id?: string
          industry?: string | null
          lifecycle_status?: string
          location_state?: string | null
          monthly_expenses?: number | null
          monthly_net_cash_flow?: number | null
          monthly_revenue?: number | null
          months_in_business?: number | null
          name?: string
          owner_share_pct?: number | null
          source_note?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_profiles_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_questionnaire_answers: {
        Row: {
          answered_by: string | null
          business_profile_id: string
          client_id: string
          financial_source: string
          id: string
          question_key: string
          status: string
          updated_at: string
          value_numeric: number | null
          value_text: string | null
          verified: boolean
        }
        Insert: {
          answered_by?: string | null
          business_profile_id: string
          client_id: string
          financial_source?: string
          id?: string
          question_key: string
          status?: string
          updated_at?: string
          value_numeric?: number | null
          value_text?: string | null
          verified?: boolean
        }
        Update: {
          answered_by?: string | null
          business_profile_id?: string
          client_id?: string
          financial_source?: string
          id?: string
          question_key?: string
          status?: string
          updated_at?: string
          value_numeric?: number | null
          value_text?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "business_questionnaire_answers_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_questionnaire_answers_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_questionnaire_answers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assignments: {
        Row: {
          active: boolean
          assigned_by: string | null
          client_id: string
          created_at: string
          employee_id: string
          id: string
          temporary_until: string | null
        }
        Insert: {
          active?: boolean
          assigned_by?: string | null
          client_id: string
          created_at?: string
          employee_id: string
          id?: string
          temporary_until?: string | null
        }
        Update: {
          active?: boolean
          assigned_by?: string | null
          client_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          temporary_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_extraction_submissions: {
        Row: {
          client_id: string
          created_at: string
          document_id: string
          id: string
          idempotency_key: string
          parser_version: string
          payload: Json
          report_id: string
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_by: string
        }
        Insert: {
          client_id: string
          created_at?: string
          document_id: string
          id?: string
          idempotency_key: string
          parser_version: string
          payload: Json
          report_id: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_by: string
        }
        Update: {
          client_id?: string
          created_at?: string
          document_id?: string
          id?: string
          idempotency_key?: string
          parser_version?: string
          payload?: Json
          report_id?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_extraction_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_extraction_submissions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_extraction_submissions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_extraction_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_extraction_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          email: string | null
          id: string
          is_demo: boolean
          stage: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          email?: string | null
          id?: string
          is_demo?: boolean
          stage?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          email?: string | null
          id?: string
          is_demo?: boolean
          stage?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          accepted_at: string
          client_id: string | null
          id: string
          kind: string
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          client_id?: string | null
          id?: string
          kind: string
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          client_id?: string | null
          id?: string
          kind?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_reports: {
        Row: {
          client_id: string
          created_at: string
          detected_provider: string | null
          document_id: string
          extracted_at: string | null
          extraction_method: string
          extraction_status: string
          extraction_summary: Json | null
          id: string
          report_date: string | null
          report_type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          detected_provider?: string | null
          document_id: string
          extracted_at?: string | null
          extraction_method?: string
          extraction_status?: string
          extraction_summary?: Json | null
          id?: string
          report_date?: string | null
          report_type?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          detected_provider?: string | null
          document_id?: string
          extracted_at?: string | null
          extraction_method?: string
          extraction_status?: string
          extraction_summary?: Json | null
          id?: string
          report_date?: string | null
          report_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reports_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          batch_id: string | null
          category: string
          client_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          batch_id?: string | null
          category: string
          client_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string
        }
        Update: {
          batch_id?: string | null
          category?: string
          client_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_permissions: {
        Row: {
          can_approve_publish: boolean
          can_edit_extractions: boolean
          can_export_pdf: boolean
          can_manage_readiness: boolean
          can_post_announcements: boolean
          can_propose_rules: boolean
          can_run_matching: boolean
          can_update_applications: boolean
          can_upload_docs: boolean
          custom_title: string | null
          staff_role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_approve_publish?: boolean
          can_edit_extractions?: boolean
          can_export_pdf?: boolean
          can_manage_readiness?: boolean
          can_post_announcements?: boolean
          can_propose_rules?: boolean
          can_run_matching?: boolean
          can_update_applications?: boolean
          can_upload_docs?: boolean
          custom_title?: string | null
          staff_role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_approve_publish?: boolean
          can_edit_extractions?: boolean
          can_export_pdf?: boolean
          can_manage_readiness?: boolean
          can_post_announcements?: boolean
          can_propose_rules?: boolean
          can_run_matching?: boolean
          can_update_applications?: boolean
          can_upload_docs?: boolean
          custom_title?: string | null
          staff_role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      field_corrections: {
        Row: {
          client_id: string
          corrected_by: string
          created_at: string
          field_id: string
          id: string
          new_value: number | null
          old_value: number | null
          reason: string
          source_ref: string | null
        }
        Insert: {
          client_id: string
          corrected_by?: string
          created_at?: string
          field_id: string
          id?: string
          new_value?: number | null
          old_value?: number | null
          reason: string
          source_ref?: string | null
        }
        Update: {
          client_id?: string
          corrected_by?: string
          created_at?: string
          field_id?: string
          id?: string
          new_value?: number | null
          old_value?: number | null
          reason?: string
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_corrections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_corrections_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "report_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_goals: {
        Row: {
          business_profile_id: string | null
          client_id: string
          created_at: string
          goal_type: string
          id: string
          target_amount: number | null
          title: string
        }
        Insert: {
          business_profile_id?: string | null
          client_id: string
          created_at?: string
          goal_type?: string
          id?: string
          target_amount?: number | null
          title: string
        }
        Update: {
          business_profile_id?: string | null
          client_id?: string
          created_at?: string
          goal_type?: string
          id?: string
          target_amount?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_goals_business_profile_id_fkey"
            columns: ["business_profile_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_strategy_scenarios: {
        Row: {
          affordability_notes: string
          approved_at: string | null
          approved_by: string | null
          assumptions: string
          client_id: string
          created_at: string
          created_by: string
          goal_id: string
          id: string
          items: Json
          name: string
          sequencing_notes: string
          status: string
          updated_at: string
        }
        Insert: {
          affordability_notes?: string
          approved_at?: string | null
          approved_by?: string | null
          assumptions?: string
          client_id: string
          created_at?: string
          created_by?: string
          goal_id: string
          id?: string
          items?: Json
          name: string
          sequencing_notes?: string
          status?: string
          updated_at?: string
        }
        Update: {
          affordability_notes?: string
          approved_at?: string | null
          approved_by?: string | null
          assumptions?: string
          client_id?: string
          created_at?: string
          created_by?: string
          goal_id?: string
          id?: string
          items?: Json
          name?: string
          sequencing_notes?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_strategy_scenarios_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_strategy_scenarios_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "funding_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_questionnaire_answers: {
        Row: {
          answered_by: string | null
          client_id: string
          financial_source: string
          goal_id: string
          id: string
          question_key: string
          status: string
          updated_at: string
          value_numeric: number | null
          value_text: string | null
          verified: boolean
        }
        Insert: {
          answered_by?: string | null
          client_id: string
          financial_source?: string
          goal_id: string
          id?: string
          question_key: string
          status?: string
          updated_at?: string
          value_numeric?: number | null
          value_text?: string | null
          verified?: boolean
        }
        Update: {
          answered_by?: string | null
          client_id?: string
          financial_source?: string
          goal_id?: string
          id?: string
          question_key?: string
          status?: string
          updated_at?: string
          value_numeric?: number | null
          value_text?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "goal_questionnaire_answers_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_questionnaire_answers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_questionnaire_answers_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "funding_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          author: string
          body: string
          client_id: string
          created_at: string
          id: string
        }
        Insert: {
          author?: string
          body: string
          client_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author?: string
          body?: string
          client_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_products: {
        Row: {
          amount_kind: string
          application_checklist: Json
          application_guidance_source_url: string | null
          application_guidance_verified_on: string | null
          application_pull_risk: string | null
          application_url: string | null
          application_url_source_url: string | null
          application_url_verified_on: string | null
          apr_as_of: string | null
          apr_source_url: string | null
          channel_scope: string | null
          created_at: string
          id: string
          lender_id: string
          name: string
          official_url: string | null
          product_note: string | null
          product_type: string
          published_apr_max: number | null
          published_apr_min: number | null
          published_max_amount: number | null
          published_min_amount: number | null
          published_term_max_months: number | null
          published_term_min_months: number | null
          pull_risk_source_url: string | null
          pull_risk_verified_on: string | null
          pull_type: string
          required_documents: Json
          research_status: string
          source_verified_on: string | null
          term_as_of: string | null
          term_source_url: string | null
        }
        Insert: {
          amount_kind?: string
          application_checklist?: Json
          application_guidance_source_url?: string | null
          application_guidance_verified_on?: string | null
          application_pull_risk?: string | null
          application_url?: string | null
          application_url_source_url?: string | null
          application_url_verified_on?: string | null
          apr_as_of?: string | null
          apr_source_url?: string | null
          channel_scope?: string | null
          created_at?: string
          id?: string
          lender_id: string
          name: string
          official_url?: string | null
          product_note?: string | null
          product_type?: string
          published_apr_max?: number | null
          published_apr_min?: number | null
          published_max_amount?: number | null
          published_min_amount?: number | null
          published_term_max_months?: number | null
          published_term_min_months?: number | null
          pull_risk_source_url?: string | null
          pull_risk_verified_on?: string | null
          pull_type?: string
          required_documents?: Json
          research_status?: string
          source_verified_on?: string | null
          term_as_of?: string | null
          term_source_url?: string | null
        }
        Update: {
          amount_kind?: string
          application_checklist?: Json
          application_guidance_source_url?: string | null
          application_guidance_verified_on?: string | null
          application_pull_risk?: string | null
          application_url?: string | null
          application_url_source_url?: string | null
          application_url_verified_on?: string | null
          apr_as_of?: string | null
          apr_source_url?: string | null
          channel_scope?: string | null
          created_at?: string
          id?: string
          lender_id?: string
          name?: string
          official_url?: string | null
          product_note?: string | null
          product_type?: string
          published_apr_max?: number | null
          published_apr_min?: number | null
          published_max_amount?: number | null
          published_min_amount?: number | null
          published_term_max_months?: number | null
          published_term_min_months?: number | null
          pull_risk_source_url?: string | null
          pull_risk_verified_on?: string | null
          pull_type?: string
          required_documents?: Json
          research_status?: string
          source_verified_on?: string | null
          term_as_of?: string | null
          term_source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_products_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_rules: {
        Row: {
          application_mode: string
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          bureau: string | null
          created_at: string
          effective_date: string | null
          id: string
          input_key: string | null
          lookback_months: number | null
          product_id: string
          proposed_by: string | null
          requires_verified_facts: boolean
          rule_key: string
          score_model: string | null
          source_tier: string
          source_title: string
          source_url: string
          stale_after_days: number
          supersedes: string | null
          text_threshold: string | null
          threshold: number
          verified_on: string
          version: number
        }
        Insert: {
          application_mode?: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          bureau?: string | null
          created_at?: string
          effective_date?: string | null
          id?: string
          input_key?: string | null
          lookback_months?: number | null
          product_id: string
          proposed_by?: string | null
          requires_verified_facts?: boolean
          rule_key: string
          score_model?: string | null
          source_tier: string
          source_title: string
          source_url: string
          stale_after_days?: number
          supersedes?: string | null
          text_threshold?: string | null
          threshold: number
          verified_on: string
          version?: number
        }
        Update: {
          application_mode?: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          bureau?: string | null
          created_at?: string
          effective_date?: string | null
          id?: string
          input_key?: string | null
          lookback_months?: number | null
          product_id?: string
          proposed_by?: string | null
          requires_verified_facts?: boolean
          rule_key?: string
          score_model?: string | null
          source_tier?: string
          source_title?: string
          source_url?: string
          stale_after_days?: number
          supersedes?: string | null
          text_threshold?: string | null
          threshold?: number
          verified_on?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lender_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lender_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_rules_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "lender_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      lenders: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          official_url: string | null
          research_status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          official_url?: string | null
          research_status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          official_url?: string | null
          research_status?: string
        }
        Relationships: []
      }
      local_ai_jobs: {
        Row: {
          created_at: string
          error_code: string | null
          expires_at: string
          finished_at: string | null
          id: string
          input: Json
          lease_id: string | null
          lease_until: string | null
          model: string
          owner_id: string
          product_id: string
          result: Json | null
          review_status: string
          reviewed_at: string | null
          status: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          expires_at?: string
          finished_at?: string | null
          id?: string
          input: Json
          lease_id?: string | null
          lease_until?: string | null
          model: string
          owner_id: string
          product_id: string
          result?: Json | null
          review_status?: string
          reviewed_at?: string | null
          status?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          expires_at?: string
          finished_at?: string | null
          id?: string
          input?: Json
          lease_id?: string | null
          lease_until?: string | null
          model?: string
          owner_id?: string
          product_id?: string
          result?: Json | null
          review_status?: string
          reviewed_at?: string | null
          status?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_ai_jobs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_ai_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lender_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_ai_jobs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "local_ai_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      local_ai_workers: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string
          last_seen_at: string | null
          model: string
          owner_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          last_seen_at?: string | null
          model: string
          owner_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          last_seen_at?: string | null
          model?: string
          owner_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_ai_workers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          client_id: string
          conditions: Json
          created_at: string
          id: string
          manual_added: boolean
          manual_reason: string | null
          private_note: string | null
          product_id: string
          rank: number | null
          review_status: string
          run_id: string
          status: string
          suitability_score: number | null
        }
        Insert: {
          client_id: string
          conditions?: Json
          created_at?: string
          id?: string
          manual_added?: boolean
          manual_reason?: string | null
          private_note?: string | null
          product_id: string
          rank?: number | null
          review_status?: string
          run_id: string
          status: string
          suitability_score?: number | null
        }
        Update: {
          client_id?: string
          conditions?: Json
          created_at?: string
          id?: string
          manual_added?: boolean
          manual_reason?: string | null
          private_note?: string | null
          product_id?: string
          rank?: number | null
          review_status?: string
          run_id?: string
          status?: string
          suitability_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_results_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lender_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "match_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      match_runs: {
        Row: {
          client_id: string
          created_at: string
          critical_warnings: Json
          engine_version: string
          goal_id: string | null
          id: string
          mode: string
          run_by: string
        }
        Insert: {
          client_id: string
          created_at?: string
          critical_warnings?: Json
          engine_version: string
          goal_id?: string | null
          id?: string
          mode: string
          run_by?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          critical_warnings?: Json
          engine_version?: string
          goal_id?: string | null
          id?: string
          mode?: string
          run_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_runs_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "funding_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_bootstrap_allowlist: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      product_research_sources: {
        Row: {
          channel_scope: string
          content_sha256: string | null
          created_at: string
          effective_date: string | null
          id: string
          product_id: string
          proposed_changes: Json
          retrieval_method: string
          retrieved_at: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_checked_on: string
          source_excerpt: string | null
          source_locator: string | null
          source_tier: string
          source_title: string
          source_url: string
          submitted_by: string
          version_label: string | null
        }
        Insert: {
          channel_scope: string
          content_sha256?: string | null
          created_at?: string
          effective_date?: string | null
          id?: string
          product_id: string
          proposed_changes?: Json
          retrieval_method?: string
          retrieved_at?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_checked_on: string
          source_excerpt?: string | null
          source_locator?: string | null
          source_tier?: string
          source_title: string
          source_url: string
          submitted_by: string
          version_label?: string | null
        }
        Update: {
          channel_scope?: string
          content_sha256?: string | null
          created_at?: string
          effective_date?: string | null
          id?: string
          product_id?: string
          proposed_changes?: Json
          retrieval_method?: string
          retrieved_at?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_checked_on?: string
          source_excerpt?: string | null
          source_locator?: string | null
          source_tier?: string
          source_title?: string
          source_url?: string
          submitted_by?: string
          version_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_research_sources_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lender_products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          department: string | null
          email: string
          full_name: string | null
          id: string
          theme: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          department?: string | null
          email: string
          full_name?: string | null
          id: string
          theme?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string | null
          id?: string
          theme?: string
        }
        Relationships: []
      }
      published_snapshots: {
        Row: {
          client_id: string
          content: Json
          created_at: string
          created_by: string
          id: string
          needs_rereview: boolean
          published_at: string | null
          published_by: string | null
          scheduled_for: string | null
          scope: string
          source_scenario_id: string | null
          status: string
          version: number
        }
        Insert: {
          client_id: string
          content: Json
          created_at?: string
          created_by?: string
          id?: string
          needs_rereview?: boolean
          published_at?: string | null
          published_by?: string | null
          scheduled_for?: string | null
          scope?: string
          source_scenario_id?: string | null
          status?: string
          version: number
        }
        Update: {
          client_id?: string
          content?: Json
          created_at?: string
          created_by?: string
          id?: string
          needs_rereview?: boolean
          published_at?: string | null
          published_by?: string | null
          scheduled_for?: string | null
          scope?: string
          source_scenario_id?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "published_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_snapshots_source_scenario_id_fkey"
            columns: ["source_scenario_id"]
            isOneToOne: false
            referencedRelation: "funding_strategy_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_answers: {
        Row: {
          answered_by: string | null
          client_id: string
          id: string
          question_key: string
          status: string
          updated_at: string
          value_numeric: number | null
          value_text: string | null
          verified: boolean
        }
        Insert: {
          answered_by?: string | null
          client_id: string
          id?: string
          question_key: string
          status?: string
          updated_at?: string
          value_numeric?: number | null
          value_text?: string | null
          verified?: boolean
        }
        Update: {
          answered_by?: string | null
          client_id?: string
          id?: string
          question_key?: string
          status?: string
          updated_at?: string
          value_numeric?: number | null
          value_text?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_answers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      readiness_tasks: {
        Row: {
          client_completed_at: string | null
          client_id: string
          client_note: string | null
          created_at: string
          created_by: string | null
          description: string | null
          evidence_document_id: string | null
          id: string
          position: number
          published: boolean
          status: string
          title: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          client_completed_at?: string | null
          client_id: string
          client_note?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          evidence_document_id?: string | null
          id?: string
          position?: number
          published?: boolean
          status?: string
          title: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          client_completed_at?: string | null
          client_id?: string
          client_note?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          evidence_document_id?: string | null
          id?: string
          position?: number
          published?: boolean
          status?: string
          title?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "readiness_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readiness_tasks_evidence_document_id_fkey"
            columns: ["evidence_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      report_fields: {
        Row: {
          bureau: string
          client_id: string
          confidence: string | null
          field_key: string
          id: string
          needs_review: boolean
          report_id: string
          score_date: string | null
          score_model: string | null
          source_page: number | null
          source_ref: string | null
          status: string
          updated_at: string
          value: number | null
        }
        Insert: {
          bureau: string
          client_id: string
          confidence?: string | null
          field_key: string
          id?: string
          needs_review?: boolean
          report_id: string
          score_date?: string | null
          score_model?: string | null
          source_page?: number | null
          source_ref?: string | null
          status?: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          bureau?: string
          client_id?: string
          confidence?: string | null
          field_key?: string
          id?: string
          needs_review?: boolean
          report_id?: string
          score_date?: string | null
          score_model?: string | null
          source_page?: number | null
          source_ref?: string | null
          status?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_fields_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_fields_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      shortlists: {
        Row: {
          created_at: string
          id: string
          name: string
          product_ids: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          product_ids?: string[]
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          product_ids?: string[]
          user_id?: string
        }
        Relationships: []
      }
      source_review_candidates: {
        Row: {
          application_mode: string
          bureau: string | null
          created_at: string
          criterion: string
          effective_date: string | null
          evidence_status: string
          id: string
          input_key: string | null
          lookback_months: number | null
          not_enforced_reason: string | null
          product_id: string
          representable: boolean
          requires_verified_facts: boolean
          resulting_rule_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          rule_key: string | null
          scope: string
          score_model: string | null
          seed_key: string
          source_excerpt: string | null
          source_locator: string | null
          source_title: string
          source_url: string
          stale_after_days: number
          text_threshold: string | null
          threshold: number | null
          verified_on: string
          version_label: string | null
        }
        Insert: {
          application_mode?: string
          bureau?: string | null
          created_at?: string
          criterion: string
          effective_date?: string | null
          evidence_status?: string
          id?: string
          input_key?: string | null
          lookback_months?: number | null
          not_enforced_reason?: string | null
          product_id: string
          representable?: boolean
          requires_verified_facts?: boolean
          resulting_rule_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_key?: string | null
          scope: string
          score_model?: string | null
          seed_key: string
          source_excerpt?: string | null
          source_locator?: string | null
          source_title: string
          source_url: string
          stale_after_days?: number
          text_threshold?: string | null
          threshold?: number | null
          verified_on: string
          version_label?: string | null
        }
        Update: {
          application_mode?: string
          bureau?: string | null
          created_at?: string
          criterion?: string
          effective_date?: string | null
          evidence_status?: string
          id?: string
          input_key?: string | null
          lookback_months?: number | null
          not_enforced_reason?: string | null
          product_id?: string
          representable?: boolean
          requires_verified_facts?: boolean
          resulting_rule_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_key?: string | null
          scope?: string
          score_model?: string | null
          seed_key?: string
          source_excerpt?: string | null
          source_locator?: string | null
          source_title?: string
          source_url?: string
          stale_after_days?: number
          text_threshold?: string | null
          threshold?: number | null
          verified_on?: string
          version_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_review_candidates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lender_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_review_candidates_resulting_rule_id_fkey"
            columns: ["resulting_rule_id"]
            isOneToOne: false
            referencedRelation: "lender_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      tradeline_corrections: {
        Row: {
          changed_fields: string[]
          client_id: string
          corrected_by: string
          created_at: string
          id: string
          reason: string
          source_ref: string | null
          tradeline_id: string
        }
        Insert: {
          changed_fields?: string[]
          client_id: string
          corrected_by: string
          created_at?: string
          id?: string
          reason: string
          source_ref?: string | null
          tradeline_id: string
        }
        Update: {
          changed_fields?: string[]
          client_id?: string
          corrected_by?: string
          created_at?: string
          id?: string
          reason?: string
          source_ref?: string | null
          tradeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tradeline_corrections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tradeline_corrections_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tradeline_corrections_tradeline_id_fkey"
            columns: ["tradeline_id"]
            isOneToOne: false
            referencedRelation: "tradelines"
            referencedColumns: ["id"]
          },
        ]
      }
      tradelines: {
        Row: {
          account_ref_last4: string | null
          account_type: string | null
          balance: number | null
          bureau: string
          client_id: string
          created_at: string
          credit_limit: number | null
          creditor: string
          extracted: boolean
          id: string
          is_chargeoff: boolean
          is_collection: boolean
          is_open: boolean | null
          late_count: number | null
          needs_review: boolean
          reconcile_key: string | null
          report_id: string
          source_page: number | null
        }
        Insert: {
          account_ref_last4?: string | null
          account_type?: string | null
          balance?: number | null
          bureau: string
          client_id: string
          created_at?: string
          credit_limit?: number | null
          creditor: string
          extracted?: boolean
          id?: string
          is_chargeoff?: boolean
          is_collection?: boolean
          is_open?: boolean | null
          late_count?: number | null
          needs_review?: boolean
          reconcile_key?: string | null
          report_id: string
          source_page?: number | null
        }
        Update: {
          account_ref_last4?: string | null
          account_type?: string | null
          balance?: number | null
          bureau?: string
          client_id?: string
          created_at?: string
          credit_limit?: number | null
          creditor?: string
          extracted?: boolean
          id?: string
          is_chargeoff?: boolean
          is_collection?: boolean
          is_open?: boolean | null
          late_count?: number | null
          needs_review?: boolean
          reconcile_key?: string | null
          report_id?: string
          source_page?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tradelines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tradelines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_client_extraction: {
        Args: { _submission_id: string }
        Returns: undefined
      }
      accept_staff_extraction: {
        Args: { _report_id: string }
        Returns: undefined
      }
      active_goal_question_definitions: {
        Args: never
        Returns: {
          input_key: string
          requires_verified_facts: boolean
          rule_key: string
        }[]
      }
      bootstrap_role_decision: {
        Args: { _confirmed: boolean; _email: string }
        Returns: string
      }
      can_access_client: {
        Args: { _cid: string; _uid: string }
        Returns: boolean
      }
      can_read_profile: {
        Args: { _profile: string; _viewer: string }
        Returns: boolean
      }
      client_mark_task:
        | { Args: { _note: string; _task: string }; Returns: undefined }
        | {
            Args: {
              _evidence_document_id: string
              _note: string
              _task: string
            }
            Returns: undefined
          }
      correct_tradeline: {
        Args: {
          _balance: number
          _credit_limit: number
          _is_chargeoff: boolean
          _is_collection: boolean
          _is_open: boolean
          _late_count: number
          _reason: string
          _source_page: number
          _source_ref: string
          _tradeline_id: string
        }
        Returns: undefined
      }
      create_strategy_snapshot_draft: {
        Args: { _scenario_id: string }
        Returns: string
      }
      deactivate_employee: {
        Args: { _employee_id: string; _transfer_to?: string }
        Returns: undefined
      }
      enqueue_local_ai_job: {
        Args: { _input: Json; _owner_id: string; _product_id: string }
        Returns: Json
      }
      grant_roles_on_confirm: {
        Args: { _email: string; _uid: string }
        Returns: undefined
      }
      has_client_consent: {
        Args: { _cid: string; _uid: string }
        Returns: boolean
      }
      has_perm: { Args: { _perm: string; _uid: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_client_extraction: {
        Args: { _submission_id: string }
        Returns: undefined
      }
      is_client_self: { Args: { _cid: string; _uid: string }; Returns: boolean }
      is_client_staff: {
        Args: { _cid: string; _uid: string }
        Returns: boolean
      }
      is_owner: { Args: { _uid: string }; Returns: boolean }
      is_staff: { Args: { _uid: string }; Returns: boolean }
      lender_intelligence_summary: {
        Args: { _min_sample?: number }
        Returns: {
          approved_pct: number
          equifax_pct: number
          experian_pct: number
          hard_pct: number
          product_id: string
          suppressed: boolean
          transunion_pct: number
          verified_outcomes: number
          verified_pull_observations: number
        }[]
      }
      local_ai_outcome_context: { Args: { _product_id: string }; Returns: Json }
      local_ai_worker_exchange: {
        Args: {
          _action: string
          _error_code?: string
          _job_id?: string
          _lease_id?: string
          _result?: Json
          _token: string
        }
        Returns: Json
      }
      log_event: {
        Args: {
          _action: string
          _client_id: string
          _entity: string
          _entity_id: string
          _meta?: Json
        }
        Returns: undefined
      }
      pair_local_ai_worker: {
        Args: { _label: string; _model: string }
        Returns: Json
      }
      prepare_strategy_export: { Args: { _snapshot_id: string }; Returns: Json }
      review_local_ai_job: {
        Args: { _decision: string; _id: string }
        Returns: undefined
      }
      review_product_research: {
        Args: { _decision: string; _id: string }
        Returns: undefined
      }
      review_source_candidate: {
        Args: { _decision: string; _id: string }
        Returns: string
      }
      revoke_local_ai_worker: { Args: { _id: string }; Returns: undefined }
      submit_client_extraction: {
        Args: { _idempotency_key: string; _payload: Json; _report_id: string }
        Returns: string
      }
      submit_product_research: { Args: { _payload: Json }; Returns: string }
      validate_client_extraction_payload: {
        Args: { _payload: Json }
        Returns: undefined
      }
      validate_client_extraction_required: {
        Args: { _payload: Json }
        Returns: undefined
      }
      verify_local_ai_token: { Args: { _token: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "employee" | "client"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["owner", "employee", "client"],
    },
  },
} as const
