-- Owner approval required. Run ONLY in a disposable database; no emails are sent.
begin;
create temporary table fixture_envios(o uuid,b uuid,x uuid,e uuid,t uuid,r uuid);
insert into fixture_envios values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null);
insert into auth.users(id,email) select o,'organizador@example.test' from fixture_envios
  union all select b,'comprador@example.test' from fixture_envios
  union all select x,'ajeno@example.test' from fixture_envios;
insert into public.events(id,propietario_id,titulo,descripcion,fecha,lugar,aforo_maximo)
  select e,o,'Correo de prueba','',now()+interval '1 day','Teatro',10 from fixture_envios;
insert into public.ticket_types(id,evento_id,nombre,aforo_maximo)
  select t,e,'General',10 from fixture_envios;
update public.events set estado='publicado' where id=(select e from fixture_envios);
do $$
declare f fixture_envios%rowtype; result jsonb; tarea jsonb; tarea2 jsonb; clave uuid:=gen_random_uuid(); id_tarea uuid;
begin
  select * into f from fixture_envios;
  perform set_config('request.jwt.claim.sub',f.b::text,true);
  result:=public.confirmar_registro(f.e,f.t,'Titular','titular@example.test',clave);
  f.r:=(result->>'folio')::uuid;
  update fixture_envios set r=f.r;
  assert jsonb_array_length(public.estado_envios_entrada(f.r))=2,'Missing recipient tasks';
  result:=public.confirmar_registro(f.e,f.t,'Titular','titular@example.test',clave);
  assert (result->>'folio')::uuid=f.r;
  assert jsonb_array_length(public.estado_envios_entrada(f.r))=2,'Retry duplicated tasks';
  result:=public.confirmar_registro(f.e,f.t,'Comprador','COMPRADOR@example.test',gen_random_uuid());
  assert jsonb_array_length(public.estado_envios_entrada((result->>'folio')::uuid))=1,'Same address sent twice';
  perform set_config('request.jwt.claim.sub',f.x::text,true);
  assert public.estado_envios_entrada(f.r)='[]'::jsonb,'Another buyer saw recipients';
  perform set_config('request.jwt.claim.sub',f.b::text,true);
  assert not has_function_privilege('authenticated','public.reclamar_envio_entrada(uuid,uuid)','execute');
  assert not has_function_privilege('anon','public.estado_envios_entrada(uuid)','execute');
  assert not has_column_privilege('authenticated','public.ticket_deliveries','mensaje','select');
  assert not has_column_privilege('authenticated','public.ticket_deliveries','datos','select');
  assert not has_table_privilege('authenticated','public.ticket_deliveries','update');
  select j.id into id_tarea from public.ticket_deliveries j join public.tickets t on t.id=j.ticket_id where t.registro_id=f.r limit 1;
  assert public.reclamar_envio_entrada(id_tarea,f.x) is null,'Wrong buyer claimed task';
  tarea:=public.reclamar_envio_entrada(id_tarea,f.b);
  assert tarea is not null;
  assert public.reclamar_envio_entrada(id_tarea,f.b) is null,'Concurrent claim succeeded';
  assert not public.iniciar_envio_entrada(id_tarea,gen_random_uuid(),'{"test":true}');
  assert public.iniciar_envio_entrada(id_tarea,(tarea->>'bloqueo')::uuid,'{"test":true}');
  perform public.finalizar_envio_entrada(id_tarea,gen_random_uuid(),'aceptado',false,'wrong-lease');
  assert (select estado from public.ticket_deliveries where id=id_tarea)='enviando';
  perform public.finalizar_envio_entrada(id_tarea,(tarea->>'bloqueo')::uuid,'fallido',true,null);
  assert public.reclamar_envio_entrada(id_tarea,f.b) is null,'Cooldown bypassed';
  update public.ticket_deliveries set ultimo_intento=now()-interval '61 seconds' where id=id_tarea;
  tarea2:=public.reclamar_envio_entrada(id_tarea,f.b);
  assert tarea2->'mensaje'='{"test":true}'::jsonb,'Frozen payload lost';
  perform public.finalizar_envio_entrada(id_tarea,(tarea2->>'bloqueo')::uuid,'aceptado',false,'mock-id');
  assert public.reclamar_envio_entrada(id_tarea,f.b) is null,'Accepted task resent';
  -- Model a process killed after an external side effect, outside provider window.
  update public.ticket_deliveries set estado='enviando',incierto=true,primer_envio=now()-interval '24 hours',
    ultimo_intento=now()-interval '4 minutes',bloqueo_hasta=now()-interval '1 minute' where id=id_tarea;
  assert public.reclamar_envio_entrada(id_tarea,f.b) is null;
  assert (select estado from public.ticket_deliveries where id=id_tarea)='revision';
  update public.ticket_deliveries set estado='pendiente',incierto=false,bloqueo_hasta=null where id=id_tarea;
  update public.tickets set estado='revoked' where registro_id=f.r;
  assert public.reclamar_envio_entrada(id_tarea,f.b) is null;
  assert (select estado from public.ticket_deliveries where id=id_tarea)='bloqueado';
end;
$$;
-- A task-creation failure must roll back registration, ticket and capacity together.
create function pg_temp.fallar_cola() returns trigger language plpgsql as $$
begin raise exception 'simulated outbox failure'; end; $$;
create trigger fixture_fail_queue before insert on public.ticket_deliveries for each row execute function pg_temp.fallar_cola();
do $$
declare f fixture_envios%rowtype; before_count integer;
begin
  select * into f from fixture_envios;
  select count(*) into before_count from public.registrations where evento_id=f.e;
  begin
    perform public.confirmar_registro(f.e,f.t,'Rollback','rollback@example.test',gen_random_uuid());
    raise exception using errcode='ZX001',message='Registration survived outbox failure';
  exception when raise_exception then null;
  end;
  assert (select count(*) from public.registrations where evento_id=f.e)=before_count;
end;
$$;
rollback;
