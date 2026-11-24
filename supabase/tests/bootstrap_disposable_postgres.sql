-- Minimal Supabase-compatible schema for disposable Postgres regression tests.
-- This is CI-only and must never be applied to the linked production project.
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end
$$;

create schema if not exists auth;
create table auth.users (
  id uuid primary key,
  aud text,
  role text,
  email text unique,
  created_at timestamptz,
  updated_at timestamptz,
  is_sso_user boolean not null default false,
  is_anonymous boolean not null default false
);
create or replace function auth.uid()
returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  storage_path text not null unique,
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','failed','deleted')),
  page_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.processing_jobs (
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

alter table public.documents enable row level security;
alter table public.processing_jobs enable row level security;
create policy documents_select_own on public.documents for select to authenticated using ((select auth.uid())=owner_id);
create policy jobs_select_own on public.processing_jobs for select to authenticated using ((select auth.uid())=owner_id);
grant usage on schema public to anon, authenticated, service_role;
grant select,insert,update,delete on public.documents to authenticated;
grant select,insert,update,delete on public.processing_jobs to authenticated;
grant all on public.documents to service_role;
grant all on public.processing_jobs to service_role;

-- Minimal private Storage object table and folder-owner policies for CI.
create schema if not exists storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique(bucket_id,name)
);
alter table storage.objects enable row level security;
create policy documents_storage_select_own on storage.objects
  for select to authenticated
  using (bucket_id='documents' and split_part(name,'/',1)=(select auth.uid())::text);
create policy documents_storage_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id='documents' and split_part(name,'/',1)=(select auth.uid())::text);
create policy documents_storage_update_own on storage.objects
  for update to authenticated
  using (bucket_id='documents' and split_part(name,'/',1)=(select auth.uid())::text)
  with check (bucket_id='documents' and split_part(name,'/',1)=(select auth.uid())::text);
create policy documents_storage_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id='documents' and split_part(name,'/',1)=(select auth.uid())::text);
grant usage on schema storage to authenticated, service_role;
grant select,insert,update,delete on storage.objects to authenticated;
grant all on storage.objects to service_role;
