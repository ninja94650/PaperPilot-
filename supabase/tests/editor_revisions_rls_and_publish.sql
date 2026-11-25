-- Disposable PostgreSQL regression for immutable editor revisions and owner isolation.
-- Run only after bootstrap_disposable_postgres.sql and the editor revision migration.

insert into auth.users(id,email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','editor-a@example.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','editor-b@example.invalid')
on conflict (id) do nothing;

insert into public.documents(id,owner_id,name,mime_type,size_bytes,storage_path,status) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','source.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',2048,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source/source.docx','uploaded'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','other.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation',2048,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source/other.pptx','uploaded')
on conflict (id) do nothing;

set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;

do $$
begin
  begin
    insert into public.editor_revisions(
      id,owner_id,document_id,version,storage_path,name,mime_type,editor_kind,size_bytes,sha256
    ) values (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/editor/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/source.docx',
      'source.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','word',1024,repeat('a',64)
    );
    raise exception 'authenticated direct insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

select count(*) = 0 as no_unpublished_revisions_visible
from public.editor_revisions;

reset role;
set role service_role;

select * from public.publish_editor_revision(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  null,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/editor/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/revision-1.docx',
  'revision-1.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'word',1024,repeat('a',64)
);

select * from public.publish_editor_revision(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/editor/ffffffff-ffff-4fff-8fff-ffffffffffff/revision-2.docx',
  'revision-2.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'word',1100,repeat('b',64)
);

insert into public.editor_revision_scan_jobs(
  id,owner_id,document_id,revision_id,parent_revision_id,storage_path,name,mime_type,editor_kind,size_bytes,sha256
) values (
  '99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '99999999-9999-4999-8999-999999999999',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/editor/99999999-9999-4999-8999-999999999999/revision-3.docx',
  'revision-3.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'word',1200,repeat('c',64)
);
do $body$
declare v_count integer;
begin
  select count(*) into v_count from public.claim_editor_revision_scan_job('office-ci-worker',120);
  if v_count <> 1 then raise exception 'Office scan queue did not atomically claim one queued revision'; end if;
  if not exists (
    select 1 from public.editor_revision_scan_jobs
    where id='99999999-9999-4999-8999-999999999999'
      and status='scanning' and worker_id='office-ci-worker' and attempt_count=1
      and lease_expires_at > now()
  ) then raise exception 'Office scan lease metadata was not persisted'; end if;
end
$body$;

reset role;
set role authenticated;

do $$
declare
  own_count integer;
  foreign_count integer;
begin
  select count(*) into own_count from public.editor_revisions
  where document_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  select count(*) into foreign_count from public.editor_revisions
  where document_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  if own_count <> 2 then raise exception 'expected two owner revisions, got %', own_count; end if;
  if foreign_count <> 0 then raise exception 'cross-tenant editor revisions visible'; end if;
  if has_table_privilege('authenticated','public.editor_revisions','INSERT') then
    raise exception 'authenticated users unexpectedly have direct revision insert privilege';
  end if;
  if has_function_privilege('authenticated','public.publish_editor_revision(uuid,uuid,uuid,uuid,text,text,text,text,bigint,text)','EXECUTE') then
    raise exception 'authenticated users unexpectedly can publish editor revisions';
  end if;
end
$$;

reset role;
select version, parent_revision_id from public.editor_revisions
where document_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
order by version;
