-- Ensure abandoned scan jobs fail closed after the scan retry budget is exhausted.
create or replace function public.claim_processing_scan_job(p_worker_id text,p_lease_seconds integer default 120)
returns setof public.processing_jobs
language sql volatile security invoker set search_path=''
as $$
  with exhausted as (
    update public.processing_jobs
    set scan_status='failed', status='failed', completed_at=pg_catalog.now(),
        error_message='Security inspection lease expired after maximum attempts.',
        last_error_code='scan_lease_expired', scan_worker_id=null,
        scan_lease_expires_at=null, updated_at=pg_catalog.now()
    where status='queued' and scan_status='pending'
      and scan_attempt_count >= 3
      and (scan_lease_expires_at is null or scan_lease_expires_at <= pg_catalog.now())
    returning id
  ),
  candidate as (
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
