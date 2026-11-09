create type public.estado_ticket as enum ('valid', 'used', 'revoked');

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null unique references public.registros(id) on delete cascade,
  -- Two independent cryptographic UUIDv4 values: 244 random bits, no sequences.
  codigo text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  estado public.estado_ticket not null default 'valid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tickets_codigo_formato check (codigo ~ '^[0-9a-f]{64}$')
);
alter table public.tickets enable row level security;
revoke all on public.tickets from public, anon, authenticated;
grant select on public.tickets to authenticated;
create policy tickets_leer on public.tickets for select to authenticated using (
  exists (select 1 from public.registros r join public.eventos e on e.id = r.evento_id
    where r.id = registro_id and (r.comprador_id = (select auth.uid()) or e.propietario_id = (select auth.uid())))
);

-- Emission and registration are one transaction. Retries never insert another ticket.
create function private.emitir_ticket() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tickets (registro_id) values (new.id);
  return new;
end;
$$;
revoke all on function private.emitir_ticket() from public, anon, authenticated;
create trigger emitir_ticket after insert on public.registros
  for each row execute function private.emitir_ticket();

-- Preserve previously confirmed registrations and their folios.
insert into public.tickets (registro_id) select id from public.registros;

create function private.validar_ticket() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.registro_id is distinct from old.registro_id
    or new.codigo is distinct from old.codigo or new.created_at is distinct from old.created_at then
    raise exception 'La identidad de una entrada no puede cambiar';
  end if;
  if (old.estado = 'revoked' and new.estado <> old.estado)
    or (old.estado = 'used' and new.estado = 'valid') then
    raise exception 'Una entrada usada o revocada no puede reactivarse';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.validar_ticket() from public, anon, authenticated;
create trigger validar_ticket before update on public.tickets
  for each row execute function private.validar_ticket();

-- Reuse the existing registration, capacity checks and idempotency implementation.
alter function public.confirmar_registro(uuid, uuid, text, text, uuid) set schema private;
revoke all on function private.confirmar_registro(uuid, uuid, text, text, uuid) from public, anon, authenticated;
create function public.confirmar_registro(
  p_evento_id uuid, p_tipo_entrada_id uuid, p_nombre text, p_correo text, p_clave uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  resultado jsonb;
  entrada public.tickets%rowtype;
begin
  resultado := private.confirmar_registro(p_evento_id, p_tipo_entrada_id, p_nombre, p_correo, p_clave);
  if resultado->>'estado' = 'confirmado' then
    select * into strict entrada from public.tickets where registro_id = (resultado->>'folio')::uuid;
    return resultado || jsonb_build_object('ticket', jsonb_build_object('codigo', entrada.codigo, 'estado', entrada.estado));
  end if;
  return resultado;
end;
$$;
revoke all on function public.confirmar_registro(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.confirmar_registro(uuid, uuid, text, text, uuid) to authenticated;

-- The full secret code is the only public lookup key. There is no public listing.
create function public.consultar_ticket(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if p_codigo is null or p_codigo !~ '^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object('estado', t.estado, 'nombre_titular', r.nombre_titular,
    'correo_titular', r.correo_titular, 'tipo_entrada', te.nombre,
    'evento', jsonb_build_object('titulo', e.titulo, 'fecha', e.fecha, 'lugar', e.lugar,
      'publicado', e.estado = 'publicado', 'pasado', e.fecha <= statement_timestamp())) into resultado
  from public.tickets t join public.registros r on r.id = t.registro_id
    join public.eventos e on e.id = r.evento_id join public.tipos_entrada te on te.id = r.tipo_entrada_id
  where t.codigo = p_codigo;
  return resultado;
end;
$$;
revoke all on function public.consultar_ticket(text) from public, anon, authenticated;
grant execute on function public.consultar_ticket(text) to anon, authenticated;

-- Viewing/scanning the public page NEVER changes the ticket. Only its organizer
-- may explicitly consume or revoke it. Locking serializes simultaneous scans.
create function public.cambiar_estado_ticket(p_codigo text, p_estado text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare entrada public.tickets%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('estado', 'sesion_requerida'); end if;
  if p_estado is null or p_estado not in ('used', 'revoked') then
    return jsonb_build_object('estado', 'datos_invalidos');
  end if;
  select t.* into entrada from public.tickets t
    join public.registros r on r.id = t.registro_id join public.eventos e on e.id = r.evento_id
    where t.codigo = p_codigo and e.propietario_id = auth.uid() for update of t;
  if not found then return jsonb_build_object('estado', 'no_autorizado'); end if;
  if entrada.estado = 'revoked' and p_estado <> 'revoked' then
    return jsonb_build_object('estado', 'ticket_revocado');
  end if;
  if entrada.estado = 'used' and p_estado = 'used' then
    return jsonb_build_object('estado', 'ya_usada');
  end if;
  update public.tickets set estado = p_estado::public.estado_ticket where id = entrada.id;
  return jsonb_build_object('estado', 'actualizado', 'ticket_estado', p_estado);
end;
$$;
revoke all on function public.cambiar_estado_ticket(text, text) from public, anon, authenticated;
grant execute on function public.cambiar_estado_ticket(text, text) to authenticated;

-- Extend the existing private buyer listing; do not introduce a second listing.
create or replace function public.mis_boletos(p_evento_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  comprador uuid := auth.uid();
  resultado jsonb;
begin
  if comprador is null then
    raise exception 'Se requiere una sesión válida' using errcode = '42501';
  end if;
  select jsonb_build_object('comprador_id', comprador, 'ahora', statement_timestamp(), 'eventos', coalesce(jsonb_agg(
    jsonb_build_object('id', e.id, 'titulo', e.titulo, 'fecha', e.fecha,
      'lugar', e.lugar, 'estado', e.estado,
      'boletos', (select jsonb_agg(jsonb_build_object(
        'id', r.id, 'nombre_titular', r.nombre_titular, 'correo_titular', r.correo_titular,
        'tipo_entrada', te.nombre, 'created_at', r.created_at,
        'ticket', jsonb_build_object('codigo', t.codigo, 'estado', t.estado)
      ) order by r.created_at, r.id)
        from public.registros r join public.tipos_entrada te on te.id = r.tipo_entrada_id
          join public.tickets t on t.registro_id = r.id
        where r.evento_id = e.id and r.comprador_id = comprador)
    ) order by e.fecha, e.id), '[]'::jsonb)) into resultado
  from public.eventos e
  where (p_evento_id is null or e.id = p_evento_id)
    and exists (select 1 from public.registros r where r.evento_id = e.id and r.comprador_id = comprador);
  return resultado;
end;
$$;
revoke all on function public.mis_boletos(uuid) from public, anon, authenticated;
grant execute on function public.mis_boletos(uuid) to authenticated;
