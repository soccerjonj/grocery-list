export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          created_at?: string;
        };
      };
      households: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_by?: string | null;
          created_at?: string;
        };
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          role: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          role?: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          role?: string;
          joined_at?: string;
        };
      };
      pantry_items: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          quantity: number;
          unit: string | null;
          notes: string | null;
          added_by: string | null;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          quantity?: number;
          unit?: string | null;
          notes?: string | null;
          added_by?: string | null;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          quantity?: number;
          unit?: string | null;
          notes?: string | null;
          added_by?: string | null;
          updated_at?: string;
          created_at?: string;
        };
      };
      shopping_items: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          quantity: number | null;
          unit: string | null;
          completed: boolean;
          completed_by: string | null;
          completed_at: string | null;
          cleared_at: string | null;
          added_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          quantity?: number | null;
          unit?: string | null;
          completed?: boolean;
          completed_by?: string | null;
          completed_at?: string | null;
          cleared_at?: string | null;
          added_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          quantity?: number | null;
          unit?: string | null;
          completed?: boolean;
          completed_by?: string | null;
          completed_at?: string | null;
          cleared_at?: string | null;
          added_by?: string | null;
          created_at?: string;
        };
      };
    };
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Household = Database["public"]["Tables"]["households"]["Row"];
export type HouseholdMember =
  Database["public"]["Tables"]["household_members"]["Row"];
export type PantryItem = Database["public"]["Tables"]["pantry_items"]["Row"];
export type ShoppingItem =
  Database["public"]["Tables"]["shopping_items"]["Row"];
