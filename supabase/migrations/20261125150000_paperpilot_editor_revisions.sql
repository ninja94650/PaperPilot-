-- Immutable, owner-scoped revisions created by authenticated Office Studio autosave.
-- Browser uploads are stored under the user's private documents bucket; the API validates
-- the uploaded OOXML package and SHA-256 before invoking the service-role-only publisher.

create table if not exists public.editor_revisions (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version integer not null check (version > 0),
  parent_revision_id uuid references public.editor_revisions(id) on delete restrict,
  storage_path text not null unique,
  name text not null check (char_length(name) between 1 and 120),
  mime_type text not null check (mime_type in (
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )),
  editor_kind text not null check (editor_kind in ('word','presentation')),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(document_id, version),
  constraint editor_revision_kind_mime_check check (
    (editor_kind = 'word' and mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and lower(name) like '%.docx')
    or
    (editor_kind = 'presentation' and mime_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' and lower(name) like '%.pptx')
  )
);

create index if not exists editor_revisions_owner_document_version_idx
  on public.editor_revisions(owner_id, document_id, version desc);

alter table public.editor_revisions enable row level security;
drop policy if exists editor_revisions_select_own on public.editor_revisions;
create policy editor_revisions_select_own on public.editor_revisions
  for select to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on table public.editor_revisions from anon, authenticated;
grant select on table public.editor_revisions to authenticated;
grant all on table public.editor_revisions to service_role;

create or replace function public.publish_editor_revision(
  p_owner_id uuid,
  p_document_id uuid,
  p_revision_id uuid,
  p_parent_revision_id uuid,
  p_storage_path text,
  p_name text,
  p_mime_type text,
  p_editor_kind text,
  p_size_bytes bigint,
  p_sha256 text
)
returns table(revision_id uuid, revision_version integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_document public.documents%rowtype;
  v_version integer;
begin
  if p_owner_id is null or p_document_id is null or p_revision_id is null
     or p_size_bytes < 1 or p_size_bytes > 20971520
     or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'
     or p_storage_path is distinct from
       (p_owner_id::text || '/' || p_document_id::text || '/editor/' || p_revision_id::text || '/' || p_name)
     or not (
       (p_editor_kind = 'word'
        and p_mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        and pg_catalog.lower(p_name) like '%.docx')
       or
       (p_editor_kind = 'presentation'
        and p_mime_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        and pg_catalog.lower(p_name) like '%.pptx')
     )
  then
    raise exception 'editor_revision_metadata_invalid';
  end if;

  select * into v_document
  from public.documents
  where id = p_document_id and owner_id = p_owner_id and status <> 'deleted'
  for update;

  if not found then
    raise exception 'editor_source_document_not_found';
  end if;

  if p_parent_revision_id is not null and not exists (
    select 1 from public.editor_revisions parent
    where parent.id = p_parent_revision_id
      and parent.document_id = p_document_id
      and parent.owner_id = p_owner_id
  ) then
    raise exception 'editor_parent_revision_not_found';
  end if;

  select coalesce(max(revision.version), 0) + 1
  into v_version
  from public.editor_revisions revision
  where revision.document_id = p_document_id;

  insert into public.editor_revisions(
    id, owner_id, document_id, version, parent_revision_id, storage_path,
    name, mime_type, editor_kind, size_bytes, sha256
  ) values (
    p_revision_id, p_owner_id, p_document_id, v_version, p_parent_revision_id,
    p_storage_path, p_name, p_mime_type, p_editor_kind, p_size_bytes, p_sha256
  );

  return query select p_revision_id, v_version;
end;
$$;

revoke all on function public.publish_editor_revision(uuid,uuid,uuid,uuid,text,text,text,text,bigint,text)
  from public, anon, authenticated;
grant execute on function public.publish_editor_revision(uuid,uuid,uuid,uuid,text,text,text,text,bigint,text)
  to service_role;
