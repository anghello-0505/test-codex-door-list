-- Owner approval required before running against a disposable database with
-- ALL migrations applied. Administrative setup only; assertions use real roles
-- and RLS. No emails are sent and all fixtures are rolled back.
begin;
create temporary table organizer_access_fixture (
  owner_id uuid, other_owner_id uuid, buyer_id uuid, stranger_id uuid,
  event_id uuid, other_event_id uuid, type_id uuid, other_type_id uuid
);
insert into organizer_access_fixture select gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid();
grant select on organizer_access_fixture to authenticated;
insert into auth.users(id)
  select owner_id from organizer_access_fixture union all select other_owner_id from organizer_access_fixture
  union all select buyer_id from organizer_access_fixture union all select stranger_id from organizer_access_fixture;
insert into public.events(id, propietario_id, titulo, descripcion, fecha, lugar, aforo_maximo)
  select event_id, owner_id, 'CSV RLS fixture', '', now() + interval '1 day', 'Fixture', 5 from organizer_access_fixture
  union all select other_event_id, other_owner_id, 'Other fixture', '', now() + interval '1 day', 'Fixture', 2 from organizer_access_fixture;
insert into public.ticket_types(id, evento_id, nombre, aforo_maximo)
  select type_id, event_id, 'General', 5 from organizer_access_fixture
  union all select other_type_id, other_event_id, 'Other', 2 from organizer_access_fixture;
update public.events set estado = 'publicado'
  where id in (select event_id from organizer_access_fixture union all select other_event_id from organizer_access_fixture);

do $$
declare f organizer_access_fixture%rowtype; result jsonb;
begin
  select * into f from organizer_access_fixture;
  perform set_config('request.jwt.claim.sub', f.buyer_id::text, true);
  for i in 1..3 loop
    result := public.confirmar_registro(f.event_id, f.type_id, 'Holder ' || i, 'holder@example.test', gen_random_uuid());
    assert result->>'estado' = 'confirmado';
    if i > 1 then
      perform set_config('request.jwt.claim.sub', f.owner_id::text, true);
      result := public.cambiar_estado_ticket(result#>>'{ticket,codigo}', case when i = 2 then 'used' else 'revoked' end);
      assert result->>'estado' = 'actualizado';
      perform set_config('request.jwt.claim.sub', f.buyer_id::text, true);
    end if;
  end loop;
  result := public.confirmar_registro(f.other_event_id, f.other_type_id, 'Other holder', 'other@example.test', gen_random_uuid());
  assert result->>'estado' = 'confirmado';
  assert not has_table_privilege('anon', 'public.registrations', 'select');
  assert not has_table_privilege('anon', 'public.tickets', 'select');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select owner_id::text from organizer_access_fixture), true);
do $$
declare f organizer_access_fixture%rowtype;
begin
  select * into f from organizer_access_fixture;
  assert (select count(*) from public.registrations where evento_id = f.event_id) = 3, 'Owner cannot count all occupied capacity';
  assert (select count(*) from public.tickets t join public.registrations r on r.id = t.registro_id where r.evento_id = f.event_id and t.estado = 'valid') = 1, 'Owner export did not filter by validity';
  assert not exists(select 1 from public.registrations where evento_id = f.other_event_id), 'Owner read another event registrations';
  assert not exists(select 1 from public.tickets t join public.registrations r on r.id = t.registro_id where r.evento_id = f.other_event_id), 'Owner read another event tickets';
  assert (public.eventos_disponibles(f.event_id)#>>'{eventos,0,tipos_entrada,0,disponibles}')::integer = 2, 'Used/revoked tickets incorrectly released capacity';
  update public.events set estado = 'borrador' where id = f.event_id;
  assert (select count(*) from public.registrations where evento_id = f.event_id) = 3, 'Draft owner lost access';
  assert (select count(*) from public.tickets t join public.registrations r on r.id = t.registro_id where r.evento_id = f.event_id and t.estado = 'valid') = 1, 'Draft export lost valid ticket';
end $$;

select set_config('request.jwt.claim.sub', (select other_owner_id::text from organizer_access_fixture), true);
do $$ begin
  assert not exists(select 1 from public.registrations where evento_id = (select event_id from organizer_access_fixture)), 'Other organizer read holders';
  assert (select count(*) from public.registrations where evento_id = (select other_event_id from organizer_access_fixture)) = 1, 'Other organizer lost own event';
end $$;

select set_config('request.jwt.claim.sub', (select stranger_id::text from organizer_access_fixture), true);
do $$ begin
  assert not exists(select 1 from public.registrations where evento_id in (select event_id from organizer_access_fixture union all select other_event_id from organizer_access_fixture)), 'Unrelated account read registrations';
  assert not exists(select 1 from public.tickets t join public.registrations r on r.id = t.registro_id where r.evento_id in (select event_id from organizer_access_fixture union all select other_event_id from organizer_access_fixture)), 'Unrelated account read tickets';
end $$;

select set_config('request.jwt.claim.sub', (select buyer_id::text from organizer_access_fixture), true);
do $$ begin
  -- Buyer access is intentionally retained by RLS. API ownership checks must
  -- prevent this buyer from using organizer endpoints (covered in Node tests).
  assert (select count(*) from public.registrations where evento_id = (select event_id from organizer_access_fixture)) = 3, 'Buyer access changed';
end $$;
reset role;
rollback;
