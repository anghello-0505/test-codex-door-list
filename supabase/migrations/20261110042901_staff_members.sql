-- Stage 1: organizer-managed access personnel. Auth login remains banned.
-- This migration is local until separately approved for remote application.
create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id),
  auth_user_id uuid unique references auth.users(id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 200 and display_name !~ '[[:cntrl:]]'),
  username text not null check (username = lower(btrim(username)) and username ~ '^[a-z0-9._-]{3,32}$'),
  is_active boolean not null default true,
  deleted_at timestamptz,
  provisioning_status text not null default 'pending' check (provisioning_status in ('pending', 'ready')),
  creation_key uuid not null,
  access_invalid_before timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint staff_members_identity_check check (auth_user_id is null or auth_user_id = id),
  constraint staff_members_ready_check check (provisioning_status <> 'ready' or auth_user_id is not null),
  constraint staff_members_deleted_check check (deleted_at is null or not is_active),
  constraint staff_members_owner_key unique (id, organizer_id),
  constraint staff_members_creation_key unique (organizer_id, creation_key)
);
create unique index staff_members_username_key on public.staff_members (organizer_id, username) where deleted_at is null;
create index staff_members_owner_created_idx on public.staff_members (organizer_id, created_at desc, id) where deleted_at is null;

alter table public.events add constraint events_id_owner_key unique (id, propietario_id);
create table public.staff_event_assignments (
  staff_member_id uuid not null,
  event_id uuid not null,
  organizer_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (staff_member_id, event_id),
  foreign key (staff_member_id, organizer_id) references public.staff_members(id, organizer_id),
  foreign key (event_id, organizer_id) references public.events(id, propietario_id) on delete cascade
);
create index staff_event_assignments_owner_idx on public.staff_event_assignments (organizer_id, staff_member_id, event_id);
create index staff_event_assignments_event_idx on public.staff_event_assignments (event_id, organizer_id);

alter table public.staff_members enable row level security;
alter table public.staff_event_assignments enable row level security;
revoke all on public.staff_members, public.staff_event_assignments from public, anon, authenticated;
grant select on public.staff_members, public.staff_event_assignments to authenticated;
grant all on public.staff_members, public.staff_event_assignments to service_role;

-- Read only the caller's current identity; user_metadata and stale JWT roles
-- cannot turn a staff account into a buyer/organizer. The table check also
-- retains the distinction if Auth metadata is accidentally removed later.
create function private.is_standard_account() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.raw_app_meta_data->>'account_type', '') <> 'access_staff'
      and not coalesce(u.is_anonymous, false) and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= statement_timestamp())
      and not exists (select 1 from public.staff_members s where s.id = u.id)
  );
$$;
revoke all on function private.is_standard_account() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_standard_account() to authenticated;

create policy staff_members_read on public.staff_members for select to authenticated
using (organizer_id = (select auth.uid()) and (select private.is_standard_account()));
create policy staff_event_assignments_read on public.staff_event_assignments for select to authenticated
using (organizer_id = (select auth.uid()) and (select private.is_standard_account()));

create function public.is_organizer_account() returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.is_standard_account();
$$;
revoke all on function public.is_organizer_account() from public, anon, authenticated;
grant execute on function public.is_organizer_account() to authenticated;

-- This helper is not executable by app roles. Its privileged caller has already
-- locked and verified the staff member, and supplies its immutable owner.
create function private.replace_staff_event_assignments(p_staff_id uuid, p_owner_id uuid, p_event_ids uuid[]) returns void
language plpgsql set search_path = '' as $$
declare event_count integer;
begin
  if p_event_ids is null or cardinality(p_event_ids) > 1000
    or array_position(p_event_ids, null) is not null
    or cardinality(p_event_ids) <> (select count(distinct value) from unnest(p_event_ids) value) then
    raise exception 'Invalid event IDs' using errcode = '22023';
  end if;
  perform 1 from public.events where id = any(p_event_ids) and propietario_id = p_owner_id order by id for key share;
  get diagnostics event_count = row_count;
  if event_count <> cardinality(p_event_ids) then raise exception 'staff_invalid_events'; end if;
  delete from public.staff_event_assignments where staff_member_id = p_staff_id and not (event_id = any(p_event_ids));
  insert into public.staff_event_assignments (staff_member_id, event_id, organizer_id)
    select p_staff_id, value, p_owner_id from unnest(p_event_ids) value on conflict do nothing;
