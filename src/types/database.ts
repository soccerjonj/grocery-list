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
          color: string | null;
        };
        Insert: {
          id: string;
          display_name: string;
          created_at?: string;
          color?: string | null;
        };
        Update: {
          id?: string;
          display_name?: string;
          color?: string | null;
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
          kind: string;                    // 'food' | 'supplies'
          storage_location: string | null; // food: 'fridge'|'freezer'|'pantry'|'room_temp'; supplies: 'bathroom'|'laundry'|'kitchen'|'garage'|'other'
          fridge_zone: string | null;      // 'quick_use'|'long_term' (food only)
          food_category: string | null;    // food: 'produce'|...|'other'; supplies: 'cleaning'|'personal_care'|'paper_goods'|'pet'|'other'
          assigned_to: string[] | null;    // null=household, [uuid,...]=specific people
          running_low: boolean;
          running_low_dismissed: boolean;
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
          kind?: string;
          storage_location?: string | null;
          fridge_zone?: string | null;
          food_category?: string | null;
          assigned_to?: string[] | null;
          running_low?: boolean;
          running_low_dismissed?: boolean;
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
          kind?: string;
          storage_location?: string | null;
          fridge_zone?: string | null;
          food_category?: string | null;
          assigned_to?: string[] | null;
          running_low?: boolean;
          running_low_dismissed?: boolean;
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
          notes: string | null;
          completed: boolean;
          completed_by: string | null;
          completed_at: string | null;
          cleared_at: string | null;
          added_by: string | null;
          created_at: string;
          assigned_to: string[] | null;   // null=everyone, [uuid,...]=specific members
          kind: string;                   // 'food' | 'supplies' — drives where it lands on import
        };
        Insert: {
          id?: string;
          household_id: string;
          list_id?: string | null;
          name: string;
          quantity?: number | null;
          unit?: string | null;
          store?: string | null;
          notes?: string | null;
          completed?: boolean;
          completed_by?: string | null;
          completed_at?: string | null;
          cleared_at?: string | null;
          added_by?: string | null;
          created_at?: string;
          assigned_to?: string[] | null;
          kind?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          list_id?: string | null;
          name?: string;
          quantity?: number | null;
          unit?: string | null;
          store?: string | null;
          notes?: string | null;
          completed?: boolean;
          completed_by?: string | null;
          completed_at?: string | null;
          cleared_at?: string | null;
          added_by?: string | null;
          created_at?: string;
          assigned_to?: string[] | null;
          kind?: string;
        };
      };
      activity_log: {
        Row: {
          id: string;
          household_id: string;
          user_id: string | null;
          action: string;
          item_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id?: string | null;
          action: string;
          item_name?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      household_recipes: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          ingredients: Json;
          source_url: string | null;
          source_kind: string; // 'url' | 'photo' | 'manual'
          added_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          ingredients: Json;
          source_url?: string | null;
          source_kind?: string;
          added_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          ingredients?: Json;
          source_url?: string | null;
          source_kind?: string;
          added_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ActivityLog = Database["public"]["Tables"]["activity_log"]["Row"];
export type Household = Database["public"]["Tables"]["households"]["Row"];
export type HouseholdMember = Database["public"]["Tables"]["household_members"]["Row"];
export type ShoppingList = Database["public"]["Tables"]["shopping_lists"]["Row"];
export type PantryItem = Database["public"]["Tables"]["pantry_items"]["Row"];
export type ShoppingItem = Database["public"]["Tables"]["shopping_items"]["Row"];
export type HouseholdRecipe = Database["public"]["Tables"]["household_recipes"]["Row"];

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

// ── Supplies (non-food) ──────────────────────────────────────────

export type Kind = "food" | "supplies";

export const KINDS = [
  { value: "food",     label: "Food"     },
  { value: "supplies", label: "Supplies" },
] as const;

/** Where a supplies item lives. Stored in pantry_items.storage_location. */
export const SUPPLIES_LOCATIONS = [
  { value: "bathroom", label: "Bathroom" },
  { value: "laundry",  label: "Laundry"  },
  { value: "kitchen",  label: "Kitchen"  },
  { value: "garage",   label: "Garage"   },
  { value: "other",    label: "Other"    },
] as const;

/** Category for supplies. Stored in pantry_items.food_category. */
export const SUPPLIES_CATEGORIES = [
  { value: "cleaning",      label: "Cleaning"      },
  { value: "personal_care", label: "Personal care" },
  { value: "paper_goods",   label: "Paper goods"   },
  { value: "pet",           label: "Pet"           },
  { value: "other",         label: "Other"         },
] as const;
