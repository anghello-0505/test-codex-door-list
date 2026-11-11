-- Authorized integration check. Synthetic fixtures and all mutations roll back.
begin;
create temporary table revocation_fixture(owner_id uuid,other_id uuid,session_id uuid,event_id uuid,type_id uuid,registration_id uuid,used_registration_id uuid,legacy_registration_id uuid,job_id uuid);
insert into revocation_fixture select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null;
grant select on revocation_fixture to authenticated;
insert into auth.users(id,raw_app_meta_data) select owner_id,'{}'::jsonb from revocation_fixture union all select other_id,'{}'::jsonb from revocation_fixture;
insert into auth.sessions(id,user_id,created_at,updated_at) select session_id,owner_id,clock_timestamp(),clock_timestamp() from revocation_fixture;
insert into public.events(id,propietario_id,titulo,descripcion,fecha,lugar,aforo_maximo)
  select event_id,owner_id,'Revocation synthetic test','',clock_timestamp()+interval '1 day','Test',10 from revocation_fixture;
insert into public.ticket_types(id,evento_id,nombre,aforo_maximo) select type_id,event_id,'General',10 from revocation_fixture;
update public.events set estado='publicado' where id=(select event_id from revocation_fixture);
insert into public.registrations(id,comprador_id,evento_id,tipo_entrada_id,nombre_titular,correo_titular,clave_idempotencia)
  select x.registration_id,f.other_id,f.event_id,f.type_id,'Synthetic holder','holder@example.test',gen_random_uuid()
  from revocation_fixture f cross join lateral (values(f.registration_id),(f.used_registration_id),(f.legacy_registration_id)) x(registration_id);
update public.tickets set estado='used' where registro_id=(select used_registration_id from revocation_fixture);
update public.tickets set estado='revoked' where registro_id=(select legacy_registration_id from revocation_fixture);

do $$
declare f revocation_fixture%rowtype; answer jsonb; job uuid; lock uuid; payload jsonb:='{"text":"immutable payload"}'::jsonb;
begin
  select * into f from revocation_fixture;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f.owner_id,'role','authenticated','session_id',f.session_id)::text,true);
  assert public.revoke_ticket_with_reason(f.event_id,f.registration_id,' ')->>'error'='invalid_data';
  assert public.revoke_ticket_with_reason(f.event_id,f.used_registration_id,'Used')->>'error'='conflict';
  assert public.revoke_ticket_with_reason(f.event_id,f.legacy_registration_id,'Historical')->>'error'='conflict';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f.other_id,'role','authenticated','session_id',f.session_id)::text,true);
  assert public.revoke_ticket_with_reason(f.event_id,f.registration_id,'Denied')->>'error'='session_required';
  insert into auth.sessions(id,user_id,created_at,updated_at) values(gen_random_uuid(),f.other_id,clock_timestamp(),clock_timestamp()) returning id into lock;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f.other_id,'role','authenticated','session_id',lock)::text,true);
  assert public.revoke_ticket_with_reason(f.event_id,f.registration_id,'Denied')->>'error'='denied';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f.owner_id,'role','authenticated','session_id',f.session_id)::text,true);
  answer:=public.revoke_ticket_with_reason(f.event_id,f.registration_id,'Duplicate registration');
  job:=(answer->>'id')::uuid;
  assert job is not null;
  assert public.revoke_ticket_with_reason(f.event_id,f.registration_id,'Duplicate registration')->>'id'=job::text;
  assert public.revoke_ticket_with_reason(f.event_id,f.registration_id,'Different reason')->>'error'='conflict';
  assert (select estado='revoked' from public.tickets where registro_id=f.registration_id);
  assert (select count(*)=3 from public.registrations where evento_id=f.event_id), 'Revocation released capacity';
  assert (select holder_email='holder@example.test' and reason='Duplicate registration' from public.ticket_revocations where id=job);
  assert public.claim_ticket_revocation_email(job,f.other_id) is null;
  answer:=public.claim_ticket_revocation_email(job,f.owner_id); lock:=(answer->>'lock_id')::uuid;
  assert lock is not null;
  assert public.claim_ticket_revocation_email(job,f.owner_id) is null, 'Concurrent delivery not excluded';
  assert not public.start_ticket_revocation_email(job,gen_random_uuid(),payload);
  assert public.start_ticket_revocation_email(job,lock,payload);
  perform public.finish_ticket_revocation_email(job,gen_random_uuid(),'accepted',false,'wrong');
  assert (select delivery_status='sending' from public.ticket_revocations where id=job);
  perform public.finish_ticket_revocation_email(job,lock,'failed',true,null);
  update public.ticket_revocations set last_attempt_at=clock_timestamp()-interval '2 minutes' where id=job;
  answer:=public.claim_ticket_revocation_email(job,f.owner_id); lock:=(answer->>'lock_id')::uuid;
  assert answer->'message'=payload, 'Retry changed frozen payload';
  assert public.start_ticket_revocation_email(job,lock,'{"text":"replacement"}'::jsonb);
  assert (select message=payload from public.ticket_revocations where id=job);
  perform public.finish_ticket_revocation_email(job,lock,'failed',true,null);
  update public.ticket_revocations set first_sent_at=clock_timestamp()-interval '24 hours',last_attempt_at=clock_timestamp()-interval '2 minutes' where id=job;
  assert public.claim_ticket_revocation_email(job,f.owner_id) is null;
  assert (select delivery_status='review' from public.ticket_revocations where id=job);
  delete from auth.sessions where id=f.session_id;
  assert public.revoke_ticket_with_reason(f.event_id,f.registration_id,'Duplicate registration')->>'error'='session_required';
  assert not has_function_privilege('authenticated','public.cambiar_estado_ticket(text,text)','execute');
  assert not has_function_privilege('anon','public.revoke_ticket_with_reason(uuid,uuid,text)','execute');
  assert not has_function_privilege('authenticated','public.claim_ticket_revocation_email(uuid,uuid)','execute');
  assert not has_table_privilege('authenticated','public.ticket_revocations','update');
  assert (select relrowsecurity from pg_class where oid='public.ticket_revocations'::regclass);
  update revocation_fixture set job_id=job;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true) from revocation_fixture;
do $$ begin assert (select count(*)=1 from public.ticket_revocations); end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true) from revocation_fixture;
do $$ begin assert not exists(select 1 from public.ticket_revocations); end $$;
reset role;
delete from public.events where id=(select event_id from revocation_fixture);
do $$ begin assert not exists(select 1 from public.ticket_revocations where id=(select job_id from revocation_fixture)); end $$;
rollback;