end;
$$;
revoke all on function private.replace_staff_event_assignments(uuid, uuid, uuid[]) from public, anon, authenticated;

create function private.reserve_staff_member(p_name text, p_username text, p_event_ids uuid[], p_creation_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); member public.staff_members%rowtype; existing_events uuid[];
begin
  if not private.is_standard_account() then raise exception 'staff_access_denied' using errcode = '42501'; end if;
  if p_creation_key is null or p_name is null or p_username is null or p_event_ids is null
    or cardinality(p_event_ids) > 1000 or array_position(p_event_ids, null) is not null
    or cardinality(p_event_ids) <> (select count(distinct value) from unnest(p_event_ids) value) then
    raise exception 'Invalid data' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || p_creation_key::text, 914));
  select * into member from public.staff_members where organizer_id = owner_id and creation_key = p_creation_key for update;
  if found then
    select coalesce(array_agg(event_id order by event_id), '{}'::uuid[]) into existing_events
      from public.staff_event_assignments where staff_member_id = member.id;
    if member.deleted_at is not null or member.display_name <> btrim(p_name) or member.username <> lower(btrim(p_username))
      or existing_events is distinct from (select coalesce(array_agg(value order by value), '{}'::uuid[]) from unnest(p_event_ids) value) then
      raise exception 'staff_conflict';
    end if;
    return member.id;
  end if;
  insert into public.staff_members (organizer_id, display_name, username, creation_key)
    values (owner_id, btrim(p_name), lower(btrim(p_username)), p_creation_key) returning * into member;
  perform private.replace_staff_event_assignments(member.id, owner_id, p_event_ids);
  return member.id;
end;
$$;
revoke all on function private.reserve_staff_member(text, text, uuid[], uuid) from public, anon, authenticated;
grant execute on function private.reserve_staff_member(text, text, uuid[], uuid) to authenticated;
create function public.reserve_staff_member(p_name text, p_username text, p_event_ids uuid[], p_creation_key uuid) returns uuid
language sql security invoker set search_path = '' as $$
  select private.reserve_staff_member(p_name, p_username, p_event_ids, p_creation_key);
