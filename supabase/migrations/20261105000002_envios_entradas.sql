-- No network calls in transactions. The durable task is created with the ticket.
create table public.envios_entradas (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  comprador_id uuid not null references auth.users(id),
  destinatario text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','enviando','aceptado','fallido','revision','bloqueado')),
  datos jsonb not null,
  mensaje jsonb,
  intentos integer not null default 0,
  ultimo_intento timestamptz,
  primer_envio timestamptz,
  incierto boolean not null default false,
  bloqueo uuid,
  bloqueo_hasta timestamptz,
  resend_id text,
  created_at timestamptz not null default now(),
  unique(ticket_id, destinatario)
);
create index envios_comprador_idx on public.envios_entradas(comprador_id, ultimo_intento);
alter table public.envios_entradas enable row level security;
revoke all on public.envios_entradas from public, anon, authenticated;
grant select(id,ticket_id,comprador_id,destinatario,estado,intentos,ultimo_intento,created_at) on public.envios_entradas to authenticated;
grant all on public.envios_entradas to service_role;
create policy envios_comprador on public.envios_entradas for select to authenticated
  using (comprador_id = (select auth.uid()));

create function private.preparar_envios(p_ticket uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.envios_entradas(ticket_id,comprador_id,destinatario,datos)
  select t.id,r.comprador_id,lower(btrim(d.correo)),jsonb_build_object(
    'codigo',t.codigo,'nombre',r.nombre_titular,'correo',r.correo_titular,
    'tipo',te.nombre,'titulo',e.titulo,'fecha',e.fecha,'lugar',e.lugar)
  from public.tickets t join public.registros r on r.id=t.registro_id
    join public.eventos e on e.id=r.evento_id
    join public.tipos_entrada te on te.id=r.tipo_entrada_id
    join auth.users u on u.id=r.comprador_id
    cross join lateral (values (r.correo_titular),(u.email)) d(correo)
  where t.id=p_ticket and d.correo is not null and btrim(d.correo) <> ''
  on conflict(ticket_id,destinatario) do nothing;
$$;
revoke all on function private.preparar_envios(uuid) from public,anon,authenticated;
create function private.encolar_entrada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform private.preparar_envios(new.id); return new; end;
$$;
revoke all on function private.encolar_entrada() from public,anon,authenticated;
create trigger encolar_entrada after insert on public.tickets
  for each row execute function private.encolar_entrada();

-- Only the application server may request historical tasks or claim work.
create function public.preparar_envios_entrada(p_registro uuid,p_comprador uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare entrada uuid;
begin
  select t.id into entrada from public.tickets t join public.registros r on r.id=t.registro_id
    join public.eventos e on e.id=r.evento_id
    where r.id=p_registro and r.comprador_id=p_comprador and t.estado='valid'
      and e.estado='publicado' and e.fecha>statement_timestamp();
  if entrada is not null then perform private.preparar_envios(entrada); end if;
end;
$$;

create function public.reclamar_envio_entrada(p_id uuid,p_comprador uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tarea public.envios_entradas%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_comprador::text,42));
  select * into tarea from public.envios_entradas where id=p_id and comprador_id=p_comprador for update;
  if not found or tarea.estado in ('aceptado','revision','bloqueado') then return null; end if;
  if tarea.bloqueo_hasta>clock_timestamp() or tarea.ultimo_intento>clock_timestamp()-interval '60 seconds' then return null; end if;
  if tarea.incierto and tarea.primer_envio<clock_timestamp()-interval '23 hours' then
    update public.envios_entradas set estado='revision' where id=p_id; return null;
  end if;
  if not exists(select 1 from public.tickets t join public.registros r on r.id=t.registro_id
    join public.eventos e on e.id=r.evento_id where t.id=tarea.ticket_id
    and t.estado='valid' and e.estado='publicado' and e.fecha>clock_timestamp()) then
    update public.envios_entradas set estado='bloqueado' where id=p_id; return null;
  end if;
  if (select count(*) from public.envios_entradas where comprador_id=p_comprador
      and ultimo_intento>clock_timestamp()-interval '60 seconds')>=10 then return null; end if;
  update public.envios_entradas set estado='enviando',intentos=intentos+1,
    ultimo_intento=clock_timestamp(),bloqueo=gen_random_uuid(),bloqueo_hasta=clock_timestamp()+interval '3 minutes'
    where id=p_id returning * into tarea;
  return to_jsonb(tarea);
end;
$$;

-- Freeze the exact Resend payload before any external side effect. Fenced lease.
create function public.iniciar_envio_entrada(p_id uuid,p_bloqueo uuid,p_mensaje jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.envios_entradas set mensaje=coalesce(mensaje,p_mensaje),incierto=true,
    primer_envio=coalesce(primer_envio,clock_timestamp())
  where id=p_id and bloqueo=p_bloqueo and estado='enviando' and bloqueo_hasta>clock_timestamp();
  return found;
end;
$$;
create function public.finalizar_envio_entrada(p_id uuid,p_bloqueo uuid,p_estado text,p_incierto boolean,p_resend_id text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_estado not in ('aceptado','fallido','revision') then raise exception 'Estado inválido'; end if;
  update public.envios_entradas set estado=p_estado,incierto=p_incierto,resend_id=p_resend_id,
    bloqueo=null,bloqueo_hasta=null where id=p_id and bloqueo=p_bloqueo and estado='enviando';
end;
$$;
revoke all on function public.preparar_envios_entrada(uuid,uuid) from public,anon,authenticated;
revoke all on function public.reclamar_envio_entrada(uuid,uuid) from public,anon,authenticated;
revoke all on function public.iniciar_envio_entrada(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finalizar_envio_entrada(uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.preparar_envios_entrada(uuid,uuid) to service_role;
grant execute on function public.reclamar_envio_entrada(uuid,uuid) to service_role;
grant execute on function public.iniciar_envio_entrada(uuid,uuid,jsonb) to service_role;
grant execute on function public.finalizar_envio_entrada(uuid,uuid,text,boolean,text) to service_role;

create function public.estado_envios_entrada(p_registro uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'destinatario',j.destinatario,
    'estado',j.estado,'ultimo_intento',j.ultimo_intento,'bloqueo_hasta',j.bloqueo_hasta) order by j.created_at,j.id),'[]'::jsonb)
  from public.envios_entradas j join public.tickets t on t.id=j.ticket_id
  join public.registros r on r.id=t.registro_id
  where r.id=p_registro and r.comprador_id=auth.uid();
$$;
revoke all on function public.estado_envios_entrada(uuid) from public,anon,authenticated;
grant execute on function public.estado_envios_entrada(uuid) to authenticated;
