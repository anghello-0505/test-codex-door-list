-- Approval required. Use a disposable database with ALL migrations applied.
-- No fixtures survive rollback. No real codes or holder data are printed.
begin;
create temporary table fixture_tickets (organizador uuid, comprador uuid, ajeno uuid, evento uuid, entrada uuid, clave uuid, registro uuid, codigo text);
insert into fixture_tickets select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), null, null;
grant select on fixture_tickets to authenticated;
insert into auth.users(id) select organizador from fixture_tickets union all select comprador from fixture_tickets union all select ajeno from fixture_tickets;
insert into public.events(id, propietario_id, titulo, descripcion, fecha, lugar, aforo_maximo)
  select evento, organizador, 'Prueba emisión', '', now() + interval '1 day', 'Prueba', 10 from fixture_tickets;
insert into public.ticket_types(id, evento_id, nombre, aforo_maximo)
  select entrada, evento, 'General', 10 from fixture_tickets;
update public.events set estado = 'publicado' where id = (select evento from fixture_tickets);

do $$
declare f fixture_tickets%rowtype; result jsonb; first_code text; second_code text;
begin
  select * into f from fixture_tickets;
  assert not exists(select 1 from public.registrations r left join public.tickets t on t.registro_id = r.id where t.id is null), 'Backfill left registrations without tickets';
  assert not has_table_privilege('anon', 'public.tickets', 'select');
  assert not has_table_privilege('authenticated', 'public.tickets', 'insert');
  assert not has_table_privilege('authenticated', 'public.tickets', 'update');
  assert not has_table_privilege('authenticated', 'public.tickets', 'delete');
  assert not has_function_privilege('authenticated', 'private.confirmar_registro(uuid,uuid,text,text,uuid)', 'execute');
  assert not has_function_privilege('anon', 'public.cambiar_estado_ticket(text,text)', 'execute');
  assert has_function_privilege('anon', 'public.consultar_ticket(text)', 'execute');

  perform set_config('request.jwt.claim.sub', f.comprador::text, true);
  result := public.confirmar_registro(f.evento, f.entrada, 'Titular', 'titular@example.test', f.clave);
  assert result->>'estado' = 'confirmado';
  first_code := result#>>'{ticket,codigo}';
  assert first_code ~ '^[0-9a-f]{64}$';
  assert result#>>'{ticket,estado}' = 'valid';
  update fixture_tickets set registro = (result->>'folio')::uuid, codigo = first_code;
  result := public.confirmar_registro(f.evento, f.entrada, 'Titular', 'titular@example.test', f.clave);
  assert result#>>'{ticket,codigo}' = first_code, 'Retry issued another code';
  assert (select count(*) from public.tickets t join public.registrations r on r.id = t.registro_id where r.evento_id = f.evento) = 1;
  result := public.confirmar_registro(f.evento, f.entrada, 'Otra persona', 'titular@example.test', gen_random_uuid());
  second_code := result#>>'{ticket,codigo}';
  assert first_code <> second_code;
  assert public.mis_boletos(f.evento)#>>'{eventos,0,boletos,0,ticket,codigo}' is not null;

  begin
    insert into public.tickets(registro_id) select registro from fixture_tickets;
    raise exception using message = 'Duplicate registration ticket accepted', errcode = 'ZX001';
  exception when unique_violation then null;
  end;
  begin
    insert into public.tickets(registro_id, codigo) values (gen_random_uuid(), first_code);
    raise exception using message = 'Duplicate code accepted', errcode = 'ZX001';
  exception when unique_violation then null;
  end;

  assert public.consultar_ticket('1') is null;
  assert public.consultar_ticket((select registro::text from fixture_tickets)) is null;
  assert public.consultar_ticket(left(first_code, 32)) is null;
  assert public.consultar_ticket(repeat('0', 64)) is null;
  result := public.consultar_ticket(first_code);
  assert result->>'nombre_titular' = 'Titular';
  assert result->>'estado' = 'valid';
  assert not (result ? 'comprador_id') and not (result ? 'registro_id');
  perform public.consultar_ticket(first_code);
  assert public.consultar_ticket(first_code)->>'estado' = 'valid', 'Viewing consumed the ticket';
  result := public.cambiar_estado_ticket(first_code, 'used');
  assert result->>'estado' = 'no_autorizado', 'Buyer consumed ticket without organizer permission';
  perform set_config('request.jwt.claim.sub', f.ajeno::text, true);
  result := public.cambiar_estado_ticket(first_code, 'revoked');
  assert result->>'estado' = 'no_autorizado';

  perform set_config('request.jwt.claim.sub', f.organizador::text, true);
  result := public.cambiar_estado_ticket(first_code, 'used');
  assert result->>'estado' = 'actualizado';
  assert public.consultar_ticket(first_code)->>'estado' = 'used';
  result := public.cambiar_estado_ticket(first_code, 'used');
  assert result->>'estado' = 'ya_usada', 'Ticket admitted twice';
  result := public.cambiar_estado_ticket(first_code, 'valid');
  assert result->>'estado' = 'datos_invalidos';
  begin
    update public.tickets set estado = 'valid' where codigo = first_code;
    raise exception using message = 'Used ticket reactivated', errcode = 'ZX001';
  exception when raise_exception then null;
  end;
  result := public.cambiar_estado_ticket(first_code, 'revoked');
  assert result->>'estado' = 'actualizado';
  result := public.cambiar_estado_ticket(first_code, 'used');
  assert result->>'estado' = 'ticket_revocado';
  assert public.consultar_ticket(first_code)->>'estado' = 'revoked';
  begin
    update public.tickets set codigo = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where codigo = first_code;
    raise exception using message = 'Ticket identity changed', errcode = 'ZX001';
  exception when raise_exception then null;
  end;
  perform set_config('request.jwt.claim.sub', f.comprador::text, true);
  result := public.confirmar_registro(f.evento, f.entrada, 'Titular', 'titular@example.test', f.clave);
  assert result#>>'{ticket,codigo}' = first_code and result#>>'{ticket,estado}' = 'revoked', 'Retry reactivated or replaced a ticket';
