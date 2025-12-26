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
      markup_comments: {
        Row: {
          comment_index: number
          content: string
          created_at: string | null
          id: string
          pin_number: number
          thread_id: string
          updated_at: string | null
          user_name: string
        }
        Insert: {
          comment_index: number
          content: string
          created_at?: string | null
          id: string
          pin_number: number
          thread_id: string
          updated_at?: string | null
          user_name: string
        }
        Update: {
          comment_index?: number
          content?: string
          created_at?: string | null
          id?: string
          pin_number?: number
          thread_id?: string
          updated_at?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "markup_comments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "markup_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      markup_projects: {
        Row: {
          created_at: string | null
          extraction_timestamp: string | null
          id: string
          markup_url: string | null
          project_name: string
          raw_payload: Json | null
          scraped_data_id: number | null
          total_screenshots: number | null
          total_threads: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          extraction_timestamp?: string | null
          id?: string
          markup_url?: string | null
          project_name: string
          raw_payload?: Json | null
          scraped_data_id?: number | null
          total_screenshots?: number | null
          total_threads?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          extraction_timestamp?: string | null
          id?: string
          markup_url?: string | null
          project_name?: string
          raw_payload?: Json | null
          scraped_data_id?: number | null
          total_screenshots?: number | null
          total_threads?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "markup_projects_scraped_data_id_fkey"
            columns: ["scraped_data_id"]
            isOneToOne: false
            referencedRelation: "scraped_data"
            referencedColumns: ["id"]
          },
        ]
      }
      markup_threads: {
        Row: {
          created_at: string | null
          id: string
          image_filename: string | null
          image_index: number | null
          image_path: string | null
          local_image_path: string | null
          project_id: string
          thread_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_filename?: string | null
          image_index?: number | null
          image_path?: string | null
          local_image_path?: string | null
          project_id: string
          thread_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_filename?: string | null
          image_index?: number | null
          image_path?: string | null
          local_image_path?: string | null
          project_id?: string
          thread_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "markup_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "markup_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pin: {
        Row: {
          comment_attatchment: string | null
          date_added: string | null
          id: number
          thread_id: number | null
          x_cord: number
          y_cord: number
        }
        Insert: {
          comment_attatchment?: string | null
          date_added?: string | null
          id?: number
          thread_id?: number | null
          x_cord: number
          y_cord: number
        }
        Update: {
          comment_attatchment?: string | null
          date_added?: string | null
          id?: number
          thread_id?: number | null
          x_cord?: number
          y_cord?: number
        }
        Relationships: [
          {
            foreignKeyName: "pin_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          date_created: string | null
          description: string | null
          id: number
          name: string
        }
        Insert: {
          date_created?: string | null
          description?: string | null
          id?: number
          name: string
        }
        Update: {
          date_created?: string | null
          description?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      scraped_data: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          id: number
          number_of_images: number | null
          options: Json | null
          response_payload: Json | null
          scraping_timestamp: string | null
          screenshot_metadata: Json | null
          screenshots_paths: string[] | null
          session_id: string | null
          success: boolean | null
          title: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: number
          number_of_images?: number | null
          options?: Json | null
          response_payload?: Json | null
          scraping_timestamp?: string | null
          screenshot_metadata?: Json | null
          screenshots_paths?: string[] | null
          session_id?: string | null
          success?: boolean | null
          title?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: number
          number_of_images?: number | null
          options?: Json | null
          response_payload?: Json | null
          scraping_timestamp?: string | null
          screenshot_metadata?: Json | null
          screenshots_paths?: string[] | null
          session_id?: string | null
          success?: boolean | null
          title?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: []
      }
      scraping_error_logs: {
        Row: {
          created_at: string | null
          error_details: Json | null
          error_message: string
          failed_at: string | null
          id: number
          last_retry_at: string | null
          number_of_images: number | null
          options: Json | null
          response_payload: Json | null
          retry_count: number | null
          session_id: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          error_details?: Json | null
          error_message: string
          failed_at?: string | null
          id?: number
          last_retry_at?: string | null
          number_of_images?: number | null
          options?: Json | null
          response_payload?: Json | null
          retry_count?: number | null
          session_id?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          error_details?: Json | null
          error_message?: string
          failed_at?: string | null
          id?: number
          last_retry_at?: string | null
          number_of_images?: number | null
          options?: Json | null
          response_payload?: Json | null
          retry_count?: number | null
          session_id?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: []
      }
      threads: {
        Row: {
          id: number
          image_url: string
          markup_id: number | null
          project_id: number | null
        }
        Insert: {
          id?: number
          image_url: string
          markup_id?: number | null
          project_id?: number | null
        }
        Update: {
          id?: number
          image_url?: string
          markup_id?: number | null
          project_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          password_hash: string
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          password_hash: string
          role: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          password_hash?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      insert_markup_payload: {
        Args: { p_payload: Json; p_scraped_data_id: number }
        Returns: string
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
