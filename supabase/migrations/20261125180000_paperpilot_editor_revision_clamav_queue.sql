-- Quarantine Office revisions until the isolated ClamAV worker reports a clean verdict.
create table if not exists public.editor_revision_scan_jobs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  revision_id uuid not null unique,
  parent_revision_id uuid,
  storage_path text not null unique,
  name text not null check (char_length(name) between 1 and 120),
  mime_type text not null check (mime_type in (
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )),
  editor_kind text not null check (editor_kind in ('word','presentation')),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'queued' check (status in ('queued','scanning','clean','rejected','failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  available_at timestamptz not null default now(),
  worker_id text,
  lease_expires_at timestamptz,
  signature_version text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists editor_revision_scan_queue_idx
  on public.editor_revision_scan_jobs(status, available_at, created_at);
alter table public.editor_revision_scan_jobs enable row level security;
revoke all on table public.editor_revision_scan_jobs from public, anon, authenticated;
grant all on table public.editor_revision_scan_jobs to service_role;

create or replace function public.claim_editor_revision_scan_job(p_worker_id text, p_lease_seconds integer default 120)
returns setof public.editor_revision_scan_jobs
language plpgsql volatile security definer set search_path = ''
as $$
declare v_job public.editor_revision_scan_jobs%rowtype;
begin
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9._:-]{3,80}$'
     or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'editor_scan_claim_invalid';
  end if;
  select * into v_job
  from public.editor_revision_scan_jobs
  where (status = 'queued' and available_at <= now())
     or (status = 'scanning' and lease_expires_at <= now() and attempt_count < 3)
  order by created_at
  for update skip locked limit 1;
  if not found then return; end if;
  update public.editor_revision_scan_jobs
  set status='scanning', worker_id=p_worker_id, attempt_count=attempt_count+1,
      lease_expires_at=now() + make_interval(secs => p_lease_seconds), updated_at=now()
  where id=v_job.id returning * into v_job;
  return next v_job;
end;
$$;
revoke all on function public.claim_editor_revision_scan_job(text,integer) from public, anon, authenticated;
grant execute on function public.claim_editor_revision_scan_job(text,integer) to service_role;
