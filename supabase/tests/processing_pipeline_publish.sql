-- Manual/CI database integration test for atomic, idempotent revision publication.
-- Run against a disposable Supabase database with permission to insert auth.users.
-- Every fixture is wrapped in a transaction and rolled back.

begin;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_document uuid := gen_random_uuid();
  v_job uuid := gen_random_uuid();
  v_path text;
  v_first_id uuid;
  v_second_id uuid;
  v_first_version integer;
  v_second_version integer;
  v_job_status text;
  v_document_status text;
begin
  v_path := v_owner::text || '/' || v_job::text || '/attempt-1/result.pdf';

  insert into auth.users (id,aud,role,email,created_at,updated_at,is_sso_user,is_anonymous)
  values (v_owner,'authenticated','authenticated',v_owner::text || '@example.invalid',now(),now(),false,false);

  insert into public.documents (id,owner_id,name,mime_type,size_bytes,storage_path,status)
  values (
    v_document,v_owner,'pipeline-test.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    100,v_owner::text || '/pipeline-test.docx','uploaded'
  );

  insert into public.processing_jobs (
    id,owner_id,document_id,tool,status,scan_status,input_storage_path,output_storage_path,
    attempt_count,max_attempts,worker_id,lease_expires_at,progress_percent,progress_message
  ) values (
    v_job,v_owner,v_document,'office-to-pdf','running','clean',
    v_owner::text || '/pipeline-test.docx',v_path,
    1,3,'pipeline-test-worker',now()+interval '5 minutes',95,'Publishing'
  );

  select revision_id,revision_version into v_first_id,v_first_version
  from public.publish_processing_revision(v_job,'pipeline-test-worker',1,v_path,100);

  select revision_id,revision_version into v_second_id,v_second_version
  from public.publish_processing_revision(v_job,'pipeline-test-worker',1,v_path,100);

  select status into v_job_status from public.processing_jobs where id=v_job;
  select status into v_document_status from public.documents where id=v_document;

  if v_first_id is null or v_first_id <> v_second_id then
    raise exception 'Repeated publish calls did not return the same immutable revision';
  end if;
  if v_first_version <> 1 or v_second_version <> 1 then
    raise exception 'Repeated publish calls changed the revision version';
  end if;
  if v_job_status <> 'succeeded' or v_document_status <> 'ready' then
    raise exception 'Atomic publication did not finalize job and source document';
  end if;
end;
$$;

rollback;