end;
$$;

-- Simulate an emission failure: registration must roll back with the ticket.
create function pg_temp.bloquear_emision() returns trigger language plpgsql as $$
begin raise exception 'Fallo de emisión simulado'; end;
$$;
create trigger prueba_fallo_emision before insert on public.tickets for each row execute function pg_temp.bloquear_emision();
do $$
declare f fixture_tickets%rowtype; previous_count bigint;
begin
  select * into f from fixture_tickets;
  select count(*) into previous_count from public.registrations where evento_id = f.evento;
  begin
    perform public.confirmar_registro(f.evento, f.entrada, 'Fallo', 'fallo@example.test', gen_random_uuid());
    raise exception using message = 'Emission failure unexpectedly succeeded', errcode = 'ZX001';
  exception when raise_exception then null;
  end;
  assert (select count(*) from public.registrations where evento_id = f.evento) = previous_count, 'Orphan registration survived emission failure';
end;
$$;
drop trigger prueba_fallo_emision on public.tickets;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select ajeno::text from fixture_tickets), true);
do $$ begin
  assert not exists(select 1 from public.tickets where codigo = (select codigo from fixture_tickets)), 'Unrelated account enumerated a ticket';
end $$;
select set_config('request.jwt.claim.sub', (select comprador::text from fixture_tickets), true);
do $$ begin
  assert exists(select 1 from public.tickets where codigo = (select codigo from fixture_tickets)), 'Buyer lost access';
end $$;
reset role;
delete from public.events where id = (select evento from fixture_tickets);
set constraints all immediate;
do $$ begin assert not exists(select 1 from public.tickets where codigo = (select codigo from fixture_tickets)), 'Event cascade left a ticket'; end $$;
rollback;
