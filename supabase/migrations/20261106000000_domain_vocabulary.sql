-- Keep the persisted schema aligned with the domain vocabulary without
-- rewriting migration history or changing existing column names.
alter table public.eventos rename to events;
alter table public.tipos_entrada rename to ticket_types;
alter table public.registros rename to registrations;
alter table public.envios_entradas rename to ticket_deliveries;

-- Constraints (renaming a backed constraint also renames its index).
alter table public.events rename constraint eventos_pkey to events_pkey;
alter table public.events rename constraint eventos_propietario_id_fkey to events_propietario_id_fkey;
alter table public.events rename constraint eventos_titulo_check to events_titulo_check;
alter table public.events rename constraint eventos_lugar_check to events_lugar_check;
alter table public.events rename constraint eventos_aforo_positivo to events_aforo_positivo;

alter table public.ticket_types rename constraint tipos_entrada_pkey to ticket_types_pkey;
alter table public.ticket_types rename constraint tipos_entrada_evento_id_fkey to ticket_types_evento_id_fkey;
alter table public.ticket_types rename constraint tipos_entrada_nombre_check to ticket_types_nombre_check;
alter table public.ticket_types rename constraint tipos_entrada_aforo_maximo_check to ticket_types_aforo_maximo_check;

alter table public.registrations rename constraint registros_pkey to registrations_pkey;
alter table public.registrations rename constraint registros_comprador_id_fkey to registrations_comprador_id_fkey;
alter table public.registrations rename constraint registros_evento_id_fkey to registrations_evento_id_fkey;
alter table public.registrations rename constraint registros_tipo_entrada_id_fkey to registrations_tipo_entrada_id_fkey;
alter table public.registrations rename constraint registros_nombre_titular_check to registrations_nombre_titular_check;
alter table public.registrations rename constraint registros_correo_titular_check to registrations_correo_titular_check;
alter table public.registrations rename constraint registros_comprador_id_clave_idempotencia_key to registrations_buyer_idempotency_key;

alter table public.tickets rename constraint tickets_registro_id_fkey to tickets_registration_id_fkey;

alter table public.ticket_deliveries rename constraint envios_entradas_pkey to ticket_deliveries_pkey;
alter table public.ticket_deliveries rename constraint envios_entradas_ticket_id_fkey to ticket_deliveries_ticket_id_fkey;
alter table public.ticket_deliveries rename constraint envios_entradas_comprador_id_fkey to ticket_deliveries_comprador_id_fkey;
alter table public.ticket_deliveries rename constraint envios_entradas_estado_check to ticket_deliveries_estado_check;
alter table public.ticket_deliveries rename constraint envios_entradas_ticket_id_destinatario_key to ticket_deliveries_ticket_recipient_key;

alter index public.eventos_propietario_idx rename to events_owner_idx;
alter index public.eventos_publicados_fecha_idx rename to events_published_date_idx;
alter index public.tipos_entrada_evento_nombre_idx rename to ticket_types_event_name_idx;
alter index public.registros_tipo_idx rename to registrations_ticket_type_idx;
alter index public.registros_evento_idx rename to registrations_event_idx;
alter index public.registros_comprador_evento_idx rename to registrations_buyer_event_idx;
alter index public.envios_comprador_idx rename to ticket_deliveries_buyer_idx;

alter policy eventos_leer on public.events rename to events_read;
alter policy eventos_crear on public.events rename to events_create;
alter policy eventos_modificar on public.events rename to events_update;
alter policy eventos_eliminar on public.events rename to events_delete;
alter policy tipos_leer on public.ticket_types rename to ticket_types_read;
alter policy tipos_crear on public.ticket_types rename to ticket_types_create;
alter policy tipos_modificar on public.ticket_types rename to ticket_types_update;
alter policy tipos_eliminar on public.ticket_types rename to ticket_types_delete;
alter policy registros_leer on public.registrations rename to registrations_read;
alter policy tickets_leer on public.tickets rename to tickets_read;
alter policy envios_comprador on public.ticket_deliveries rename to ticket_deliveries_buyer_read;

