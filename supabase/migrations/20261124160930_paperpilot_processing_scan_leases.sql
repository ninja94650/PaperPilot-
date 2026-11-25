-- Separate, leased security-inspection queue. No job is processable until scan_status='clean'.
alter table public.processing_jobs
  add column if not exists scan_attempt_count integer not null default 0 check (scan_attempt_count >= 0),
  add column if not exists scan_worker_id text,
  add column if not exists scan_lease_expires_at timestamptz,
  add column if not exists scan_available_at timestamptz not null default now();

create index if not exists processing_jobs_scan_claim_idx
  on public.processing_jobs(scan_available_at, created_at)
  where status='queued' and scan_status='pending';

create or replace function public.claim_processing_scan_job(p_worker_id text,p_lease_seconds integer default 120)
returns setof public.processing_jobs
language sql volatile security invoker set search_path=''
as $$
  with candidate as (
    select id from public.processing_jobs
    where status='queued' and scan_status='pending'
      and scan_available_at <= pg_catalog.now()
      and (scan_lease_expires_at is null or scan_lease_expires_at <= pg_catalog.now())
      and scan_attempt_count < 3
    order by scan_available_at,created_at
    for update skip locked limit 1
  )
  update public.processing_jobs job
  set scan_attempt_count=job.scan_attempt_count+1,
      scan_worker_id=p_worker_id,
      scan_lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>greatest(30,least(p_lease_seconds,300))),
      progress_message='Awaiting security inspection',
      updated_at=pg_catalog.now()
  from candidate where job.id=candidate.id returning job.*;
$$;
revoke all on function public.claim_processing_scan_job(text,integer) from public,anon,authenticated;
grant execute on function public.claim_processing_scan_job(text,integer) to service_role;
