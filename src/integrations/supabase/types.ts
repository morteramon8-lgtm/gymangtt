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
      attendance: {
        Row: {
          attended_on: string
          check_in: string | null
          check_out: string | null
          created_at: string
          created_by: string | null
          gym_id: string
          id: string
          member_id: string
          note: string | null
        }
        Insert: {
          attended_on?: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          gym_id?: string
          id?: string
          member_id: string
          note?: string | null
        }
        Update: {
          attended_on?: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          gym_id?: string
          id?: string
          member_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_admins: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_admins_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_notification_settings: {
        Row: {
          days_before: number
          expiry_enabled: boolean
          gym_id: string
          notify_on_due_date: boolean
          notify_overdue: boolean
          routine_enabled: boolean
          updated_at: string
          whatsapp_template: string
        }
        Insert: {
          days_before?: number
          expiry_enabled?: boolean
          gym_id: string
          notify_on_due_date?: boolean
          notify_overdue?: boolean
          routine_enabled?: boolean
          updated_at?: string
          whatsapp_template?: string
        }
        Update: {
          days_before?: number
          expiry_enabled?: boolean
          gym_id?: string
          notify_on_due_date?: boolean
          notify_overdue?: boolean
          routine_enabled?: boolean
          updated_at?: string
          whatsapp_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_notification_settings_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gyms: {
        Row: {
          address: string | null
          bank_alias: string | null
          bank_cbu: string | null
          bank_holder: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          payment_instructions: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_alias?: string | null
          bank_cbu?: string | null
          bank_holder?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          payment_instructions?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_alias?: string | null
          bank_cbu?: string | null
          bank_holder?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          payment_instructions?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      member_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          gym_id: string | null
          id: string
          kind: string
          member_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          gym_id?: string | null
          id?: string
          kind: string
          member_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          gym_id?: string | null
          id?: string
          kind?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_events_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_progress: {
        Row: {
          arm_cm: number | null
          body_fat: number | null
          chest_cm: number | null
          created_at: string
          gym_id: string
          id: string
          measured_on: string
          member_id: string
          notes: string | null
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          arm_cm?: number | null
          body_fat?: number | null
          chest_cm?: number | null
          created_at?: string
          gym_id?: string
          id?: string
          measured_on?: string
          member_id: string
          notes?: string | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          arm_cm?: number | null
          body_fat?: number | null
          chest_cm?: number | null
          created_at?: string
          gym_id?: string
          id?: string
          measured_on?: string
          member_id?: string
          notes?: string | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "member_progress_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_progress_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_routine_history: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          exercises: Json
          gym_id: string
          id: string
          member_id: string
          routine_id: string | null
          routine_name: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          exercises?: Json
          gym_id: string
          id?: string
          member_id: string
          routine_id?: string | null
          routine_name?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          exercises?: Json
          gym_id?: string
          id?: string
          member_id?: string
          routine_id?: string | null
          routine_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_routine_history_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_routine_history_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_routines: {
        Row: {
          assigned_at: string
          member_id: string
          routine_id: string
        }
        Insert: {
          assigned_at?: string
          member_id: string
          routine_id: string
        }
        Update: {
          assigned_at?: string
          member_id?: string
          routine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_routines_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_routines_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          active: boolean
          birth_date: string | null
          created_at: string
          dni: string | null
          email: string | null
          expires_at: string | null
          first_name: string
          goal: string | null
          gym_id: string
          id: string
          join_date: string
          last_name: string
          level: string | null
          notes: string | null
          phone: string | null
          photo_url: string | null
          plan_id: string | null
          trainer_notes: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          birth_date?: string | null
          created_at?: string
          dni?: string | null
          email?: string | null
          expires_at?: string | null
          first_name: string
          goal?: string | null
          gym_id?: string
          id?: string
          join_date?: string
          last_name: string
          level?: string | null
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          plan_id?: string | null
          trainer_notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          birth_date?: string | null
          created_at?: string
          dni?: string | null
          email?: string | null
          expires_at?: string | null
          first_name?: string
          goal?: string | null
          gym_id?: string
          id?: string
          join_date?: string
          last_name?: string
          level?: string | null
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          plan_id?: string | null
          trainer_notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          channel: string
          created_at: string
          dedup_key: string
          error: string | null
          gym_id: string
          id: string
          kind: string
          member_id: string | null
          read_at: string | null
          status: string
          title: string
          user_id: string | null
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          dedup_key: string
          error?: string | null
          gym_id?: string
          id?: string
          kind: string
          member_id?: string | null
          read_at?: string | null
          status?: string
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          dedup_key?: string
          error?: string | null
          gym_id?: string
          id?: string
          kind?: string
          member_id?: string | null
          read_at?: string | null
          status?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
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
      payments: {
        Row: {
          amount: number
          concept: string
          covers_until: string | null
          created_at: string
          created_by: string | null
          discount: number
          gym_id: string
          id: string
          member_id: string
          method: string
          notes: string | null
          original_amount: number | null
          paid_on: string
          plan_id: string | null
          request_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          concept?: string
          covers_until?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          gym_id?: string
          id?: string
          member_id: string
          method?: string
          notes?: string | null
          original_amount?: number | null
          paid_on?: string
          plan_id?: string | null
          request_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          concept?: string
          covers_until?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          gym_id?: string
          id?: string
          member_id?: string
          method?: string
          notes?: string | null
          original_amount?: number | null
          paid_on?: string
          plan_id?: string | null
          request_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          gym_id: string
          id: string
          months: number
          name: string
          payment_link: string | null
          price: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          gym_id?: string
          id?: string
          months?: number
          name: string
          payment_link?: string | null
          price?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          gym_id?: string
          id?: string
          months?: number
          name?: string
          payment_link?: string | null
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "plans_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      routine_exercises: {
        Row: {
          id: string
          media_url: string | null
          muscle_group: string | null
          name: string
          notes: string | null
          position: number
          reps: string
          rest: string | null
          routine_id: string
          sets: number
          weight: string | null
        }
        Insert: {
          id?: string
          media_url?: string | null
          muscle_group?: string | null
          name: string
          notes?: string | null
          position?: number
          reps?: string
          rest?: string | null
          routine_id: string
          sets?: number
          weight?: string | null
        }
        Update: {
          id?: string
          media_url?: string | null
          muscle_group?: string | null
          name?: string
          notes?: string | null
          position?: number
          reps?: string
          rest?: string | null
          routine_id?: string
          sets?: number
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routine_exercises_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_role: string
          gym_id: string
          id: string
          kind: string
          member_id: string | null
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_role?: string
          gym_id?: string
          id?: string
          kind?: string
          member_id?: string | null
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_role?: string
          gym_id?: string
          id?: string
          kind?: string
          member_id?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routines_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routines_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
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
      current_gym_id: { Args: never; Returns: string }
      current_member_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      member_check_in: { Args: never; Returns: Json }
      recalc_member_expiry: { Args: { _member_id: string }; Returns: string }
      register_payment: {
        Args: {
          _amount: number
          _concept: string
          _member_id: string
          _method: string
          _paid_on: string
          _plan_id: string
          _request_id?: string
        }
        Returns: Json
      }
      routine_snapshot: { Args: { _routine_id: string }; Returns: Json }
      run_expiry_scan: { Args: { _gym_id?: string }; Returns: Json }
      today_ar: { Args: never; Returns: string }
      void_payment: {
        Args: { _payment_id: string; _reason: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "socio"
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
      app_role: ["admin", "socio"],
    },
  },
} as const
