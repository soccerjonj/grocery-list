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
      shopping_lists: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          created_by: string | null;
          created_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          created_by?: string | null;
          created_at?: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          created_by?: string | null;
          created_at?: string;
          archived_at?: string | null;
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
          expires_at: string | null;       // ISO date string "YYYY-MM-DD"
          storage_location: string | null; // 'fridge'|'freezer'|'pantry'|'room_temp'
          fridge_zone: string | null;      // 'quick_use'|'long_term'
          food_category: string | null;    // 'produce'|'meat'|'dairy'|'drinks'|'condiments'|'grains'|'snacks'|'prepared'|'other'
          assigned_to: string[] | null;    // null=household, [uuid,...]=specific people
          running_low: boolean;
          opened: boolean;
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
          expires_at?: string | null;
          storage_location?: string | null;
          fridge_zone?: string | null;
          food_category?: string | null;
          assigned_to?: string[] | null;
          running_low?: boolean;
          opened?: boolean;
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
          expires_at?: string | null;
          storage_location?: string | null;
          fridge_zone?: string | null;
          food_category?: string | null;
          assigned_to?: string[] | null;
          running_low?: boolean;
          opened?: boolean;
        };
      };
      shopping_items: {
        Row: {
          id: string;
          household_id: string;
          list_id: string | null;
          name: string;
          quantity: number | null;
          unit: string | null;
          store: string | null;
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
          list_id?: string | null;
          name: string;
          quantity?: number | null;
          unit?: string | null;
          store?: string | null;
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
          list_id?: string | null;
          name?: string;
          quantity?: number | null;
          unit?: string | null;
          store?: string | null;
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
export type HouseholdMember = Database["public"]["Tables"]["household_members"]["Row"];
export type ShoppingList = Database["public"]["Tables"]["shopping_lists"]["Row"];
export type PantryItem = Database["public"]["Tables"]["pantry_items"]["Row"];
export type ShoppingItem = Database["public"]["Tables"]["shopping_items"]["Row"];

// ── Derived display types ─────────────────────────────────────────

export const STORAGE_LOCATIONS = [
  { value: "fridge",    label: "Fridge"  },
  { value: "freezer",   label: "Freezer" },
  { value: "pantry",    label: "Pantry"  },
  { value: "room_temp", label: "Counter" },
] as const;

export const FRIDGE_ZONES = [
  { value: "quick_use", label: "Quick-use" },
  { value: "long_term", label: "Long-term" },
] as const;

export const FOOD_CATEGORIES = [
  { value: "produce",    label: "Produce"    },
  { value: "meat",       label: "Meat"       },
  { value: "dairy",      label: "Dairy"      },
  { value: "drinks",     label: "Drinks"     },
  { value: "condiments", label: "Condiments" },
  { value: "grains",     label: "Grains"     },
  { value: "snacks",     label: "Snacks"     },
  { value: "prepared",   label: "Prepared"   },
  { value: "other",      label: "Other"      },
] as const;
