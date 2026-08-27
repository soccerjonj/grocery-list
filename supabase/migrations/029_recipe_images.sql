-- 029_recipe_images.sql
--
-- Storage for recipe photos. This is the app's FIRST use of Supabase Storage —
-- there was no bucket, policy, or upload path before this.
--
-- Bucket is PUBLIC-READ, and that is a deliberate tradeoff:
--   • Object paths are `<household_id>/<random uuid>.<ext>`, so a URL is not
--     guessable without already knowing both ids.
--   • A public URL renders in a plain <img> forever with no signing round-trip
--     or expiry-refresh logic, and survives being cached by the service worker.
--   • The content is a photo of dinner. Weigh that against pantry/shopping
--     rows, which stay strictly RLS-scoped.
-- WRITES are still household-scoped: the first path segment must be a
-- household the caller belongs to, so nobody can upload into another
-- household's folder or delete their photos.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recipe-images',
  'recipe-images',
  true,
  5242880, -- 5 MB hard ceiling server-side; the client also downscales first
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone may READ (bucket is public; this makes it explicit for the API too).
DROP POLICY IF EXISTS "recipe_images_read" ON storage.objects;
CREATE POLICY "recipe_images_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'recipe-images');

-- WRITE/UPDATE/DELETE only inside your own household's folder.
DROP POLICY IF EXISTS "recipe_images_insert" ON storage.objects;
CREATE POLICY "recipe_images_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] IN (
      SELECT household_id::text FROM public.household_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "recipe_images_update" ON storage.objects;
CREATE POLICY "recipe_images_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] IN (
      SELECT household_id::text FROM public.household_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "recipe_images_delete" ON storage.objects;
CREATE POLICY "recipe_images_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] IN (
      SELECT household_id::text FROM public.household_members WHERE user_id = auth.uid()
    )
  );
