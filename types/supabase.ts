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
          drawing_data: Json | null
          id: string
          pin_number: number
          thread_id: string
          updated_at: string | null
          user_name: string
          x_position: number
          y_position: number
          status: string | null
          display_number: number | null
        }
        Insert: {
          comment_index: number
          content: string
          created_at?: string | null
          drawing_data?: Json | null
          id: string
          pin_number: number
          thread_id: string
          updated_at?: string | null
          user_name: string
          x_position?: number
          y_position?: number
          status?: string | null
          display_number?: number | null
        }
        Update: {
          comment_index?: number
          content?: string
          created_at?: string | null
          drawing_data?: Json | null
          id?: string
          pin_number?: number
          thread_id?: string
          updated_at?: string | null
          user_name?: string
          x_position?: number
          y_position?: number
          status?: string | null
          display_number?: number | null
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
      comment_attachments: {
        Row: {
          id: string
          comment_id: string
          project_id: string
          storage_path: string
          original_filename: string
          mime_type: string
          file_size_bytes: number
          created_at: string
        }
        Insert: {
          id?: string
          comment_id: string
          project_id: string
          storage_path: string
          original_filename: string
          mime_type: string
          file_size_bytes: number
          created_at?: string
        }
        Update: {
          id?: string
          comment_id?: string
          project_id?: string
          storage_path?: string
          original_filename?: string
          mime_type?: string
          file_size_bytes?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "markup_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "markup_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_access: {
        Row: {
          id: string
          project_id: string
          user_email: string
          granted_by: string | null
          granted_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_email: string
          granted_by?: string | null
          granted_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_email?: string
          granted_by?: string | null
          granted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "markup_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      markup_drawings: {
        Row: {
          id: string
          thread_id: string
          drawing_data: Json
          created_by: string
          is_duplicated: boolean
          original_drawing_id: string | null
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          drawing_data: Json
          created_by: string
          is_duplicated?: boolean
          original_drawing_id?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          drawing_data?: Json
          created_by?: string
          is_duplicated?: boolean
          original_drawing_id?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "markup_drawings_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "markup_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markup_drawings_original_drawing_id_fkey"
            columns: ["original_drawing_id"]
            isOneToOne: false
            referencedRelation: "markup_drawings"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          id: string
          token: string
          resource_type: Database["public"]["Enums"]["share_resource_type"]
          resource_id: string
          permissions: Database["public"]["Enums"]["share_permission_type"]
          created_by: string
          expires_at: string | null
          is_active: boolean
          access_count: number
          last_accessed_at: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          token: string
          resource_type: Database["public"]["Enums"]["share_resource_type"]
          resource_id: string
          permissions?: Database["public"]["Enums"]["share_permission_type"]
          created_by: string
          expires_at?: string | null
          is_active?: boolean
          access_count?: number
          last_accessed_at?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          token?: string
          resource_type?: Database["public"]["Enums"]["share_resource_type"]
          resource_id?: string
          permissions?: Database["public"]["Enums"]["share_permission_type"]
          created_by?: string
          expires_at?: string | null
          is_active?: boolean
          access_count?: number
          last_accessed_at?: string | null
          metadata?: Json | null
          created_at?: string
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
      duplicate_project: {
        Args: {
          p_source_project_id: string
          p_new_project_name: string
          p_copy_comments?: boolean
          p_copy_drawings?: boolean
          p_created_by?: string
        }
        Returns: string
      }
      is_share_link_valid: {
        Args: { p_token: string }
        Returns: boolean
      }
      increment_share_link_access: {
        Args: { p_token: string }
        Returns: undefined
      }
    }
    Enums: {
      share_permission_type: "view" | "comment" | "draw_and_comment"
      share_resource_type: "thread" | "project"
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
