-- Apply through the project's deployment procedure, with owner approval.
create table public.registros (
  id uuid primary key default gen_random_uuid(),
  comprador_id uuid not null references auth.users(id),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  tipo_entrada_id uuid not null references public.tipos_entrada(id),
  nombre_titular text not null check (length(btrim(nombre_titular)) between 1 and 200 and nombre_titular ~ '[^[:space:]]'),
  correo_titular text not null check (
    length(correo_titular) <= 254 and correo_titular ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  clave_idempotencia uuid not null,
  created_at timestamptz not null default now(),
  unique (comprador_id, clave_idempotencia)
);
create index registros_tipo_idx on public.registros(tipo_entrada_id);
create index registros_evento_idx on public.registros(evento_id);
alter table public.registros enable row level security;
revoke all on public.registros from anon, authenticated;
grant select on public.registros to authenticated;
create policy registros_leer on public.registros for select to authenticated using (
  comprador_id = (select auth.uid()) or exists (
    select 1 from public.eventos e where e.id = evento_id and e.propietario_id = (select auth.uid())
  )
);

-- Only aggregate availability is public; no purchaser or holder data escapes.
create function public.eventos_disponibles(p_evento_id uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ahora', statement_timestamp(), 'eventos', coalesce(jsonb_agg(
    jsonb_build_object('id', e.id, 'titulo', e.titulo, 'descripcion', e.descripcion,
      'fecha', e.fecha, 'lugar', e.lugar, 'abierto', e.fecha > statement_timestamp(),
      'tipos_entrada', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nombre', t.nombre, 'aforo_maximo', t.aforo_maximo,
        'disponibles', greatest(0, t.aforo_maximo - (
          select count(*) from public.registros r where r.tipo_entrada_id = t.id
        ))) order by t.nombre), '[]'::jsonb)
        from public.tipos_entrada t where t.evento_id = e.id)
    ) order by e.fecha), '[]'::jsonb))
  from public.eventos e where e.estado = 'publicado'
    and (p_evento_id is null or (e.id = p_evento_id and e.fecha > statement_timestamp()));
$$;
revoke all on function public.eventos_disponibles(uuid) from public, anon, authenticated;
grant execute on function public.eventos_disponibles(uuid) to anon, authenticated;

create function public.confirmar_registro(
  p_evento_id uuid, p_tipo_entrada_id uuid, p_nombre text, p_correo text, p_clave uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  comprador uuid := auth.uid();
  evento public.eventos%rowtype;
  entrada public.tipos_entrada%rowtype;
  registro public.registros%rowtype;
begin
  if comprador is null then return jsonb_build_object('estado', 'sesion_requerida'); end if;
  if p_clave is null then return jsonb_build_object('estado', 'datos_invalidos'); end if;
  -- Serialize retries even if a caller reuses a key with a different event.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(comprador::text || p_clave::text, 0));
  select * into registro from public.registros
    where comprador_id = comprador and clave_idempotencia = p_clave;
  if found then
    if registro.evento_id is distinct from p_evento_id or registro.tipo_entrada_id is distinct from p_tipo_entrada_id
      or registro.nombre_titular is distinct from btrim(p_nombre) or registro.correo_titular is distinct from lower(btrim(p_correo)) then
      return jsonb_build_object('estado', 'datos_invalidos');
    end if;
    return jsonb_build_object('estado', 'confirmado', 'folio', registro.id);
  end if;
  if p_nombre is null or length(btrim(p_nombre)) not between 1 and 200 or p_nombre !~ '[^[:space:]]'
    or p_correo is null or length(btrim(p_correo)) > 254
    or btrim(p_correo) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('estado', 'datos_invalidos');
  end if;
  -- Same parent lock as publication/capacity updates. Check the clock AFTER waiting.
  select * into evento from public.eventos where id = p_evento_id for update;
  if not found or evento.estado <> 'publicado' or evento.fecha <= clock_timestamp() then
    return jsonb_build_object('estado', 'evento_no_disponible');
  end if;
  select * into entrada from public.tipos_entrada where id = p_tipo_entrada_id and evento_id = evento.id;
  if not found then return jsonb_build_object('estado', 'entrada_invalida'); end if;
  if (select count(*) from public.registros where tipo_entrada_id = entrada.id) >= entrada.aforo_maximo then
    return jsonb_build_object('estado', 'entrada_agotada');
  end if;
  insert into public.registros(comprador_id, evento_id, tipo_entrada_id, nombre_titular, correo_titular, clave_idempotencia)
    values (comprador, evento.id, entrada.id, btrim(p_nombre), lower(btrim(p_correo)), p_clave)
    returning * into registro;
  return jsonb_build_object('estado', 'confirmado', 'folio', registro.id);
end;
$$;
revoke all on function public.confirmar_registro(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.confirmar_registro(uuid, uuid, text, text, uuid) to authenticated;

-- Keep the existing event/type capacity invariant and protect sold capacity too.
create or replace function private.validar_aforo_tipo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  limite integer;
  asignado bigint;
begin
  select aforo_maximo into limite from public.eventos where id = new.evento_id for update;
  select coalesce(sum(aforo_maximo), 0) into asignado from public.tipos_entrada
    where evento_id = new.evento_id and id <> new.id;
  if asignado + new.aforo_maximo > limite then
    raise exception 'La suma de los aforos de los tipos de entrada supera el aforo del evento';
  end if;
  if new.aforo_maximo < (select count(*) from public.registros where tipo_entrada_id = new.id) then
    raise exception 'El aforo no puede ser menor que los boletos registrados';
  end if;
  return new;
end;
$$;
revoke all on function private.validar_aforo_tipo() from public, anon, authenticated;

-- Deferred NO ACTION permits a full event cascade, but blocks deleting a used type.
alter table public.registros drop constraint registros_tipo_entrada_id_fkey;
alter table public.registros add constraint registros_tipo_entrada_id_fkey
  foreign key (tipo_entrada_id) references public.tipos_entrada(id) deferrable initially deferred;
