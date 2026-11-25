-- Add a fixed per-user quota for Office cloud revision publication.
alter table public.processing_api_rate_limits
  drop constraint if exists processing_api_rate_limits_bucket_check;
alter table public.processing_api_rate_limits
  add constraint processing_api_rate_limits_bucket_check
  check (bucket in ('job:create','job:status','job:cancel','job:download','editor:revision'));

create or replace function public.consume_processing_api_rate_limit(p_bucket text)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_limit integer;
  v_window integer := 60;
  v_window_start timestamptz;
  v_count integer;
  v_allowed boolean;
  v_retry integer;
begin
  if v_owner is null then
    raise exception 'authentication_required';
  end if;

  case p_bucket
    when 'job:create' then v_limit := 10;
    when 'job:status' then v_limit := 60;
    when 'job:cancel' then v_limit := 10;
    when 'job:download' then v_limit := 10;
    when 'editor:revision' then v_limit := 10;
    else raise exception 'invalid_rate_limit_bucket';
  end case;

  v_window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from pg_catalog.now()) / v_window) * v_window
  );

  delete from public.processing_api_rate_limits
  where owner_id = v_owner and window_start < pg_catalog.now() - interval '1 day';

  insert into public.processing_api_rate_limits(owner_id,bucket,window_start,request_count)
  values(v_owner,p_bucket,v_window_start,1)
  on conflict(owner_id,bucket,window_start)
  do update set request_count = public.processing_api_rate_limits.request_count + 1
  where public.processing_api_rate_limits.request_count < v_limit
  returning request_count into v_count;

  if found then
    v_allowed := true;
  else
    select request_count into v_count
    from public.processing_api_rate_limits
    where owner_id=v_owner and bucket=p_bucket and window_start=v_window_start;
    v_allowed := false;
  end if;

  v_retry := greatest(1,ceil(extract(epoch from (v_window_start + pg_catalog.make_interval(secs=>v_window) - pg_catalog.now())))::integer);
  return query select v_allowed,greatest(0,v_limit-v_count),v_retry;
end;
$$;

revoke all on function public.consume_processing_api_rate_limit(text) from public,anon;
grant execute on function public.consume_processing_api_rate_limit(text) to authenticated;
