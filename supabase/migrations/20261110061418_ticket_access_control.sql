-- LOCAL ONLY. Apply only after approval to the selected test environment.
alter table public.events
  add column access_time_zone text not null default 'America/Guatemala' check (access_time_zone = 'America/Guatemala'),
  add column access_grace_minutes integer not null default 120
    check (access_grace_minutes between 0 and 720 and access_grace_minutes % 30 = 0);

create table public.organization_access_links (
  organizer_id uuid primary key references auth.users(id),
  identifier text not null unique default encode(extensions.gen_random_bytes(32), 'hex')
    check (identifier ~ '^[0-9a-f]{64}$')
);
create table public.staff_access_sessions (
  auth_session_id uuid primary key,
  staff_member_id uuid not null references public.staff_members(id),
  created_at timestamptz not null,
  last_activity_at timestamptz not null,
  revoked_at timestamptz
);
create index staff_access_sessions_member_idx on public.staff_access_sessions(staff_member_id);
create table public.ticket_validation_attempts (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id),
  staff_member_id uuid not null references public.staff_members(id),
  operation_id uuid not null,
  event_reference uuid not null,
  event_id uuid references public.events(id) on delete set null,
  ticket_reference uuid,
  ticket_id uuid references public.tickets(id) on delete set null,
  code_digest text not null,
  staff_name text not null,
  event_title text,
  holder_name text,
  ticket_type_name text,
  source text not null check (source in ('camera','manual')),
  result text not null check (result in ('accepted','rejected')),
  reason text,
  http_status integer not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(staff_member_id,operation_id),
  check ((result='accepted' and ticket_reference is not null and reason is null and http_status=200)
    or (result='rejected' and reason is not null and http_status between 400 and 499))
);
create unique index ticket_validation_one_admission on public.ticket_validation_attempts(ticket_reference) where result='accepted';
create index ticket_validation_owner_time_idx on public.ticket_validation_attempts(organizer_id,created_at desc,id desc);
create index ticket_validation_event_time_idx on public.ticket_validation_attempts(organizer_id,event_reference,created_at desc,id desc);
create table private.access_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null,
  requests integer not null
);
alter table public.organization_access_links enable row level security;
alter table public.staff_access_sessions enable row level security;
alter table public.ticket_validation_attempts enable row level security;
alter table private.access_rate_limits enable row level security;
revoke all on public.organization_access_links,public.staff_access_sessions,public.ticket_validation_attempts from public,anon,authenticated;
grant select on public.organization_access_links,public.ticket_validation_attempts to authenticated;
grant all on public.organization_access_links,public.staff_access_sessions,public.ticket_validation_attempts to service_role;
create policy organization_access_links_owner on public.organization_access_links for select to authenticated
  using (organizer_id=(select auth.uid()) and (select private.is_standard_account()));
create policy ticket_validation_attempts_owner on public.ticket_validation_attempts for select to authenticated
  using (organizer_id=(select auth.uid()) and (select private.is_standard_account()));

create function private.access_rate(p_bucket text,p_limit integer,p_seconds integer) returns boolean
language plpgsql set search_path='' as $$
declare n integer; rate_now timestamptz:=clock_timestamp();
begin
  insert into private.access_rate_limits as r values(p_bucket,rate_now,1)
  on conflict(bucket) do update set
    window_started_at=case when r.window_started_at <= rate_now-make_interval(secs=>p_seconds) then rate_now else r.window_started_at end,
    requests=case when r.window_started_at <= rate_now-make_interval(secs=>p_seconds) then 1 else least(r.requests+1,p_limit+1) end
  returning requests into n;
  -- Bounded opportunistic cleanup; never delete an active window.
  delete from private.access_rate_limits where window_started_at < rate_now-interval '1 day' and bucket in
    (select bucket from private.access_rate_limits where window_started_at < rate_now-interval '1 day' limit 20 for update skip locked);
  return n<=p_limit;
