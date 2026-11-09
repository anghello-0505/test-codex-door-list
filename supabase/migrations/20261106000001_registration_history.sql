-- Existing publication dates were not recorded; creation is an approximate start.
alter table public.events add column published_at timestamptz;
alter table public.events add column publication_date_estimated boolean not null default false;
update public.events e set published_at = e.created_at, publication_date_estimated = true
where e.estado = 'publicado' or exists (select 1 from public.registrations r where r.evento_id = e.id);

create function private.record_event_publication() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.published_at := null;
    new.publication_date_estimated := false;
  else
    new.published_at := old.published_at;
    new.publication_date_estimated := old.publication_date_estimated;
    if old.published_at is null and old.estado <> 'publicado' and new.estado = 'publicado' then
      new.published_at := statement_timestamp();
      new.publication_date_estimated := false;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.record_event_publication() from public, anon, authenticated;
create trigger record_event_publication before insert or update on public.events
  for each row execute function private.record_event_publication();

create function public.registration_history(p_event_id uuid)
returns table(day date, total bigint)
language sql stable security invoker set search_path = '' as $$
  select d.day::date, count(r.id)
  from public.events e
  cross join lateral generate_series(
    (e.published_at at time zone 'America/Guatemala')::date,
    (statement_timestamp() at time zone 'America/Guatemala')::date,
    interval '1 day'
  ) d(day)
  left join public.registrations r on r.evento_id = e.id
    and (r.created_at at time zone 'America/Guatemala')::date = d.day::date
  where e.id = p_event_id and e.published_at is not null
  group by d.day order by d.day;
$$;
revoke all on function public.registration_history(uuid) from public, anon, authenticated;
grant execute on function public.registration_history(uuid) to service_role;
