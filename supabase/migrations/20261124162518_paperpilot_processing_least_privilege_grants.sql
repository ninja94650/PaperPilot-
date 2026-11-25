-- Keep queue and revision tables read-only to authenticated clients.
-- All writes are performed by server routes using the server-only admin client.
revoke all privileges on table public.processing_jobs from anon, authenticated;
grant select on table public.processing_jobs to authenticated;

revoke all privileges on table public.processing_job_events from anon, authenticated;
grant select on table public.processing_job_events to authenticated;

revoke all privileges on table public.document_revisions from anon, authenticated;
grant select on table public.document_revisions to authenticated;
