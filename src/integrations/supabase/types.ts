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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          check_in_distance: number | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          date: string
          deduction_applied: boolean
          early_minutes: number
          id: string
          late_minutes: number
          location_status: string | null
          user_id: string
        }
        Insert: {
          check_in_distance?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          date?: string
          deduction_applied?: boolean
          early_minutes?: number
          id?: string
          late_minutes?: number
          location_status?: string | null
          user_id: string
        }
        Update: {
          check_in_distance?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          date?: string
          deduction_applied?: boolean
          early_minutes?: number
          id?: string
          late_minutes?: number
          location_status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bonus_transactions: {
        Row: {
          amount: number
          approved_date: string | null
          assignment_id: string | null
          auto_approved: boolean
          created_at: string
          deadline_date: string | null
          id: string
          month: string
          source: string
          task_id: string | null
          title: string
          unit_count: number
          user_id: string
        }
        Insert: {
          amount?: number
          approved_date?: string | null
          assignment_id?: string | null
          auto_approved?: boolean
          created_at?: string
          deadline_date?: string | null
          id?: string
          month: string
          source?: string
          task_id?: string | null
          title?: string
          unit_count?: number
          user_id: string
        }
        Update: {
          amount?: number
          approved_date?: string | null
          assignment_id?: string | null
          auto_approved?: boolean
          created_at?: string
          deadline_date?: string | null
          id?: string
          month?: string
          source?: string
          task_id?: string | null
          title?: string
          unit_count?: number
          user_id?: string
        }
        Relationships: []
      }
      calendar_event_assignments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auto_approved: boolean
          event_id: string
          id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          submission_status: string
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auto_approved?: boolean
          event_id: string
          id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          submission_status?: string
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auto_approved?: boolean
          event_id?: string
          id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          submission_status?: string
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          assigned_to_all: boolean
          created_at: string
          created_by: string
          description: string
          end_date: string
          event_type: string
          id: string
          start_date: string
          title: string
          visibility: string
        }
        Insert: {
          assigned_to_all?: boolean
          created_at?: string
          created_by: string
          description?: string
          end_date: string
          event_type?: string
          id?: string
          start_date: string
          title: string
          visibility?: string
        }
        Update: {
          assigned_to_all?: boolean
          created_at?: string
          created_by?: string
          description?: string
          end_date?: string
          event_type?: string
          id?: string
          start_date?: string
          title?: string
          visibility?: string
        }
        Relationships: []
      }
      carousel_settings: {
        Row: {
          animation_speed_seconds: number
          animation_style: string
          enabled: boolean
          id: boolean
          position: string
          updated_at: string
        }
        Insert: {
          animation_speed_seconds?: number
          animation_style?: string
          enabled?: boolean
          id?: boolean
          position?: string
          updated_at?: string
        }
        Update: {
          animation_speed_seconds?: number
          animation_style?: string
          enabled?: boolean
          id?: boolean
          position?: string
          updated_at?: string
        }
        Relationships: []
      }
      carousel_slides: {
        Row: {
          active: boolean
          created_at: string
          end_date: string | null
          id: string
          image_url: string
          link_enabled: boolean
          link_url: string | null
          sort_order: number
          start_date: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          image_url: string
          link_enabled?: boolean
          link_url?: string | null
          sort_order?: number
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          image_url?: string
          link_enabled?: boolean
          link_url?: string | null
          sort_order?: number
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fcm_tokens: {
        Row: {
          created_at: string
          id: string
          token: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          token: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          token?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      leave_balances: {
        Row: {
          balance: number
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          period_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          period_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      leave_manual_deductions: {
        Row: {
          created_at: string
          created_by: string
          days: number
          id: string
          reason: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          days: number
          id?: string
          reason?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          days?: number
          id?: string
          reason?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          balance_deducted: boolean
          created_at: string
          date: string
          end_time: string | null
          half_period: string | null
          id: string
          payment_type: string | null
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          start_time: string | null
          status: string
          type: string
          unpaid_salary_deducted: number
          user_id: string
        }
        Insert: {
          balance_deducted?: boolean
          created_at?: string
          date: string
          end_time?: string | null
          half_period?: string | null
          id?: string
          payment_type?: string | null
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_time?: string | null
          status?: string
          type?: string
          unpaid_salary_deducted?: number
          user_id: string
        }
        Update: {
          balance_deducted?: boolean
          created_at?: string
          date?: string
          end_time?: string | null
          half_period?: string | null
          id?: string
          payment_type?: string | null
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_time?: string | null
          status?: string
          type?: string
          unpaid_salary_deducted?: number
          user_id?: string
        }
        Relationships: []
      }
      lesson_plan_templates: {
        Row: {
          class: string
          format: string
          id: string
          template_json: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          class: string
          format?: string
          id?: string
          template_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          class?: string
          format?: string
          id?: string
          template_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_target: string | null
          action_type: string
          audience: string
          audience_user_ids: string[]
          banner_url: string | null
          body: string
          created_at: string
          created_by: string
          failed_count: number
          icon_key: string
          id: string
          last_error: string | null
          layout: string
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_target?: string | null
          action_type?: string
          audience?: string
          audience_user_ids?: string[]
          banner_url?: string | null
          body: string
          created_at?: string
          created_by: string
          failed_count?: number
          icon_key?: string
          id?: string
          last_error?: string | null
          layout?: string
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_target?: string | null
          action_type?: string
          audience?: string
          audience_user_ids?: string[]
          banner_url?: string | null
          body?: string
          created_at?: string
          created_by?: string
          failed_count?: number
          icon_key?: string
          id?: string
          last_error?: string | null
          layout?: string
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      overtime_requests: {
        Row: {
          amount: number
          created_at: string
          description: string
          end_at: string
          id: string
          minutes: number
          rate_per_minute: number
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          start_at: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string
          end_at: string
          id?: string
          minutes?: number
          rate_per_minute?: number
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_at: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          end_at?: string
          id?: string
          minutes?: number
          rate_per_minute?: number
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_at?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          base_salary: number
          check_in_time: string
          check_out_time: string
          class: string
          created_at: string
          deduction_rate_per_minute: number
          early_deduction_per_minute: number
          emergency_phone: string | null
          full_name: string
          id: string
          join_date: string | null
          late_deduction_per_minute: number
          overtime_rate_per_minute: number
          partial_leave_deduction_per_minute: number
          phone: string | null
          role: string
          sequence: number
          work_day: string
          work_schedule: Json
        }
        Insert: {
          avatar_url?: string | null
          base_salary?: number
          check_in_time?: string
          check_out_time?: string
          class?: string
          created_at?: string
          deduction_rate_per_minute?: number
          early_deduction_per_minute?: number
          emergency_phone?: string | null
          full_name?: string
          id: string
          join_date?: string | null
          late_deduction_per_minute?: number
          overtime_rate_per_minute?: number
          partial_leave_deduction_per_minute?: number
          phone?: string | null
          role?: string
          sequence?: number
          work_day?: string
          work_schedule?: Json
        }
        Update: {
          avatar_url?: string | null
          base_salary?: number
          check_in_time?: string
          check_out_time?: string
          class?: string
          created_at?: string
          deduction_rate_per_minute?: number
          early_deduction_per_minute?: number
          emergency_phone?: string | null
          full_name?: string
          id?: string
          join_date?: string | null
          late_deduction_per_minute?: number
          overtime_rate_per_minute?: number
          partial_leave_deduction_per_minute?: number
          phone?: string | null
          role?: string
          sequence?: number
          work_day?: string
          work_schedule?: Json
        }
        Relationships: []
      }
      salaries: {
        Row: {
          base_salary: number
          bonus: number
          current_salary: number
          deduction_reason: string
          id: string
          last_updated: string
          manual_deduction: number
          month: string
          total_deductions: number
          user_id: string
        }
        Insert: {
          base_salary?: number
          bonus?: number
          current_salary?: number
          deduction_reason?: string
          id?: string
          last_updated?: string
          manual_deduction?: number
          month: string
          total_deductions?: number
          user_id: string
        }
        Update: {
          base_salary?: number
          bonus?: number
          current_salary?: number
          deduction_reason?: string
          id?: string
          last_updated?: string
          manual_deduction?: number
          month?: string
          total_deductions?: number
          user_id?: string
        }
        Relationships: []
      }
      salary_manual_additions: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          kind: string
          month: string
          title: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          kind?: string
          month?: string
          title: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          month?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      salary_manual_deductions: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          month: string
          source: string
          title: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          month?: string
          source?: string
          title: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          month?: string
          source?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assigned_by: string
          assignee_id: string
          auto_approved: boolean
          completed: boolean
          created_at: string
          description: string
          due_date: string | null
          id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          submission_status: string
          submitted_at: string | null
          title: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_by: string
          assignee_id: string
          auto_approved?: boolean
          completed?: boolean
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          submission_status?: string
          submitted_at?: string | null
          title: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_by?: string
          assignee_id?: string
          auto_approved?: boolean
          completed?: boolean
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          submission_status?: string
          submitted_at?: string | null
          title?: string
        }
        Relationships: []
      }
      yearly_bonus_progress: {
        Row: {
          all_done_units: number
          assigned_units: number
          cycle_start_year: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_done_units?: number
          assigned_units?: number
          cycle_start_year: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_done_units?: number
          assigned_units?: number
          cycle_start_year?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _get_cron_secret: { Args: never; Returns: string }
      admin_list_profiles: {
        Args: never
        Returns: {
          avatar_url: string | null
          base_salary: number
          check_in_time: string
          check_out_time: string
          class: string
          created_at: string
          deduction_rate_per_minute: number
          early_deduction_per_minute: number
          emergency_phone: string | null
          full_name: string
          id: string
          join_date: string | null
          late_deduction_per_minute: number
          overtime_rate_per_minute: number
          partial_leave_deduction_per_minute: number
          phone: string | null
          role: string
          sequence: number
          work_day: string
          work_schedule: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      can_manage_branding: { Args: never; Returns: boolean }
      compute_bonus_per_unit: {
        Args: { p_month: string; p_user_id: string }
        Returns: number
      }
      current_user_role: { Args: never; Returns: string }
      dashboard_monthly_attendance: {
        Args: { p_month_end: string; p_month_start: string }
        Returns: {
          days_present: number
          late_cases: number
          total_early_minutes: number
          total_late_minutes: number
          user_id: string
        }[]
      }
      get_leave_balance: { Args: { p_user_id: string }; Returns: number }
      get_profile_full: {
        Args: { p_id: string }
        Returns: {
          avatar_url: string | null
          base_salary: number
          check_in_time: string
          check_out_time: string
          class: string
          created_at: string
          deduction_rate_per_minute: number
          early_deduction_per_minute: number
          emergency_phone: string | null
          full_name: string
          id: string
          join_date: string | null
          late_deduction_per_minute: number
          overtime_rate_per_minute: number
          partial_leave_deduction_per_minute: number
          phone: string | null
          role: string
          sequence: number
          work_day: string
          work_schedule: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_task_status_monitor: {
        Args: { p_month_start: string }
        Returns: {
          all_done: number
          approved: number
          full_name: string
          in_progress: number
          new_task: number
          overdue: number
          reject: number
          sequence: number
          submitted: number
          user_id: string
        }[]
      }
      get_user_rates: {
        Args: { p_user_id: string }
        Returns: {
          deduction_rate_per_minute: number
          early_deduction_per_minute: number
          late_deduction_per_minute: number
          overtime_rate_per_minute: number
          partial_leave_deduction_per_minute: number
        }[]
      }
      is_admin_or_assistant: { Args: never; Returns: boolean }
      is_admin_or_it_manager: { Args: never; Returns: boolean }
      is_it_manager: { Args: never; Returns: boolean }
      is_privileged_user: { Args: never; Returns: boolean }
      list_public_profiles: {
        Args: never
        Returns: {
          full_name: string
          id: string
          role: string
        }[]
      }
      list_staff_directory: {
        Args: never
        Returns: {
          avatar_url: string
          check_in_time: string
          check_out_time: string
          class: string
          full_name: string
          id: string
          join_date: string
          role: string
          sequence: number
          work_day: string
          work_schedule: Json
        }[]
      }
      monthly_reset_for: { Args: { p_month: string }; Returns: undefined }
      purge_old_leave_logs: { Args: never; Returns: undefined }
      purge_old_salary_logs: { Args: never; Returns: undefined }
      purge_old_task_logs: { Args: never; Returns: undefined }
      refresh_auto_checkout_schedule: { Args: never; Returns: undefined }
      reset_leave_balances_yearly: { Args: never; Returns: undefined }
      reset_yearly_bonus_progress: {
        Args: { p_cycle_start_year: number }
        Returns: undefined
      }
      rollup_yearly_bonus_progress: {
        Args: { p_month: string }
        Returns: undefined
      }
      seed_monthly_salaries: { Args: { p_month: string }; Returns: number }
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
