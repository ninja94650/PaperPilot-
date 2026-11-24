-- Cross-tenant RLS and expired processing lease recovery regression tests.
-- Run only against a disposable Supabase database with auth/schema privileges.
-- All fixture rows are rolled back.
begin;

create temporary table paperpilot_rls_assertions(ok boolean not null check (ok));
create temporary table paperpilot_claimed_jobs(
  id uuid not null, attempt_count integer not null, worker_id text not null
);

do $$
declare
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_doc_a uuid := gen_random_uuid();
  v_doc_b uuid := gen_random_uuid();
  v_job_a uuid := gen_random_uuid();
  v_job_b uuid := gen_random_uuid();
  v_recovery_job uuid := gen_random_uuid();
begin
  insert into auth.users (id,aud,role,email,created_at,updated_at,is_sso_user,is_anonymous)
  values
    (v_owner_a,'authenticated','authenticated',v_owner_a::text || '@rls-test.invalid',now(),now(),false,false),
    (v_owner_b,'authenticated','authenticated',v_owner_b::text || '@rls-test.invalid',now(),now(),false,false);

  insert into public.documents (id,owner_id,name,mime_type,size_bytes,storage_path,status)
  values
    (v_doc_a,v_owner_a,'owner-a.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',100,v_owner_a::text || '/owner-a.docx','uploaded'),
    (v_doc_b,v_owner_b,'owner-b.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',100,v_owner_b::text || '/owner-b.docx','uploaded');

  insert into public.processing_jobs (id,owner_id,document_id,tool,status,scan_status,input_storage_path,attempt_count,max_attempts)
  values
    (v_job_a,v_owner_a,v_doc_a,'office-to-pdf','succeeded','clean',v_owner_a::text || '/owner-a.docx',1,3),
    (v_job_b,v_owner_b,v_doc_b,'office-to-pdf','succeeded','clean',v_owner_b::text || '/owner-b.docx',1,3),
    (v_recovery_job,v_owner_a,v_doc_a,'office-to-pdf','running','clean',v_owner_a::text || '/owner-a.docx',1,3);

  update public.processing_jobs
  set worker_id='dead-worker', lease_expires_at=now()-interval '2 minutes',
      heartbeat_at=now()-interval '3 minutes', available_at=now()-interval '100 years'
  where id=v_recovery_job;

  insert into public.document_revisions(owner_id,document_id,processing_job_id,version,storage_path,mime_type,size_bytes)
  values
    (v_owner_a,v_doc_a,v_job_a,1,v_owner_a::text || '/' || v_job_a::text || '/attempt-1/result.pdf','application/pdf',100),
    (v_owner_b,v_doc_b,v_job_b,1,v_owner_b::text || '/' || v_job_b::text || '/attempt-1/result.pdf','application/pdf',100);

  insert into public.processing_job_events(job_id,owner_id,event_type,status,progress_percent,message)
  values
    (v_job_a,v_owner_a,'created','succeeded',100,'owner A event'),
    (v_job_b,v_owner_b,'created','succeeded',100,'owner B event');

  -- Persist IDs for assertions without exposing test fixtures outside this transaction.
  create temporary table paperpilot_fixture_ids(owner_a uuid,owner_b uuid,job_a uuid,job_b uuid,recovery_job uuid);
  insert into paperpilot_fixture_ids values(v_owner_a,v_owner_b,v_job_a,v_job_b,v_recovery_job);
end;
$$;

grant select on paperpilot_fixture_ids to authenticated, service_role;
grant insert on paperpilot_rls_assertions to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_a::text from paperpilot_fixture_ids),true);
insert into paperpilot_rls_assertions
select (select count(*)=1 from public.processing_jobs where id=(select job_a from paperpilot_fixture_ids));
insert into paperpilot_rls_assertions
select (select count(*)=0 from public.processing_jobs where id=(select job_b from paperpilot_fixture_ids));
insert into paperpilot_rls_assertions
select (select count(*)=1 from public.processing_job_events where job_id=(select job_a from paperpilot_fixture_ids));
insert into paperpilot_rls_assertions
select (select count(*)=0 from public.processing_job_events where job_id=(select job_b from paperpilot_fixture_ids));
insert into paperpilot_rls_assertions
select (select count(*)=1 from public.document_revisions where processing_job_id=(select job_a from paperpilot_fixture_ids));
insert into paperpilot_rls_assertions
select (select count(*)=0 from public.document_revisions where processing_job_id=(select job_b from paperpilot_fixture_ids));

select set_config('request.jwt.claim.sub',(select owner_b::text from paperpilot_fixture_ids),true);
insert into paperpilot_rls_assertions
select (select count(*)=1 from public.processing_jobs where id=(select job_b from paperpilot_fixture_ids));
insert into paperpilot_rls_assertions
select (select count(*)=0 from public.processing_jobs where id=(select job_a from paperpilot_fixture_ids));
reset role;

-- Only the service role can claim a lease. The expired job must be reclaimed
-- with a fresh worker ID and a monotonically incremented attempt count.
grant insert on paperpilot_claimed_jobs to service_role;
set local role service_role;
insert into paperpilot_claimed_jobs
select id,attempt_count,worker_id
from public.claim_processing_job('recovery-worker',180)
where id=(select recovery_job from paperpilot_fixture_ids);
reset role;

do $$
begin
  if (select count(*) from paperpilot_rls_assertions) <> 8 then
    raise exception 'One or more cross-tenant RLS assertions were not executed';
  end if;
  if (select count(*) from paperpilot_claimed_jobs) <> 1
     or not exists (
       select 1 from paperpilot_claimed_jobs
       where attempt_count=2 and worker_id='recovery-worker'
     ) then
    raise exception 'Expired worker lease was not safely reclaimed';
  end if;
end;
$$;

rollback;
