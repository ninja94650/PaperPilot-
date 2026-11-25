-- Serialize output publication per job/document and make completion retries idempotent.
create or replace function public.publish_processing_revision(
  p_job_id uuid,
  p_worker_id text,
  p_attempt integer,
  p_storage_path text,
  p_size_bytes bigint
)
returns table(revision_id uuid, revision_version integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
  v_document public.documents%rowtype;
  v_existing public.document_revisions%rowtype;
  v_version integer;
  v_revision_id uuid;
begin
  select * into v_job
  from public.processing_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'processing_job_not_found';
  end if;

  if v_job.status = 'succeeded' then
    select * into v_existing
    from public.document_revisions
    where processing_job_id = p_job_id;
    if found and v_existing.storage_path = p_storage_path then
      return query select v_existing.id, v_existing.version;
      return;
    end if;
    raise exception 'processing_job_already_published';
  end if;

  if v_job.status <> 'running'
     or v_job.worker_id is distinct from p_worker_id
     or v_job.attempt_count <> p_attempt
     or v_job.lease_expires_at is null
     or v_job.lease_expires_at <= pg_catalog.now()
     or v_job.cancel_requested_at is not null
     or v_job.output_storage_path is distinct from p_storage_path
     or v_job.document_id is null
     or p_size_bytes < 5
     or p_size_bytes > 41943040
     or p_storage_path is distinct from
       (v_job.owner_id::text || '/' || v_job.id::text || '/attempt-' || p_attempt::text || '/result.pdf')
  then
    raise exception 'processing_job_lease_or_output_invalid';
  end if;

  select * into v_document
  from public.documents
  where id = v_job.document_id and owner_id = v_job.owner_id
  for update;

  if not found then
    raise exception 'source_document_not_found';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.document_revisions
  where document_id = v_document.id;

  insert into public.document_revisions(
    owner_id, document_id, processing_job_id, version, storage_path, mime_type, size_bytes
  ) values (
    v_job.owner_id, v_document.id, v_job.id, v_version, p_storage_path, 'application/pdf', p_size_bytes
  ) returning id into v_revision_id;

  update public.processing_jobs
  set status = 'succeeded',
      output_metadata = pg_catalog.jsonb_build_object(
        'mime_type', 'application/pdf',
        'output_size_bytes', p_size_bytes,
        'revision_id', v_revision_id,
        'revision', v_version
      ),
      completed_at = pg_catalog.now(),
      error_message = null,
      last_error_code = null,
      worker_id = null,
      lease_expires_at = null,
      heartbeat_at = pg_catalog.now(),
      progress_percent = 100,
      progress_message = 'Completed',
      updated_at = pg_catalog.now()
  where id = v_job.id;

  update public.documents
  set status = 'ready', updated_at = pg_catalog.now()
  where id = v_document.id and owner_id = v_job.owner_id;

  insert into public.processing_job_events(
    job_id, owner_id, event_type, status, progress_percent, message
  ) values (
    v_job.id, v_job.owner_id, 'completed', 'succeeded', 100,
    'Output revision ' || v_version::text || ' published'
  );

  return query select v_revision_id, v_version;
end;
$$;

revoke all on function public.publish_processing_revision(uuid,text,integer,text,bigint) from public, anon, authenticated;
grant execute on function public.publish_processing_revision(uuid,text,integer,text,bigint) to service_role;
