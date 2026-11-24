create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  storage_path text not null unique,
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','failed','deleted')),
  page_count integer check (page_count is null or page_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  tool text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  input_metadata jsonb not null default '{}'::jsonb,
  output_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists documents_owner_created_idx on public.documents(owner_id, created_at desc);
create index if not exists jobs_owner_created_idx on public.processing_jobs(owner_id, created_at desc);
create index if not exists jobs_document_idx on public.processing_jobs(document_id);

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.processing_jobs enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "documents_select_own" on public.documents for select to authenticated using ((select auth.uid()) = owner_id);
create policy "documents_insert_own" on public.documents for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "documents_update_own" on public.documents for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "documents_delete_own" on public.documents for delete to authenticated using ((select auth.uid()) = owner_id);
create policy "jobs_select_own" on public.processing_jobs for select to authenticated using ((select auth.uid()) = owner_id);
create policy "jobs_insert_own" on public.processing_jobs for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "jobs_update_own" on public.processing_jobs for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "jobs_delete_own" on public.processing_jobs for delete to authenticated using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520, array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "documents_storage_select_own" on storage.objects for select to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_storage_insert_own" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_storage_update_own" on storage.objects for update to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_storage_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.processing_jobs to authenticated;
