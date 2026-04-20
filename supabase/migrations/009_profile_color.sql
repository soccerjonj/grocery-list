-- Add color preference to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS color text DEFAULT NULL;
