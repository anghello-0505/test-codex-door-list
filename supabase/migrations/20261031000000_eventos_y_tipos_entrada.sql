create type public.estado_evento as enum ('borrador', 'publicado');

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null default auth.uid() references auth.users(id),
  titulo text not null check (length(btrim(titulo)) > 0),
  descripcion text not null,
  fecha timestamptz not null,
  lugar text not null check (length(btrim(lugar)) > 0),
  estado public.estado_evento not null default 'borrador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tipos_entrada (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) > 0),
  aforo_maximo integer not null check (aforo_maximo > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index eventos_propietario_idx on public.eventos (propietario_id);
create index eventos_publicados_fecha_idx on public.eventos (fecha) where estado = 'publicado';
create unique index tipos_entrada_evento_nombre_idx
  on public.tipos_entrada (evento_id, lower(btrim(nombre)));

-- Trigger functions live outside the exposed API schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.validar_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.estado <> 'borrador' then
      raise exception 'Un evento nuevo debe comenzar como borrador';
    end if;
  else
    if new.propietario_id is distinct from old.propietario_id then
      raise exception 'No se puede cambiar el propietario del evento';
    end if;
    if new.estado = 'publicado' and not exists (
      select 1 from public.tipos_entrada where evento_id = new.id
    ) then
      raise exception 'Un evento publicado necesita al menos un tipo de entrada';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create function private.validar_tipo_entrada() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.evento_id is distinct from old.evento_id then
    raise exception 'No se puede cambiar el evento de un tipo de entrada';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function private.validar_eliminacion_tipo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  estado_actual public.estado_evento;
begin
  -- Serialize this check with publication and other deletes of the same event.
  select estado into estado_actual from public.eventos
    where id = old.evento_id for update;
  if estado_actual = 'publicado' and not exists (
    select 1 from public.tipos_entrada where evento_id = old.evento_id
  ) then
    raise exception 'Un evento publicado necesita al menos un tipo de entrada';
  end if;
  return old;
end;
$$;

revoke all on function private.validar_evento() from public, anon, authenticated;
revoke all on function private.validar_tipo_entrada() from public, anon, authenticated;
revoke all on function private.validar_eliminacion_tipo() from public, anon, authenticated;

create trigger validar_evento before insert or update on public.eventos
  for each row execute function private.validar_evento();
create trigger validar_tipo_entrada before update on public.tipos_entrada
  for each row execute function private.validar_tipo_entrada();
create trigger validar_eliminacion_tipo after delete on public.tipos_entrada
  for each row execute function private.validar_eliminacion_tipo();

alter table public.eventos enable row level security;
alter table public.tipos_entrada enable row level security;

grant select on public.eventos, public.tipos_entrada to anon, authenticated;
grant insert, update, delete on public.eventos, public.tipos_entrada to authenticated;

create policy eventos_leer on public.eventos for select to anon, authenticated
  using (estado = 'publicado' or propietario_id = (select auth.uid()));
create policy eventos_crear on public.eventos for insert to authenticated
  with check (propietario_id = (select auth.uid()));
create policy eventos_modificar on public.eventos for update to authenticated
  using (propietario_id = (select auth.uid()))
  with check (propietario_id = (select auth.uid()));
create policy eventos_eliminar on public.eventos for delete to authenticated
  using (propietario_id = (select auth.uid()));

create policy tipos_leer on public.tipos_entrada for select to anon, authenticated
  using (exists (
    select 1 from public.eventos e where e.id = evento_id
      and (e.estado = 'publicado' or e.propietario_id = (select auth.uid()))
  ));
create policy tipos_crear on public.tipos_entrada for insert to authenticated
  with check (exists (
    select 1 from public.eventos e where e.id = evento_id and e.propietario_id = (select auth.uid())
  ));
create policy tipos_modificar on public.tipos_entrada for update to authenticated
  using (exists (
    select 1 from public.eventos e where e.id = evento_id and e.propietario_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.eventos e where e.id = evento_id and e.propietario_id = (select auth.uid())
  ));
create policy tipos_eliminar on public.tipos_entrada for delete to authenticated
  using (exists (
    select 1 from public.eventos e where e.id = evento_id and e.propietario_id = (select auth.uid())
  ));
