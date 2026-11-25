-- Durable processing queue, lease recovery, cancellation and immutable revisions.
-- Applied to the linked Supabase project as migration 20261124160750.

alter table public.processing_jobs
  add column if not exists scan_status text not null default 'pending'
    check (scan_status in ('pending','clean','rejected','failed')),
  add column if not exists scanned_at timestamptz,
  add column if not exists scan_engine text,
  add column if not exists scan_signature_version text,
  add column if not exists input_storage_path text,
  add column if not exists output_storage_path text,
  add column if not exists idempotency_key text,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists started_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists worker_id text,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  add column if not exists progress_message text,
  add column if not exists last_error_code text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists processing_jobs_owner_idempotency_idx
  on public.processing_jobs(owner_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists processing_jobs_claim_idx
  on public.processing_jobs(scan_status, status, available_at, created_at)
  where status in ('queued','running');

create table if not exists public.document_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  processing_job_id uuid not null unique references public.processing_jobs(id) on delete cascade,
  version integer not null check (version > 0),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  unique(document_id, version)
);
create index if not exists document_revisions_owner_created_idx
  on public.document_revisions(owner_id, created_at desc);

create table if not exists public.processing_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  status text not null,
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists processing_job_events_job_created_idx
  on public.processing_job_events(job_id, created_at);
create index if not exists processing_job_events_owner_created_idx
  on public.processing_job_events(owner_id, created_at desc);

alter table public.document_revisions enable row level security;
alter table public.processing_job_events enable row level security;
create policy document_revisions_select_own on public.document_revisions
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy processing_job_events_select_own on public.processing_job_events
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists jobs_insert_own on public.processing_jobs;
drop policy if exists jobs_update_own on public.processing_jobs;
drop policy if exists jobs_delete_own on public.processing_jobs;
revoke insert, update, delete on public.processing_jobs from anon, authenticated;
grant select on public.processing_jobs to authenticated;
revoke all on public.document_revisions from anon, authenticated;
grant select on public.document_revisions to authenticated;
revoke all on public.processing_job_events from anon, authenticated;
grant select on public.processing_job_events to authenticated;
grant all on public.document_revisions to service_role;
grant all on public.processing_job_events to service_role;

create or replace function public.claim_processing_job(p_worker_id text, p_lease_seconds integer default 180)
returns setof public.processing_jobs
language sql volatile security invoker set search_path = ''
as $$
  with exhausted as (
    update public.processing_jobs
    set status='failed', completed_at=pg_catalog.now(),
        error_message='Worker lease expired after maximum attempts.',
        last_error_code='lease_expired', worker_id=null, lease_expires_at=null,
        updated_at=pg_catalog.now()
    where status='running' and lease_expires_at <= pg_catalog.now()
      and attempt_count >= max_attempts returning id
  ),
  candidate as (
    select id from public.processing_jobs
    where scan_status='clean' and cancel_requested_at is null
      and attempt_count < max_attempts
      and ((status='queued' and available_at <= pg_catalog.now())
        or (status='running' and lease_expires_at <= pg_catalog.now()))
    order by available_at, created_at
    for update skip locked limit 1
  )
  update public.processing_jobs job
  set status='running', attempt_count=job.attempt_count+1,
      worker_id=p_worker_id, started_at=coalesce(job.started_at,pg_catalog.now()),
      heartbeat_at=pg_catalog.now(),
      lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>greatest(30,least(p_lease_seconds,600))),
      progress_percent=greatest(job.progress_percent,5),
      progress_message='Worker claimed job', updated_at=pg_catalog.now()
  from candidate where job.id=candidate.id returning job.*;
$$;

create or replace function public.heartbeat_processing_job(
  p_job_id uuid,p_worker_id text,p_lease_seconds integer default 180,
  p_progress_percent smallint default 50,p_progress_message text default null
)
returns setof public.processing_jobs
language sql volatile security invoker set search_path = ''
as $$
  update public.processing_jobs
  set heartbeat_at=pg_catalog.now(),
      lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>greatest(30,least(p_lease_seconds,600))),
      progress_percent=greatest(progress_percent,least(99,greatest(0,p_progress_percent))),
      progress_message=left(p_progress_message,160), updated_at=pg_catalog.now()
  where id=p_job_id and status='running' and worker_id=p_worker_id
    and lease_expires_at > pg_catalog.now()
  returning *;
$$;

create or replace function public.finish_processing_job(
  p_job_id uuid,p_worker_id text,p_success boolean,
  p_error_code text default null,p_error_message text default null
)
returns setof public.processing_jobs
language sql volatile security invoker set search_path = ''
as $$
  update public.processing_jobs
  set status=case when cancel_requested_at is not null then 'cancelled'
    when p_success then 'succeeded'
    when attempt_count < max_attempts then 'queued' else 'failed' end,
    available_at=case when not p_success and cancel_requested_at is null and attempt_count < max_attempts
      then pg_catalog.now()+pg_catalog.make_interval(secs=>least(900,15*(2^greatest(attempt_count-1,0))::integer))
      else available_at end,
    completed_at=case when cancel_requested_at is not null or p_success or attempt_count >= max_attempts
      then pg_catalog.now() else null end,
    error_message=case when cancel_requested_at is not null or p_success then null
      when attempt_count >= max_attempts then left(p_error_message,500) else null end,
    last_error_code=case when p_success then null else left(p_error_code,80) end,
    worker_id=null, lease_expires_at=null, heartbeat_at=pg_catalog.now(),
    progress_percent=case when p_success then 100 else 0 end,
    progress_message=case when cancel_requested_at is not null then 'Cancelled'
      when p_success then 'Completed' when attempt_count < max_attempts then 'Retry scheduled'
      else 'Failed' end,
    updated_at=pg_catalog.now()
  where id=p_job_id and status='running' and worker_id=p_worker_id
    and lease_expires_at > pg_catalog.now()
  returning *;
$$;

revoke all on function public.claim_processing_job(text,integer) from public,anon,authenticated;
revoke all on function public.heartbeat_processing_job(uuid,text,integer,smallint,text) from public,anon,authenticated;
revoke all on function public.finish_processing_job(uuid,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.claim_processing_job(text,integer) to service_role;
grant execute on function public.heartbeat_processing_job(uuid,text,integer,smallint,text) to service_role;
grant execute on function public.finish_processing_job(uuid,text,boolean,text,text) to service_role;