end;
$$;
revoke all on function private.access_rate(text,integer,integer) from public,anon,authenticated;

create function private.ensure_access_link() returns text
language plpgsql security definer set search_path='' as $$
declare value text;
begin
  if not private.is_standard_account() then raise exception 'staff_access_denied' using errcode='42501'; end if;
  insert into public.organization_access_links(organizer_id) values(auth.uid()) on conflict do nothing;
  select identifier into value from public.organization_access_links where organizer_id=auth.uid();
  return value;
end;
$$;
revoke all on function private.ensure_access_link() from public,anon,authenticated;
grant execute on function private.ensure_access_link() to authenticated;
create function public.ensure_access_link() returns text language sql security invoker set search_path='' as $$ select private.ensure_access_link(); $$;
revoke all on function public.ensure_access_link() from public,anon,authenticated;
grant execute on function public.ensure_access_link() to authenticated;

-- Only the trusted login server resolves a username. No anonymous enumeration RPC.
create function private.resolve_staff_login(p_link text,p_username text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member public.staff_members%rowtype;
begin
  if p_link is null or p_username is null or p_link !~ '^[0-9a-f]{64}$' or p_username !~ '^[a-z0-9._-]{3,32}$' then
    return jsonb_build_object('error','accessCredentialsInvalid','status',401);
  end if;
  if not private.access_rate('login:global',600,60) then return jsonb_build_object('error','accessRateLimited','status',429); end if;
  if not private.access_rate('login:'||encode(extensions.digest(p_link||':'||p_username,'sha256'),'hex'),10,900) then
    return jsonb_build_object('error','accessRateLimited','status',429);
  end if;
  select s.* into member from public.staff_members s join public.organization_access_links l on l.organizer_id=s.organizer_id
    where l.identifier=p_link and s.username=p_username and s.deleted_at is null and s.is_active and s.provisioning_status='ready';
  if not found then return jsonb_build_object('error','accessCredentialsInvalid','status',401); end if;
  return jsonb_build_object('memberId',member.id,'organizerId',member.organizer_id);
end;
$$;
revoke all on function private.resolve_staff_login(text,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.resolve_staff_login(text,text) to service_role;
create function public.resolve_staff_login(p_link text,p_username text) returns jsonb language sql security invoker set search_path='' as $$ select private.resolve_staff_login(p_link,p_username); $$;
revoke all on function public.resolve_staff_login(text,text) from public,anon,authenticated;
grant execute on function public.resolve_staff_login(text,text) to service_role;

-- Session creation time, not JWT iat, prevents refresh from reviving revoked access.
create function private.access_context(p_link text,p_start boolean default false) returns jsonb
language plpgsql set search_path='' as $$
declare member public.staff_members%rowtype; auth_session record; operational public.staff_access_sessions%rowtype; sid uuid;
begin
  select s.* into member from public.staff_members s join public.organization_access_links l on l.organizer_id=s.organizer_id
    join auth.users u on u.id=s.auth_user_id
    where s.id=auth.uid() and l.identifier=p_link and u.deleted_at is null
      and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=clock_timestamp())
      and u.email=s.id::text||'@staff.invalid' and u.raw_app_meta_data->>'account_type'='access_staff'
      and u.raw_app_meta_data->>'staff_member_id'=s.id::text and u.raw_app_meta_data->>'organizer_id'=s.organizer_id::text
    for share of s;
  if not found then return jsonb_build_object('error','staffAccessDenied','status',403); end if;
  if not member.is_active or member.deleted_at is not null or member.provisioning_status<>'ready' then
    return jsonb_build_object('error','staffAccessDenied','status',403);
  end if;
  begin sid:=(auth.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then return jsonb_build_object('error','sessionRequired','status',401); end;
  select created_at,not_after into auth_session from auth.sessions where id=sid and user_id=member.id for share;
  if not found or auth_session.created_at<=member.access_invalid_before
    or (auth_session.not_after is not null and auth_session.not_after<=clock_timestamp()) then
    return jsonb_build_object('error','sessionRequired','status',401);
  end if;
  if p_start then
    insert into public.staff_access_sessions(auth_session_id,staff_member_id,created_at,last_activity_at)
      values(sid,member.id,auth_session.created_at,auth_session.created_at) on conflict do nothing;
  end if;
  select * into operational from public.staff_access_sessions where auth_session_id=sid and staff_member_id=member.id for update;
  if not found or operational.revoked_at is not null or operational.last_activity_at<=clock_timestamp()-interval '30 minutes' then
    return jsonb_build_object('error','accessSessionExpired','status',401);
  end if;
  return jsonb_build_object('staffMemberId',member.id,'organizerId',member.organizer_id,'name',member.display_name,
    'sessionId',sid,'expiresAt',operational.last_activity_at+interval '30 minutes','serverTime',clock_timestamp());
end;
$$;
revoke all on function private.access_context(text,boolean) from public,anon,authenticated;

create function private.access_window(p_date timestamptz,p_zone text,p_grace integer) returns tstzrange
language sql stable set search_path='' as $$
  select tstzrange(((p_date at time zone p_zone)::date)::timestamp at time zone p_zone,
    (((p_date at time zone p_zone)::date+1)::timestamp+make_interval(mins=>p_grace)) at time zone p_zone,'[)');
$$;
revoke all on function private.access_window(timestamptz,text,integer) from public,anon,authenticated;

create function private.access_result(p_attempt public.ticket_validation_attempts,p_replayed boolean) returns jsonb
language sql set search_path='' as $$
  select case when p_attempt.result='accepted' then jsonb_build_object('operationId',p_attempt.operation_id,
    'result','accepted','holderName',p_attempt.holder_name,'ticketTypeName',p_attempt.ticket_type_name,
    'validatedAt',p_attempt.created_at,'replayed',p_replayed)
  else jsonb_build_object('error',p_attempt.reason,'status',p_attempt.http_status) end;
$$;
revoke all on function private.access_result(public.ticket_validation_attempts,boolean) from public,anon,authenticated;

create function private.staff_access(p_link text,p_action text,p_event_id uuid,p_code text,p_operation_id uuid,p_source text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; member public.staff_members%rowtype; event public.events%rowtype;
  attempt public.ticket_validation_attempts%rowtype; ticket public.tickets%rowtype;
  admission_window tstzrange; reason text; http_status integer:=409; holder text; type_name text; events jsonb; fingerprint text;
begin
  if auth.uid() is null then return jsonb_build_object('error','sessionRequired','status',401); end if;
  perform set_config('lock_timeout','5s',true);
  if p_action is null or p_action not in ('start','session','activity','logout','events','validate','recover') then
    return jsonb_build_object('error','invalidData','status',400); end if;
  if p_action in ('validate','recover') and (p_operation_id is null or p_event_id is null) then
    return jsonb_build_object('error','invalidData','status',400); end if;
  if p_action='validate' and (p_code is null or octet_length(p_code)>1024 or p_source is null or p_source not in ('camera','manual')) then
    return jsonb_build_object('error','invalidData','status',400); end if;
  if p_action in ('validate','recover') then
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_operation_id::text,721));
  end if;
  context:=private.access_context(p_link,p_action='start');
  if context ? 'error' then
    -- Attribute denied operational attempts only to a persisted identity in this
    -- link's organization. Never overwrite an earlier committed admission.
    if p_action='validate' then
      select s.* into member from public.staff_members s join public.organization_access_links l on l.organizer_id=s.organizer_id
        where s.id=auth.uid() and l.identifier=p_link;
      if found and private.access_rate('validation:'||member.id::text,120,60) then
        select * into event from public.events where id=p_event_id and propietario_id=member.organizer_id;
        insert into public.ticket_validation_attempts(organizer_id,staff_member_id,operation_id,event_reference,event_id,
          code_digest,staff_name,event_title,source,result,reason,http_status)
        values(member.organizer_id,member.id,p_operation_id,p_event_id,event.id,
          encode(extensions.digest(p_code,'sha256'),'hex'),member.display_name,event.titulo,p_source,'rejected',context->>'error',(context->>'status')::integer)
        on conflict(staff_member_id,operation_id) do nothing;
      end if;
    end if;
    return context;
  end if;
  if p_action in ('start','session') then return context-'sessionId'; end if;
  if p_action='logout' then
    update public.staff_access_sessions set revoked_at=clock_timestamp() where auth_session_id=(context->>'sessionId')::uuid;
    return jsonb_build_object('signedOut',true);
  end if;
  if p_action='activity' then
    update public.staff_access_sessions set last_activity_at=clock_timestamp() where auth_session_id=(context->>'sessionId')::uuid;
    return jsonb_build_object('expiresAt',clock_timestamp()+interval '30 minutes','serverTime',clock_timestamp());
  end if;
  if p_action='events' then
    select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.titulo,'date',e.fecha,'location',e.lugar,
      'available',e.estado='publicado' and private.access_window(e.fecha,e.access_time_zone,e.access_grace_minutes) @> clock_timestamp(),
      'opensAt',lower(private.access_window(e.fecha,e.access_time_zone,e.access_grace_minutes)),
      'closesAt',upper(private.access_window(e.fecha,e.access_time_zone,e.access_grace_minutes)),
      'status',case when e.estado='publicado' then 'published' else 'draft' end) order by e.fecha,e.id),'[]'::jsonb) into events
      from public.staff_event_assignments a join public.events e on e.id=a.event_id and e.propietario_id=a.organizer_id
      where a.staff_member_id=auth.uid() and a.organizer_id=(context->>'organizerId')::uuid;
    return jsonb_build_object('events',events,'serverTime',clock_timestamp());
  end if;
  select * into member from public.staff_members where id=auth.uid();
  select * into event from public.events where id=p_event_id and propietario_id=member.organizer_id for share;
  if event.id is null then reason:='eventUnavailable'; http_status:=404;
  else
    perform 1 from public.staff_event_assignments where staff_member_id=member.id and event_id=event.id and organizer_id=member.organizer_id for share;
    if not found then reason:='eventUnavailable'; http_status:=404; end if;
  end if;
  if p_action='recover' then
    if reason is not null then return jsonb_build_object('error',reason,'status',http_status); end if;
    if not private.access_rate('recovery:'||(context->>'sessionId'),120,60) then return jsonb_build_object('error','accessRateLimited','status',429); end if;
    select * into attempt from public.ticket_validation_attempts where staff_member_id=member.id and operation_id=p_operation_id and event_reference=p_event_id;
    if not found then return jsonb_build_object('status',202,'result','unconfirmed'); end if;
    return private.access_result(attempt,true);
  end if;
  fingerprint:=encode(extensions.digest(p_code,'sha256'),'hex');
  select * into attempt from public.ticket_validation_attempts where staff_member_id=member.id and operation_id=p_operation_id;
  if found then
    if attempt.code_digest<>fingerprint or attempt.event_reference<>p_event_id then return jsonb_build_object('error','accessOperationConflict','status',409); end if;
    if reason is not null then return jsonb_build_object('error',reason,'status',http_status); end if;
    return private.access_result(attempt,true);
  end if;
  if not private.access_rate('validation:'||member.id::text,120,60) then return jsonb_build_object('error','accessRateLimited','status',429); end if;
  update public.staff_access_sessions set last_activity_at=clock_timestamp() where auth_session_id=(context->>'sessionId')::uuid;
  if reason is null and p_code !~ '^[0-9a-f]{64}$' then reason:='accessCodeInvalid'; http_status:=400; end if;
  if reason is null then
    select t.* into ticket from public.tickets t join public.registrations r on r.id=t.registro_id
      where r.evento_id=event.id and t.codigo=p_code for update of t;
    admission_window:=private.access_window(event.fecha,event.access_time_zone,event.access_grace_minutes);
    if event.estado<>'publicado' then reason:='accessEventUnavailable';
    elsif not (admission_window @> clock_timestamp()) then reason:='accessOutsideWindow';
    elsif ticket.id is null then reason:='accessTicketNotFound';
    elsif ticket.estado='used' then reason:='accessTicketUsed';
    elsif ticket.estado='revoked' then reason:='accessTicketRevoked';
    else
      select r.nombre_titular,tt.nombre into holder,type_name from public.registrations r join public.ticket_types tt on tt.id=r.tipo_entrada_id where r.id=ticket.registro_id;
      update public.tickets set estado='used' where id=ticket.id and estado='valid';
      if not found then raise exception 'Concurrent ticket update'; end if;
    end if;
  end if;
  insert into public.ticket_validation_attempts(organizer_id,staff_member_id,operation_id,event_reference,event_id,
    ticket_reference,ticket_id,code_digest,staff_name,event_title,holder_name,ticket_type_name,source,result,reason,http_status)
  values(member.organizer_id,member.id,p_operation_id,p_event_id,event.id,ticket.id,ticket.id,fingerprint,member.display_name,
    event.titulo,holder,type_name,p_source,case when reason is null then 'accepted' else 'rejected' end,reason,case when reason is null then 200 else http_status end)
  returning * into attempt;
  return private.access_result(attempt,false);
