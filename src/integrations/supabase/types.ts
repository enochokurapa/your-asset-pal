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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      approval_requests: {
        Row: {
          approver_id: string | null
          asset_id: string | null
          created_at: string
          decided_at: string | null
          id: string
          kind: string
          last_reminded_at: string | null
          payload: Json
          reason: string | null
          requested_by: string
          status: string
        }
        Insert: {
          approver_id?: string | null
          asset_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          kind: string
          last_reminded_at?: string | null
          payload?: Json
          reason?: string | null
          requested_by: string
          status?: string
        }
        Update: {
          approver_id?: string | null
          asset_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          last_reminded_at?: string | null
          payload?: Json
          reason?: string | null
          requested_by?: string
          status?: string
        }
        Relationships: []
      }
      asset_assignments: {
        Row: {
          asset_id: string
          assigned_to_name: string | null
          assigned_to_user: string | null
          assignment_date: string
          branch_id: string | null
          created_at: string
          created_by: string | null
          department: string | null
          id: string
          notes: string | null
          return_date: string | null
        }
        Insert: {
          asset_id: string
          assigned_to_name?: string | null
          assigned_to_user?: string | null
          assignment_date?: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          notes?: string | null
          return_date?: string | null
        }
        Update: {
          asset_id?: string
          assigned_to_name?: string | null
          assigned_to_user?: string | null
          assignment_date?: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          notes?: string | null
          return_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_attachments: {
        Row: {
          asset_id: string
          created_at: string
          file_name: string
          id: string
          kind: string
          mime_type: string | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          file_name: string
          id?: string
          kind: string
          mime_type?: string | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          file_name?: string
          id?: string
          kind?: string
          mime_type?: string | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_attachments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_disposals: {
        Row: {
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          asset_id: string
          created_at: string
          disposal_date: string
          disposal_reason: string
          disposal_value: number | null
          id: string
          recorded_by: string | null
          retirement_reason: string | null
          status: string
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          asset_id: string
          created_at?: string
          disposal_date?: string
          disposal_reason: string
          disposal_value?: number | null
          id?: string
          recorded_by?: string | null
          retirement_reason?: string | null
          status?: string
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          asset_id?: string
          created_at?: string
          disposal_date?: string
          disposal_reason?: string
          disposal_value?: number | null
          id?: string
          recorded_by?: string | null
          retirement_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_disposals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_imports: {
        Row: {
          created_at: string
          error_rows: number
          errors: Json | null
          file_name: string
          id: string
          imported_by: string | null
          success_rows: number
          total_rows: number
        }
        Insert: {
          created_at?: string
          error_rows?: number
          errors?: Json | null
          file_name: string
          id?: string
          imported_by?: string | null
          success_rows?: number
          total_rows?: number
        }
        Update: {
          created_at?: string
          error_rows?: number
          errors?: Json | null
          file_name?: string
          id?: string
          imported_by?: string | null
          success_rows?: number
          total_rows?: number
        }
        Relationships: []
      }
      asset_movements: {
        Row: {
          asset_id: string
          created_at: string
          from_branch_id: string | null
          from_location_id: string | null
          from_user: string | null
          id: string
          moved_at: string
          moved_by: string | null
          reason: string | null
          to_branch_id: string | null
          to_location_id: string | null
          to_user: string | null
          transfer_type: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          from_branch_id?: string | null
          from_location_id?: string | null
          from_user?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          reason?: string | null
          to_branch_id?: string | null
          to_location_id?: string | null
          to_user?: string | null
          transfer_type?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          from_branch_id?: string | null
          from_location_id?: string | null
          from_user?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          reason?: string | null
          to_branch_id?: string | null
          to_location_id?: string | null
          to_user?: string | null
          transfer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_movements_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_movements_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_movements_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_movements_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_movements_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          accumulated_depreciation: number
          asset_tag: string
          assigned_to: string | null
          branch_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          depreciation_frequency:
            | Database["public"]["Enums"]["depreciation_frequency"]
            | null
          depreciation_method:
            | Database["public"]["Enums"]["depreciation_method"]
            | null
          depreciation_start_date: string | null
          description: string | null
          id: string
          impairment_amount: number
          last_depreciation_date: string | null
          location_id: string | null
          name: string
          previous_status: Database["public"]["Enums"]["asset_status"] | null
          purchase_date: string | null
          purchase_value: number | null
          residual_value: number | null
          serial_number: string | null
          set_for_disposal: boolean
          status: Database["public"]["Enums"]["asset_status"]
          total_units: number | null
          units_consumed: number | null
          updated_at: string
          useful_life_months: number | null
        }
        Insert: {
          accumulated_depreciation?: number
          asset_tag: string
          assigned_to?: string | null
          branch_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          depreciation_frequency?:
            | Database["public"]["Enums"]["depreciation_frequency"]
            | null
          depreciation_method?:
            | Database["public"]["Enums"]["depreciation_method"]
            | null
          depreciation_start_date?: string | null
          description?: string | null
          id?: string
          impairment_amount?: number
          last_depreciation_date?: string | null
          location_id?: string | null
          name: string
          previous_status?: Database["public"]["Enums"]["asset_status"] | null
          purchase_date?: string | null
          purchase_value?: number | null
          residual_value?: number | null
          serial_number?: string | null
          set_for_disposal?: boolean
          status?: Database["public"]["Enums"]["asset_status"]
          total_units?: number | null
          units_consumed?: number | null
          updated_at?: string
          useful_life_months?: number | null
        }
        Update: {
          accumulated_depreciation?: number
          asset_tag?: string
          assigned_to?: string | null
          branch_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          depreciation_frequency?:
            | Database["public"]["Enums"]["depreciation_frequency"]
            | null
          depreciation_method?:
            | Database["public"]["Enums"]["depreciation_method"]
            | null
          depreciation_start_date?: string | null
          description?: string | null
          id?: string
          impairment_amount?: number
          last_depreciation_date?: string | null
          location_id?: string | null
          name?: string
          previous_status?: Database["public"]["Enums"]["asset_status"] | null
          purchase_date?: string | null
          purchase_value?: number | null
          residual_value?: number | null
          serial_number?: string | null
          set_for_disposal?: boolean
          status?: Database["public"]["Enums"]["asset_status"]
          total_units?: number | null
          units_consumed?: number | null
          updated_at?: string
          useful_life_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_depreciation_defaults: {
        Row: {
          category_id: string
          created_at: string
          frequency: Database["public"]["Enums"]["depreciation_frequency"]
          id: string
          method: Database["public"]["Enums"]["depreciation_method"]
          residual_percent: number
          updated_at: string
          useful_life_months: number
        }
        Insert: {
          category_id: string
          created_at?: string
          frequency?: Database["public"]["Enums"]["depreciation_frequency"]
          id?: string
          method: Database["public"]["Enums"]["depreciation_method"]
          residual_percent?: number
          updated_at?: string
          useful_life_months: number
        }
        Update: {
          category_id?: string
          created_at?: string
          frequency?: Database["public"]["Enums"]["depreciation_frequency"]
          id?: string
          method?: Database["public"]["Enums"]["depreciation_method"]
          residual_percent?: number
          updated_at?: string
          useful_life_months?: number
        }
        Relationships: []
      }
      depreciation_entries: {
        Row: {
          accumulated_after: number
          asset_id: string
          closing_value: number
          created_at: string
          depreciation_amount: number
          id: string
          method: Database["public"]["Enums"]["depreciation_method"]
          notes: string | null
          opening_value: number
          period_end: string
          period_start: string
          run_id: string | null
        }
        Insert: {
          accumulated_after: number
          asset_id: string
          closing_value: number
          created_at?: string
          depreciation_amount: number
          id?: string
          method: Database["public"]["Enums"]["depreciation_method"]
          notes?: string | null
          opening_value: number
          period_end: string
          period_start: string
          run_id?: string | null
        }
        Update: {
          accumulated_after?: number
          asset_id?: string
          closing_value?: number
          created_at?: string
          depreciation_amount?: number
          id?: string
          method?: Database["public"]["Enums"]["depreciation_method"]
          notes?: string | null
          opening_value?: number
          period_end?: string
          period_start?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_entries_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "depreciation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      depreciation_overrides: {
        Row: {
          amount: number
          asset_id: string
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          reason: string | null
          type: string
        }
        Insert: {
          amount: number
          asset_id: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          reason?: string | null
          type: string
        }
        Update: {
          amount?: number
          asset_id?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          reason?: string | null
          type?: string
        }
        Relationships: []
      }
      depreciation_runs: {
        Row: {
          asset_count: number
          created_at: string
          id: string
          notes: string | null
          period_end: string
          period_start: string
          run_type: string
          status: string
          total_amount: number
          triggered_by: string | null
        }
        Insert: {
          asset_count?: number
          created_at?: string
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          run_type?: string
          status?: string
          total_amount?: number
          triggered_by?: string | null
        }
        Update: {
          asset_count?: number
          created_at?: string
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          run_type?: string
          status?: string
          total_amount?: number
          triggered_by?: string | null
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          base_font_size: number
          created_at: string
          font_family: string
          footer_show: boolean
          footer_text: string
          header_show: boolean
          header_text: string
          id: string
          is_active: boolean
          logo_data_url: string | null
          logo_max_height: number
          logo_position: string
          margin_bottom: number
          margin_left: number
          margin_right: number
          margin_top: number
          name: string
          organization_name: string
          orientation: string
          paper_size: string
          primary_color: string
          show_generated_at: boolean
          show_page_numbers: boolean
          updated_at: string
          updated_by: string | null
          watermark_image_data_url: string | null
          watermark_opacity: number
          watermark_position: string
          watermark_text: string
        }
        Insert: {
          base_font_size?: number
          created_at?: string
          font_family?: string
          footer_show?: boolean
          footer_text?: string
          header_show?: boolean
          header_text?: string
          id?: string
          is_active?: boolean
          logo_data_url?: string | null
          logo_max_height?: number
          logo_position?: string
          margin_bottom?: number
          margin_left?: number
          margin_right?: number
          margin_top?: number
          name?: string
          organization_name?: string
          orientation?: string
          paper_size?: string
          primary_color?: string
          show_generated_at?: boolean
          show_page_numbers?: boolean
          updated_at?: string
          updated_by?: string | null
          watermark_image_data_url?: string | null
          watermark_opacity?: number
          watermark_position?: string
          watermark_text?: string
        }
        Update: {
          base_font_size?: number
          created_at?: string
          font_family?: string
          footer_show?: boolean
          footer_text?: string
          header_show?: boolean
          header_text?: string
          id?: string
          is_active?: boolean
          logo_data_url?: string | null
          logo_max_height?: number
          logo_position?: string
          margin_bottom?: number
          margin_left?: number
          margin_right?: number
          margin_top?: number
          name?: string
          organization_name?: string
          orientation?: string
          paper_size?: string
          primary_color?: string
          show_generated_at?: boolean
          show_page_numbers?: boolean
          updated_at?: string
          updated_by?: string | null
          watermark_image_data_url?: string | null
          watermark_opacity?: number
          watermark_position?: string
          watermark_text?: string
        }
        Relationships: []
      }
      gate_passes: {
        Row: {
          approver_id: string | null
          asset_id: string
          attachment_url: string | null
          branch_id: string | null
          checked_out_at: string | null
          checked_out_by: string | null
          created_at: string
          decided_at: string | null
          decision_reason: string | null
          destination: string
          expected_return_date: string
          id: string
          pass_number: string | null
          previous_asset_status:
            | Database["public"]["Enums"]["asset_status"]
            | null
          reason: string
          requested_by: string
          return_condition: string | null
          return_notes: string | null
          returned_at: string | null
          returned_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approver_id?: string | null
          asset_id: string
          attachment_url?: string | null
          branch_id?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string
          decided_at?: string | null
          decision_reason?: string | null
          destination: string
          expected_return_date: string
          id?: string
          pass_number?: string | null
          previous_asset_status?:
            | Database["public"]["Enums"]["asset_status"]
            | null
          reason: string
          requested_by: string
          return_condition?: string | null
          return_notes?: string | null
          returned_at?: string | null
          returned_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approver_id?: string | null
          asset_id?: string
          attachment_url?: string | null
          branch_id?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          created_at?: string
          decided_at?: string | null
          decision_reason?: string | null
          destination?: string
          expected_return_date?: string
          id?: string
          pass_number?: string | null
          previous_asset_status?:
            | Database["public"]["Enums"]["asset_status"]
            | null
          reason?: string
          requested_by?: string
          return_condition?: string | null
          return_notes?: string | null
          returned_at?: string | null
          returned_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_passes_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_passes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_status: string
          beep: boolean
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          requires_action: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_status?: string
          beep?: boolean
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          requires_action?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_status?: string
          beep?: boolean
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          requires_action?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          must_change_password: boolean
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          must_change_password?: boolean
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          must_change_password?: boolean
        }
        Relationships: []
      }
      user_action_rights: {
        Row: {
          action_kind: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action_kind: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action_kind?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_approval_rights: {
        Row: {
          approval_kind: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          approval_kind: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          approval_kind?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_approval_rights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_branch_access: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notification_prefs: {
        Row: {
          approval_kind: string
          created_at: string
          email: boolean
          id: string
          in_app: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_kind: string
          created_at?: string
          email?: boolean
          id?: string
          in_app?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_kind?: string
          created_at?: string
          email?: boolean
          id?: string
          in_app?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_view: boolean
          created_at: string
          id: string
          module: string
          user_id: string
        }
        Insert: {
          can_view?: boolean
          created_at?: string
          id?: string
          module: string
          user_id: string
        }
        Update: {
          can_view?: boolean
          created_at?: string
          id?: string
          module?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_do: { Args: { _action: string; _user_id: string }; Returns: boolean }
      enqueue_approval_reminders: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_manager: { Args: { _user_id: string }; Returns: boolean }
      mark_for_disposal: {
        Args: { _asset_id: string; _on: boolean }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff" | "security"
      asset_status:
        | "in_use"
        | "in_storage"
        | "under_repair"
        | "retired"
        | "missing"
        | "disposed"
        | "checked_out"
      depreciation_frequency: "monthly" | "quarterly" | "annually"
      depreciation_method:
        | "straight_line"
        | "reducing_balance"
        | "units_of_production"
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
      app_role: ["admin", "manager", "staff", "security"],
      asset_status: [
        "in_use",
        "in_storage",
        "under_repair",
        "retired",
        "missing",
        "disposed",
        "checked_out",
      ],
      depreciation_frequency: ["monthly", "quarterly", "annually"],
      depreciation_method: [
        "straight_line",
        "reducing_balance",
        "units_of_production",
      ],
    },
  },
} as const