alter trigger validar_evento on public.events rename to validate_event;
alter trigger validar_tipo_entrada on public.ticket_types rename to validate_ticket_type;
alter trigger validar_eliminacion_tipo on public.ticket_types rename to validate_ticket_type_delete;
alter trigger validar_aforo_evento on public.events rename to validate_event_capacity;
alter trigger validar_aforo_tipo on public.ticket_types rename to validate_ticket_type_capacity;
alter trigger emitir_ticket on public.registrations rename to issue_ticket;
alter trigger validar_ticket on public.tickets rename to validate_ticket;
alter trigger encolar_entrada on public.tickets rename to enqueue_ticket_delivery;

-- Stored function bodies are text and must be replaced after relation renames.
create or replace function private.validar_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.estado <> 'borrador' then raise exception 'Un evento nuevo debe comenzar como borrador'; end if;
  else
    if new.propietario_id is distinct from old.propietario_id then raise exception 'No se puede cambiar el propietario del evento'; end if;
    if new.estado = 'publicado' and not exists (select 1 from public.ticket_types where evento_id = new.id) then
      raise exception 'Un evento publicado necesita al menos un tipo de entrada';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.validar_eliminacion_tipo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare estado_actual public.estado_evento;
begin
  select estado into estado_actual from public.events where id = old.evento_id for update;
  if estado_actual = 'publicado' and not exists (select 1 from public.ticket_types where evento_id = old.evento_id) then
    raise exception 'Un evento publicado necesita al menos un tipo de entrada';
  end if;
  return old;
end;
$$;

create or replace function private.validar_aforo_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.aforo_maximo < (select coalesce(sum(aforo_maximo), 0) from public.ticket_types where evento_id = new.id) then
    raise exception 'La suma de los aforos de los tipos de entrada supera el aforo del evento';
  end if;
  return new;
end;
$$;

create or replace function private.validar_aforo_tipo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare limite integer; asignado bigint;
begin
  select aforo_maximo into limite from public.events where id = new.evento_id for update;
  select coalesce(sum(aforo_maximo), 0) into asignado from public.ticket_types where evento_id = new.evento_id and id <> new.id;
  if asignado + new.aforo_maximo > limite then raise exception 'La suma de los aforos de los tipos de entrada supera el aforo del evento'; end if;
  if new.aforo_maximo < (select count(*) from public.registrations where tipo_entrada_id = new.id) then
    raise exception 'El aforo no puede ser menor que los boletos registrados';
  end if;
  return new;
end;
$$;

create or replace function public.eventos_disponibles(p_evento_id uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ahora', statement_timestamp(), 'eventos', coalesce(jsonb_agg(
    jsonb_build_object('id', e.id, 'titulo', e.titulo, 'descripcion', e.descripcion,
      'fecha', e.fecha, 'lugar', e.lugar, 'abierto', e.fecha > statement_timestamp(),
      'tipos_entrada', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nombre', t.nombre, 'aforo_maximo', t.aforo_maximo,
        'disponibles', greatest(0, t.aforo_maximo - (
          select count(*) from public.registrations r where r.tipo_entrada_id = t.id
        ))) order by t.nombre), '[]'::jsonb)
        from public.ticket_types t where t.evento_id = e.id)
    ) order by e.fecha), '[]'::jsonb))
  from public.events e where e.estado = 'publicado'
    and (p_evento_id is null or (e.id = p_evento_id and e.fecha > statement_timestamp()));
$$;

