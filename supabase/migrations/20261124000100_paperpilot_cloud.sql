-- PaperPilot private document library. Apply only after connecting a Supabase project.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 255),
  object_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;
revoke all on public.documents from anon;
grant select, insert, delete on public.documents to authenticated;

create policy "Users can view their own documents"
  on public.documents for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can register their own documents"
  on public.documents for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own documents"
  on public.documents for delete to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'paperpilot-documents',
  'paperpilot-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their own private document objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'paperpilot-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can upload into their own private document folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'paperpilot-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete their own private document objects"
  on storage.objects for delete to authenticated
  using (bucket_id = 'paperpilot-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