end;
$$;
revoke all on function private.staff_access(text,text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function private.staff_access(text,text,uuid,text,uuid,text) to authenticated;
create function public.staff_access(p_link text,p_action text,p_event_id uuid default null,p_code text default null,p_operation_id uuid default null,p_source text default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.staff_access(p_link,p_action,p_event_id,p_code,p_operation_id,p_source); $$;
revoke all on function public.staff_access(text,text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.staff_access(text,text,uuid,text,uuid,text) to authenticated;

create function private.validation_history_events() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_standard_account() then raise exception 'staff_access_denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'deleted',x.deleted) order by x.title,x.id),'[]'::jsonb) into result
  from (
    select e.id,e.titulo as title,false as deleted from public.events e where e.propietario_id=auth.uid()
    union all
    select h.event_reference,h.event_title,true from (
      select distinct on (a.event_reference) a.event_reference,a.event_title from public.ticket_validation_attempts a
      where a.organizer_id=auth.uid() and a.event_id is null and a.event_title is not null
      order by a.event_reference,a.created_at desc,a.id desc
    ) h
  ) x;
  return result;
end;
$$;
revoke all on function private.validation_history_events() from public,anon,authenticated;
grant execute on function private.validation_history_events() to authenticated;
create function public.validation_history_events() returns jsonb language sql security invoker set search_path='' as $$ select private.validation_history_events(); $$;
revoke all on function public.validation_history_events() from public,anon,authenticated;
grant execute on function public.validation_history_events() to authenticated;

-- Preserve revocation; all new admissions must use the audited operational RPC.
create or replace function public.cambiar_estado_ticket(p_codigo text,p_estado text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ticket public.tickets%rowtype;
begin
  if not private.is_standard_account() then return jsonb_build_object('estado','sesion_requerida'); end if;
  if p_estado is distinct from 'revoked' then return jsonb_build_object('estado','datos_invalidos'); end if;
  select t.* into ticket from public.tickets t join public.registrations r on r.id=t.registro_id
    join public.events e on e.id=r.evento_id where t.codigo=p_codigo and e.propietario_id=auth.uid() for update of t;
  if not found then return jsonb_build_object('estado','no_autorizado'); end if;
  update public.tickets set estado='revoked' where id=ticket.id;
  return jsonb_build_object('estado','actualizado','ticket_estado','revoked');
end;
$$;
