-- Finalize cancellation requests if a worker disappears before its next checkpoint.
create or replace function public.claim_processing_job(p_worker_id text,p_lease_seconds integer default 180)
returns setof public.processing_jobs
language sql volatile security invoker set search_path=''
as $$
  with cancelled as (
    update public.processing_jobs
    set status='cancelled', completed_at=pg_catalog.now(), worker_id=null,
        lease_expires_at=null, progress_message='Cancelled after worker lease ended',
        updated_at=pg_catalog.now()
    where cancel_requested_at is not null
      and (status='queued' or (status='running' and lease_expires_at <= pg_catalog.now()))
    returning id
  ),
  exhausted as (
    update public.processing_jobs
    set status='failed', completed_at=pg_catalog.now(),
        error_message='Worker lease expired after maximum attempts.',
        last_error_code='lease_expired', worker_id=null, lease_expires_at=null,
        updated_at=pg_catalog.now()
    where status='running' and cancel_requested_at is null
      and lease_expires_at <= pg_catalog.now()
      and attempt_count >= max_attempts
    returning id
  ),
  candidate as (
    select id from public.processing_jobs
    where scan_status='clean' and cancel_requested_at is null
      and attempt_count < max_attempts
      and ((status='queued' and available_at <= pg_catalog.now())
        or (status='running' and lease_expires_at <= pg_catalog.now()))
    order by available_at,created_at
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