$$;
revoke all on function public.reserve_staff_member(text, text, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.reserve_staff_member(text, text, uuid[], uuid) to authenticated;

create function private.manage_staff_member(p_staff_id uuid, p_action text, p_values jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); member public.staff_members%rowtype; event_ids uuid[];
begin
  if not private.is_standard_account() then raise exception 'staff_access_denied' using errcode = '42501'; end if;
  select * into member from public.staff_members where id = p_staff_id and organizer_id = owner_id and deleted_at is null for update;
  if not found then raise exception 'staff_unavailable'; end if;
  if jsonb_typeof(p_values) is distinct from 'object' then raise exception 'Invalid data' using errcode = '22023'; end if;
  if p_action = 'delete' then
    update public.staff_members set is_active = false, deleted_at = clock_timestamp(), access_invalid_before = clock_timestamp(), updated_at = clock_timestamp() where id = member.id;
    return;
  end if;
  if p_action = 'complete' then
    if not exists (select 1 from auth.users u where u.id = member.id and u.email = member.id::text || '@staff.invalid'
      and u.raw_app_meta_data->>'account_type' = 'access_staff'
      and u.raw_app_meta_data->>'staff_member_id' = member.id::text
      and u.raw_app_meta_data->>'organizer_id' = owner_id::text
      and u.banned_until > statement_timestamp() and u.deleted_at is null) then raise exception 'staff_conflict'; end if;
    update public.staff_members set auth_user_id = member.id, provisioning_status = 'ready', updated_at = clock_timestamp() where id = member.id;
    return;
  end if;
  if member.provisioning_status <> 'ready' then raise exception 'staff_conflict'; end if;
  if p_action = 'update' then
    if (p_values - array['name', 'username', 'isActive']::text[]) <> '{}'::jsonb or p_values = '{}'::jsonb then
      raise exception 'Invalid data' using errcode = '22023';
    end if;
    if p_values ? 'isActive' then
      if jsonb_typeof(p_values->'isActive') <> 'boolean' or p_values ? 'name' or p_values ? 'username' then
        raise exception 'Invalid state' using errcode = '22023';
      end if;
      update public.staff_members set is_active = (p_values->>'isActive')::boolean,
        access_invalid_before = clock_timestamp(), updated_at = clock_timestamp() where id = member.id;
    else
      if jsonb_typeof(p_values->'name') is distinct from 'string' or jsonb_typeof(p_values->'username') is distinct from 'string' then
        raise exception 'Invalid details' using errcode = '22023';
      end if;
      update public.staff_members set display_name = btrim(p_values->>'name'), username = lower(btrim(p_values->>'username')), updated_at = clock_timestamp() where id = member.id;
    end if;
  elsif p_action = 'events' then
    if (p_values - 'eventIds') <> '{}'::jsonb or jsonb_typeof(p_values->'eventIds') is distinct from 'array' then
      raise exception 'Invalid events' using errcode = '22023';
    end if;
    event_ids := array(select value::uuid from jsonb_array_elements_text(p_values->'eventIds') value);
    perform private.replace_staff_event_assignments(member.id, owner_id, event_ids);
    update public.staff_members set updated_at = clock_timestamp() where id = member.id;
  elsif p_action = 'invalidate' then
    update public.staff_members set access_invalid_before = clock_timestamp(), updated_at = clock_timestamp() where id = member.id;
  else
    raise exception 'Invalid action' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.manage_staff_member(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function private.manage_staff_member(uuid, text, jsonb) to authenticated;
create function public.manage_staff_member(p_staff_id uuid, p_action text, p_values jsonb default '{}'::jsonb) returns void
language sql security invoker set search_path = '' as $$
  select private.manage_staff_member(p_staff_id, p_action, p_values);
$$;
revoke all on function public.manage_staff_member(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.manage_staff_member(uuid, text, jsonb) to authenticated;

-- Staff must not inherit the existing platform's buyer/organizer permissions,
-- even if a token is issued outside the planned login UI. Restrictive policies
-- combine with existing permissive ownership policies (they do not replace them).
create policy events_standard_accounts on public.events as restrictive for all to authenticated
  using ((select private.is_standard_account())) with check ((select private.is_standard_account()));
create policy ticket_types_standard_accounts on public.ticket_types as restrictive for all to authenticated
  using ((select private.is_standard_account())) with check ((select private.is_standard_account()));
create policy registrations_standard_accounts on public.registrations as restrictive for all to authenticated
  using ((select private.is_standard_account())) with check ((select private.is_standard_account()));
create policy tickets_standard_accounts on public.tickets as restrictive for all to authenticated
  using ((select private.is_standard_account())) with check ((select private.is_standard_account()));
create policy ticket_deliveries_standard_accounts on public.ticket_deliveries as restrictive for all to authenticated
  using ((select private.is_standard_account())) with check ((select private.is_standard_account()));

-- Preserve existing RPC behavior for normal accounts; RLS cannot protect these definers.
create or replace function public.confirmar_registro(
  p_evento_id uuid, p_tipo_entrada_id uuid, p_nombre text, p_correo text, p_clave uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare resultado jsonb; entrada public.tickets%rowtype;
begin
  if not private.is_standard_account() then return jsonb_build_object('estado', 'sesion_requerida'); end if;
  resultado := private.confirmar_registro(p_evento_id, p_tipo_entrada_id, p_nombre, p_correo, p_clave);
  if resultado->>'estado' = 'confirmado' then
    select * into strict entrada from public.tickets where registro_id = (resultado->>'folio')::uuid;
    return resultado || jsonb_build_object('ticket', jsonb_build_object('codigo', entrada.codigo, 'estado', entrada.estado));
  end if;
  return resultado;
end;
$$;

create or replace function public.mis_boletos(p_evento_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare comprador uuid := auth.uid(); resultado jsonb;
begin
  if not private.is_standard_account() then raise exception 'staff_access_denied' using errcode = '42501'; end if;
  if comprador is null then raise exception 'Se requiere una sesión válida' using errcode = '42501'; end if;
  select jsonb_build_object('comprador_id', comprador, 'ahora', statement_timestamp(), 'eventos', coalesce(jsonb_agg(
    jsonb_build_object('id', e.id, 'titulo', e.titulo, 'fecha', e.fecha, 'lugar', e.lugar, 'estado', e.estado,
      'boletos', (select jsonb_agg(jsonb_build_object(
        'id', r.id, 'nombre_titular', r.nombre_titular, 'correo_titular', r.correo_titular,
        'tipo_entrada', te.nombre, 'created_at', r.created_at,
        'ticket', jsonb_build_object('codigo', t.codigo, 'estado', t.estado)
      ) order by r.created_at, r.id)
        from public.registrations r join public.ticket_types te on te.id = r.tipo_entrada_id
          join public.tickets t on t.registro_id = r.id
        where r.evento_id = e.id and r.comprador_id = comprador)
    ) order by e.fecha, e.id), '[]'::jsonb)) into resultado
  from public.events e where (p_evento_id is null or e.id = p_evento_id)
    and exists (select 1 from public.registrations r where r.evento_id = e.id and r.comprador_id = comprador);
  return resultado;
end;
$$;

create or replace function public.cambiar_estado_ticket(p_codigo text, p_estado text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare entrada public.tickets%rowtype;
begin
  if not private.is_standard_account() then return jsonb_build_object('estado', 'sesion_requerida'); end if;
  if auth.uid() is null then return jsonb_build_object('estado', 'sesion_requerida'); end if;
  if p_estado is null or p_estado not in ('used', 'revoked') then return jsonb_build_object('estado', 'datos_invalidos'); end if;
  select t.* into entrada from public.tickets t join public.registrations r on r.id = t.registro_id
    join public.events e on e.id = r.evento_id where t.codigo = p_codigo and e.propietario_id = auth.uid() for update of t;
  if not found then return jsonb_build_object('estado', 'no_autorizado'); end if;
  if entrada.estado = 'revoked' and p_estado <> 'revoked' then return jsonb_build_object('estado', 'ticket_revocado'); end if;
  if entrada.estado = 'used' and p_estado = 'used' then return jsonb_build_object('estado', 'ya_usada'); end if;
  update public.tickets set estado = p_estado::public.estado_ticket where id = entrada.id;
  return jsonb_build_object('estado', 'actualizado', 'ticket_estado', p_estado);
end;
$$;

create or replace function public.estado_envios_entrada(p_registro uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'destinatario',j.destinatario,
    'estado',j.estado,'ultimo_intento',j.ultimo_intento,'bloqueo_hasta',j.bloqueo_hasta) order by j.created_at,j.id),'[]'::jsonb)
  from public.ticket_deliveries j join public.tickets t on t.id=j.ticket_id
  join public.registrations r on r.id=t.registro_id where r.id=p_registro and r.comprador_id=auth.uid() and private.is_standard_account();
$$;
