-- Owner approval required. Run after migrations in a disposable test database.
-- Includes temporary Auth accounts and records; no fixtures survive rollback.
begin;
create temporary table fixtures_boletos (
  organizador uuid, comprador uuid, titular uuid,
  activo uuid, pasado uuid, borrador uuid, ajeno uuid,
  entrada_activo uuid, entrada_pasado uuid, entrada_borrador uuid, entrada_ajeno uuid
);
insert into fixtures_boletos select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid();
grant select on fixtures_boletos to authenticated;
insert into auth.users(id, email)
  select organizador, 'organizador.fixture@example.test' from fixtures_boletos
  union all select comprador, 'comprador.fixture@example.test' from fixtures_boletos
  union all select titular, 'titular.fixture@example.test' from fixtures_boletos;

insert into public.events(id, propietario_id, titulo, descripcion, fecha, lugar, aforo_maximo)
  select activo, organizador, 'Activo', '', now() + interval '1 day', 'Prueba', 10 from fixtures_boletos
  union all select pasado, organizador, 'Pasado', '', now() + interval '1 day', 'Prueba', 10 from fixtures_boletos
  union all select borrador, organizador, 'Borrador', '', now() + interval '1 day', 'Prueba', 10 from fixtures_boletos
  union all select ajeno, comprador, 'Ajeno', '', now() + interval '1 day', 'Prueba', 10 from fixtures_boletos;
insert into public.ticket_types(id, evento_id, nombre, aforo_maximo)
  select entrada_activo, activo, 'General', 10 from fixtures_boletos
  union all select entrada_pasado, pasado, 'General', 10 from fixtures_boletos
  union all select entrada_borrador, borrador, 'General', 10 from fixtures_boletos
  union all select entrada_ajeno, ajeno, 'General', 10 from fixtures_boletos;
update public.events set estado = 'publicado'
  where id in (select activo from fixtures_boletos union all select pasado from fixtures_boletos
    union all select borrador from fixtures_boletos union all select ajeno from fixtures_boletos);

do $$
declare f fixtures_boletos%rowtype; result jsonb;
begin
  select * into f from fixtures_boletos;
  assert not has_function_privilege('anon', 'public.mis_boletos(uuid)', 'execute');
  assert has_function_privilege('authenticated', 'public.mis_boletos(uuid)', 'execute');
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.mis_boletos();
    raise exception using message = 'Anonymous query unexpectedly succeeded', errcode = 'ZX001';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', f.organizador::text, true);
  result := public.confirmar_registro(f.activo, f.entrada_activo, 'Ana', 'titular.fixture@example.test', gen_random_uuid());
  assert result->>'estado' = 'confirmado';
  result := public.confirmar_registro(f.activo, f.entrada_activo, 'Luis', 'titular.fixture@example.test', gen_random_uuid());
  assert result->>'estado' = 'confirmado';
  result := public.confirmar_registro(f.pasado, f.entrada_pasado, 'Ana', 'titular.fixture@example.test', gen_random_uuid());
  assert result->>'estado' = 'confirmado';
  result := public.confirmar_registro(f.borrador, f.entrada_borrador, 'Ana', 'titular.fixture@example.test', gen_random_uuid());
  assert result->>'estado' = 'confirmado';
  perform set_config('request.jwt.claim.sub', f.comprador::text, true);
  result := public.confirmar_registro(f.activo, f.entrada_activo, 'Otro comprador', 'titular.fixture@example.test', gen_random_uuid());
  assert result->>'estado' = 'confirmado';
  result := public.confirmar_registro(f.borrador, f.entrada_borrador, 'Otro comprador', 'titular.fixture@example.test', gen_random_uuid());
  assert result->>'estado' = 'confirmado';
  result := public.confirmar_registro(f.ajeno, f.entrada_ajeno, 'Otro comprador', 'titular.fixture@example.test', gen_random_uuid());
  assert result->>'estado' = 'confirmado';
end;
$$;
update public.events set fecha = now() - interval '1 day' where id = (select pasado from fixtures_boletos);
update public.events set estado = 'borrador' where id = (select borrador from fixtures_boletos);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select organizador::text from fixtures_boletos), true);
do $$
declare result jsonb;
begin
  result := public.mis_boletos();
  assert jsonb_array_length(result->'eventos') = 3;
  assert result->>'comprador_id' = (select organizador::text from fixtures_boletos);
  assert jsonb_array_length(public.mis_boletos((select activo from fixtures_boletos))#>'{eventos,0,boletos}') = 2,
    'Organizer saw another buyer tickets';
  assert public.mis_boletos((select ajeno from fixtures_boletos))->'eventos' = '[]'::jsonb,
    'Foreign event details leaked';
  assert public.mis_boletos((select pasado from fixtures_boletos))#>>'{eventos,0,titulo}' = 'Pasado';
end;
$$;
select set_config('request.jwt.claim.sub', (select comprador::text from fixtures_boletos), true);
do $$
begin
  assert not exists(select 1 from public.events where id = (select borrador from fixtures_boletos)),
    'Buyer unexpectedly has general draft access';
  assert public.mis_boletos((select borrador from fixtures_boletos))#>>'{eventos,0,titulo}' = 'Borrador',
    'Own ticket details disappeared after unpublication';
  assert jsonb_array_length(public.mis_boletos((select activo from fixtures_boletos))#>'{eventos,0,boletos}') = 1;
end;
$$;
select set_config('request.jwt.claim.sub', (select titular::text from fixtures_boletos), true);
do $$ begin
  assert public.mis_boletos()->'eventos' = '[]'::jsonb,
    'Matching holder email incorrectly granted access';
end $$;
reset role;
rollback;
