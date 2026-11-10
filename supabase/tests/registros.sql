-- Run only with owner approval, after all migrations, in a disposable test project.
-- Requires an administrative SQL connection. Every fixture is rolled back.
begin;

create temporary table fixtures (comprador uuid, organizador uuid, ajeno uuid, evento uuid, otro uuid, entrada uuid, otra uuid, clave uuid);
insert into fixtures select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid();
grant select on fixtures to authenticated;
insert into auth.users(id) select comprador from fixtures union all select organizador from fixtures union all select ajeno from fixtures;
insert into public.events(id, propietario_id, titulo, descripcion, fecha, lugar, aforo_maximo)
  select evento, organizador, 'Prueba registros', '', now() + interval '1 day', 'Prueba', 2 from fixtures
  union all select otro, organizador, 'Otro evento', '', now() + interval '1 day', 'Prueba', 1 from fixtures;
insert into public.ticket_types(id, evento_id, nombre, aforo_maximo)
  select entrada, evento, 'General', 2 from fixtures union all select otra, otro, 'General', 1 from fixtures;
update public.events set estado = 'publicado' where id = (select evento from fixtures);

do $$
declare
  f fixtures%rowtype;
  r jsonb;
  folio text;
begin
  select * into f from fixtures;
  perform set_config('request.jwt.claim.sub', '', true);
  r := public.confirmar_registro(f.evento, f.entrada, 'Titular', 'titular@example.test', f.clave);
  assert r->>'estado' = 'sesion_requerida', 'Anonymous registration accepted';
  assert not has_function_privilege('anon', 'public.confirmar_registro(uuid,uuid,text,text,uuid)', 'execute');
  assert not has_table_privilege('anon', 'public.registrations', 'select');
  assert not has_table_privilege('authenticated', 'public.registrations', 'insert');
  assert not has_table_privilege('authenticated', 'public.registrations', 'update');
  assert not has_table_privilege('authenticated', 'public.registrations', 'delete');
  assert has_function_privilege('anon', 'public.events_disponibles(uuid)', 'execute');

  perform set_config('request.jwt.claim.sub', f.comprador::text, true);
  r := public.confirmar_registro(f.evento, f.entrada, ' ', 'bad', gen_random_uuid());
  assert r->>'estado' = 'datos_invalidos';
  r := public.confirmar_registro(f.evento, f.otra, 'Titular', 'titular@example.test', gen_random_uuid());
  assert r->>'estado' = 'entrada_invalida';
  r := public.confirmar_registro(f.otro, f.otra, 'Titular', 'titular@example.test', gen_random_uuid());
  assert r->>'estado' = 'evento_no_disponible', 'Draft registration accepted';
  assert (select count(*) from public.registrations where evento_id = f.evento) = 0;

  r := public.confirmar_registro(f.evento, f.entrada, ' Titular ', 'TITULAR@example.test', f.clave);
  assert r->>'estado' = 'confirmado';
  folio := r->>'folio';
  r := public.confirmar_registro(f.evento, f.entrada, 'Titular', 'titular@example.test', f.clave);
  assert r->>'folio' = folio, 'Retry created another ticket';
  r := public.confirmar_registro(f.evento, f.entrada, 'Otro titular', 'titular@example.test', f.clave);
  assert r->>'estado' = 'datos_invalidos', 'Key allowed a changed payload';
  r := public.confirmar_registro(f.evento, f.entrada, 'Otra persona', 'titular@example.test', gen_random_uuid());
  assert r->>'estado' = 'confirmado', 'Repeated holder email was rejected';
  r := public.confirmar_registro(f.evento, f.entrada, 'Sin cupo', 'titular@example.test', gen_random_uuid());
  assert r->>'estado' = 'entrada_agotada';
  assert (select count(*) from public.registrations where evento_id = f.evento) = 2;
  assert (public.eventos_disponibles(f.evento)#>>'{eventos,0,tipos_entrada,0,disponibles}')::integer = 0;
  assert (select correo_titular from public.registrations where id = folio::uuid) = 'titular@example.test';

  begin
    update public.ticket_types set aforo_maximo = 1 where id = f.entrada;
    raise exception using message = 'Capacity reduction unexpectedly succeeded', errcode = 'ZX001';
  exception when raise_exception then null;
  end;

  update public.events set fecha = clock_timestamp() - interval '1 second' where id = f.evento;
  r := public.confirmar_registro(f.evento, f.entrada, 'Titular', 'titular@example.test', f.clave);
  assert r->>'folio' = folio, 'Retry failed after event closed';
  r := public.confirmar_registro(f.evento, f.entrada, 'Sin cupo', 'titular@example.test', gen_random_uuid());
  assert r->>'estado' = 'evento_no_disponible';
  assert public.eventos_disponibles(f.evento)->'eventos' = '[]'::jsonb;
end;
$$;

-- Exercise RLS under the real application role, not the administrative role.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select comprador::text from fixtures), true);
do $$ begin assert (select count(*) from public.registrations) = 2, 'Buyer cannot read own tickets'; end $$;
select set_config('request.jwt.claim.sub', (select ajeno::text from fixtures), true);
do $$ begin assert (select count(*) from public.registrations) = 0, 'Unrelated user can read tickets'; end $$;
select set_config('request.jwt.claim.sub', (select organizador::text from fixtures), true);
do $$ begin assert (select count(*) from public.registrations) = 2, 'Organizer cannot read event tickets'; end $$;
reset role;

do $$
begin
  update public.events set estado = 'borrador' where id = (select evento from fixtures);
  begin
    delete from public.ticket_types where id = (select entrada from fixtures);
    set constraints all immediate;
    raise exception using message = 'Used type deletion unexpectedly succeeded', errcode = 'ZX001';
  exception when foreign_key_violation then null;
  end;
  delete from public.events where id = (select evento from fixtures);
  set constraints all immediate;
  assert (select count(*) from public.registrations where evento_id = (select evento from fixtures)) = 0, 'Event cascade left tickets';
end;
$$;
rollback;
