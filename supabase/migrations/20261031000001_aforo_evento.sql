alter table public.eventos add column aforo_maximo integer;

-- Preserve existing events, including those without ticket types.
update public.eventos e set aforo_maximo = greatest(1, coalesce(
  (select sum(t.aforo_maximo) from public.tipos_entrada t where t.evento_id = e.id), 0
));
alter table public.eventos alter column aforo_maximo set not null;
alter table public.eventos add constraint eventos_aforo_positivo check (aforo_maximo > 0);

create function private.validar_aforo_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.aforo_maximo < (select coalesce(sum(aforo_maximo), 0)
    from public.tipos_entrada where evento_id = new.id) then
    raise exception 'La suma de los aforos de los tipos de entrada supera el aforo del evento';
  end if;
  return new;
end;
$$;

create function private.validar_aforo_tipo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  limite integer;
  asignado bigint;
begin
  -- The parent row serializes changes to the event limit and its ticket types.
  select aforo_maximo into limite from public.eventos where id = new.evento_id for update;
  select coalesce(sum(aforo_maximo), 0) into asignado from public.tipos_entrada
    where evento_id = new.evento_id and id <> new.id;
  if asignado + new.aforo_maximo > limite then
    raise exception 'La suma de los aforos de los tipos de entrada supera el aforo del evento';
  end if;
  return new;
end;
$$;

revoke all on function private.validar_aforo_evento() from public, anon, authenticated;
revoke all on function private.validar_aforo_tipo() from public, anon, authenticated;
create trigger validar_aforo_evento before update of aforo_maximo on public.eventos
  for each row execute function private.validar_aforo_evento();
create trigger validar_aforo_tipo before insert or update of aforo_maximo on public.tipos_entrada
  for each row execute function private.validar_aforo_tipo();