create or replace function private.confirmar_registro(
  p_evento_id uuid, p_tipo_entrada_id uuid, p_nombre text, p_correo text, p_clave uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare comprador uuid := auth.uid(); evento public.events%rowtype; entrada public.ticket_types%rowtype; registro public.registrations%rowtype;
begin
  if comprador is null then return jsonb_build_object('estado', 'sesion_requerida'); end if;
  if p_clave is null then return jsonb_build_object('estado', 'datos_invalidos'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(comprador::text || p_clave::text, 0));
  select * into registro from public.registrations where comprador_id = comprador and clave_idempotencia = p_clave;
  if found then
    if registro.evento_id is distinct from p_evento_id or registro.tipo_entrada_id is distinct from p_tipo_entrada_id
      or registro.nombre_titular is distinct from btrim(p_nombre) or registro.correo_titular is distinct from lower(btrim(p_correo)) then
      return jsonb_build_object('estado', 'datos_invalidos');
    end if;
    return jsonb_build_object('estado', 'confirmado', 'folio', registro.id);
  end if;
  if p_nombre is null or length(btrim(p_nombre)) not between 1 and 200 or p_nombre !~ '[^[:space:]]'
    or p_correo is null or length(btrim(p_correo)) > 254 or btrim(p_correo) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('estado', 'datos_invalidos');
  end if;
  select * into evento from public.events where id = p_evento_id for update;
  if not found or evento.estado <> 'publicado' or evento.fecha <= clock_timestamp() then return jsonb_build_object('estado', 'evento_no_disponible'); end if;
  select * into entrada from public.ticket_types where id = p_tipo_entrada_id and evento_id = evento.id;
  if not found then return jsonb_build_object('estado', 'entrada_invalida'); end if;
  if (select count(*) from public.registrations where tipo_entrada_id = entrada.id) >= entrada.aforo_maximo then return jsonb_build_object('estado', 'entrada_agotada'); end if;
  insert into public.registrations(comprador_id, evento_id, tipo_entrada_id, nombre_titular, correo_titular, clave_idempotencia)
    values (comprador, evento.id, entrada.id, btrim(p_nombre), lower(btrim(p_correo)), p_clave) returning * into registro;
  return jsonb_build_object('estado', 'confirmado', 'folio', registro.id);
end;
$$;

create or replace function public.confirmar_registro(
  p_evento_id uuid, p_tipo_entrada_id uuid, p_nombre text, p_correo text, p_clave uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare resultado jsonb; entrada public.tickets%rowtype;
begin
  resultado := private.confirmar_registro(p_evento_id, p_tipo_entrada_id, p_nombre, p_correo, p_clave);
  if resultado->>'estado' = 'confirmado' then
    select * into strict entrada from public.tickets where registro_id = (resultado->>'folio')::uuid;
    return resultado || jsonb_build_object('ticket', jsonb_build_object('codigo', entrada.codigo, 'estado', entrada.estado));
  end if;
  return resultado;
end;
$$;

create or replace function public.consultar_ticket(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if p_codigo is null or p_codigo !~ '^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object('estado', t.estado, 'nombre_titular', r.nombre_titular,
    'correo_titular', r.correo_titular, 'tipo_entrada', te.nombre,
    'evento', jsonb_build_object('titulo', e.titulo, 'fecha', e.fecha, 'lugar', e.lugar,
      'publicado', e.estado = 'publicado', 'pasado', e.fecha <= statement_timestamp())) into resultado
  from public.tickets t join public.registrations r on r.id = t.registro_id
    join public.events e on e.id = r.evento_id join public.ticket_types te on te.id = r.tipo_entrada_id
  where t.codigo = p_codigo;
  return resultado;
end;
$$;

create or replace function public.cambiar_estado_ticket(p_codigo text, p_estado text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare entrada public.tickets%rowtype;
begin
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

create or replace function public.mis_boletos(p_evento_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare comprador uuid := auth.uid(); resultado jsonb;
begin
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

create or replace function private.preparar_envios(p_ticket uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.ticket_deliveries(ticket_id,comprador_id,destinatario,datos)
  select t.id,r.comprador_id,lower(btrim(d.correo)),jsonb_build_object(
    'codigo',t.codigo,'nombre',r.nombre_titular,'correo',r.correo_titular,
    'tipo',te.nombre,'titulo',e.titulo,'fecha',e.fecha,'lugar',e.lugar)
  from public.tickets t join public.registrations r on r.id=t.registro_id
    join public.events e on e.id=r.evento_id join public.ticket_types te on te.id=r.tipo_entrada_id
    join auth.users u on u.id=r.comprador_id cross join lateral (values (r.correo_titular),(u.email)) d(correo)
  where t.id=p_ticket and d.correo is not null and btrim(d.correo) <> '' on conflict(ticket_id,destinatario) do nothing;
$$;

create or replace function public.preparar_envios_entrada(p_registro uuid,p_comprador uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare entrada uuid;
begin
  select t.id into entrada from public.tickets t join public.registrations r on r.id=t.registro_id
    join public.events e on e.id=r.evento_id where r.id=p_registro and r.comprador_id=p_comprador
      and t.estado='valid' and e.estado='publicado' and e.fecha>statement_timestamp();
  if entrada is not null then perform private.preparar_envios(entrada); end if;
end;
$$;

create or replace function public.reclamar_envio_entrada(p_id uuid,p_comprador uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tarea public.ticket_deliveries%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_comprador::text,42));
  select * into tarea from public.ticket_deliveries where id=p_id and comprador_id=p_comprador for update;
  if not found or tarea.estado in ('aceptado','revision','bloqueado') then return null; end if;
  if tarea.bloqueo_hasta>clock_timestamp() or tarea.ultimo_intento>clock_timestamp()-interval '60 seconds' then return null; end if;
  if tarea.incierto and tarea.primer_envio<clock_timestamp()-interval '23 hours' then update public.ticket_deliveries set estado='revision' where id=p_id; return null; end if;
  if not exists(select 1 from public.tickets t join public.registrations r on r.id=t.registro_id
    join public.events e on e.id=r.evento_id where t.id=tarea.ticket_id and t.estado='valid'
      and e.estado='publicado' and e.fecha>clock_timestamp()) then
    update public.ticket_deliveries set estado='bloqueado' where id=p_id; return null;
  end if;
  if (select count(*) from public.ticket_deliveries where comprador_id=p_comprador and ultimo_intento>clock_timestamp()-interval '60 seconds')>=10 then return null; end if;
  update public.ticket_deliveries set estado='enviando',intentos=intentos+1,ultimo_intento=clock_timestamp(),
    bloqueo=gen_random_uuid(),bloqueo_hasta=clock_timestamp()+interval '3 minutes' where id=p_id returning * into tarea;
  return to_jsonb(tarea);
end;
$$;

create or replace function public.iniciar_envio_entrada(p_id uuid,p_bloqueo uuid,p_mensaje jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.ticket_deliveries set mensaje=coalesce(mensaje,p_mensaje),incierto=true,primer_envio=coalesce(primer_envio,clock_timestamp())
  where id=p_id and bloqueo=p_bloqueo and estado='enviando' and bloqueo_hasta>clock_timestamp();
  return found;
end;
$$;

create or replace function public.finalizar_envio_entrada(p_id uuid,p_bloqueo uuid,p_estado text,p_incierto boolean,p_resend_id text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_estado not in ('aceptado','fallido','revision') then raise exception 'Estado inválido'; end if;
  update public.ticket_deliveries set estado=p_estado,incierto=p_incierto,resend_id=p_resend_id,bloqueo=null,bloqueo_hasta=null
  where id=p_id and bloqueo=p_bloqueo and estado='enviando';
end;
$$;

create or replace function public.estado_envios_entrada(p_registro uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'destinatario',j.destinatario,
    'estado',j.estado,'ultimo_intento',j.ultimo_intento,'bloqueo_hasta',j.bloqueo_hasta) order by j.created_at,j.id),'[]'::jsonb)
  from public.ticket_deliveries j join public.tickets t on t.id=j.ticket_id
  join public.registrations r on r.id=t.registro_id where r.id=p_registro and r.comprador_id=auth.uid();
$$;
