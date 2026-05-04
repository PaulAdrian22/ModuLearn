-- Supabase Storage buckets for ModuLearn.
--
-- Buckets:
--   lesson-media       public read; admin write. Hero images, section media.
--   simulation-assets  public read; admin write. Timeline layers, scene art.
--   avatars            public read; users write only under avatars/<their-uid>/.

insert into storage.buckets (id, name, public)
values
    ('lesson-media',      'lesson-media',      true),
    ('simulation-assets', 'simulation-assets', true),
    ('avatars',           'avatars',           true)
on conflict (id) do nothing;

-- ============================================================
-- lesson-media
-- ============================================================
create policy "lesson-media: public read"
    on storage.objects for select
    using (bucket_id = 'lesson-media');

create policy "lesson-media: admin write"
    on storage.objects for insert
    with check (bucket_id = 'lesson-media' and public.is_admin(auth.uid()));

create policy "lesson-media: admin update"
    on storage.objects for update
    using (bucket_id = 'lesson-media' and public.is_admin(auth.uid()))
    with check (bucket_id = 'lesson-media' and public.is_admin(auth.uid()));

create policy "lesson-media: admin delete"
    on storage.objects for delete
    using (bucket_id = 'lesson-media' and public.is_admin(auth.uid()));

-- ============================================================
-- simulation-assets
-- ============================================================
create policy "sim-assets: public read"
    on storage.objects for select
    using (bucket_id = 'simulation-assets');

create policy "sim-assets: admin write"
    on storage.objects for insert
    with check (bucket_id = 'simulation-assets' and public.is_admin(auth.uid()));

create policy "sim-assets: admin update"
    on storage.objects for update
    using (bucket_id = 'simulation-assets' and public.is_admin(auth.uid()))
    with check (bucket_id = 'simulation-assets' and public.is_admin(auth.uid()));

create policy "sim-assets: admin delete"
    on storage.objects for delete
    using (bucket_id = 'simulation-assets' and public.is_admin(auth.uid()));

-- ============================================================
-- avatars  (per-user folders: avatars/<auth.uid>/<filename>)
-- ============================================================
create policy "avatars: public read"
    on storage.objects for select
    using (bucket_id = 'avatars');

create policy "avatars: self insert"
    on storage.objects for insert
    with check (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

create policy "avatars: self update"
    on storage.objects for update
    using (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
    )
    with check (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

create policy "avatars: self delete"
    on storage.objects for delete
    using (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

create policy "avatars: admin all"
    on storage.objects for all
    using (bucket_id = 'avatars' and public.is_admin(auth.uid()))
    with check (bucket_id = 'avatars' and public.is_admin(auth.uid()));
