-- Approval required. Disposable/development database with ALL migrations applied.
-- This transaction creates fixtures without usable credentials and always rolls back.
begin;
create temporary table access_fixture(owner_id uuid,other_id uuid,member_id uuid,event_id uuid,type_id uuid,ticket_id uuid,session_id uuid,operation_id uuid,link text,code text);
insert into access_fixture select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,gen_random_uuid(),gen_random_uuid(),repeat('a',64),null;
grant select on access_fixture to authenticated;
insert into auth.users(id,raw_app_meta_data) select owner_id,'{}'::jsonb from access_fixture union all select other_id,'{}'::jsonb from access_fixture;
insert into public.organization_access_links(organizer_id,identifier) select owner_id,link from access_fixture;
insert into public.staff_members(id,organizer_id,display_name,username,creation_key,access_invalid_before)
  select member_id,owner_id,'Personal sintético','fixture',gen_random_uuid(),clock_timestamp()-interval '1 hour' from access_fixture;
insert into auth.users(id,email,raw_app_meta_data)
  select member_id,member_id::text||'@staff.invalid',jsonb_build_object('account_type','access_staff','staff_member_id',member_id,'organizer_id',owner_id) from access_fixture;
update public.staff_members set auth_user_id=id,provisioning_status='ready' where id=(select member_id from access_fixture);
insert into auth.sessions(id,user_id,created_at,updated_at)
  select session_id,member_id,clock_timestamp()-interval '1 minute',clock_timestamp() from access_fixture;
insert into public.events(id,propietario_id,titulo,descripcion,fecha,lugar,aforo_maximo)
  select event_id,owner_id,'Evento sintético de acceso','',clock_timestamp(),'Prueba',10 from access_fixture;
insert into public.ticket_types(id,evento_id,nombre,aforo_maximo) select type_id,event_id,'General',10 from access_fixture;
update public.events set estado='publicado' where id=(select event_id from access_fixture);
insert into public.staff_event_assignments(staff_member_id,event_id,organizer_id) select member_id,event_id,owner_id from access_fixture;
insert into public.registrations(comprador_id,evento_id,tipo_entrada_id,nombre_titular,correo_titular,clave_idempotencia)
  select owner_id,event_id,type_id,'Titular sintético','fixture@example.test',gen_random_uuid() from access_fixture;
update access_fixture f set ticket_id=t.id,code=t.codigo from public.tickets t join public.registrations r on r.id=t.registro_id where r.evento_id=f.event_id;

-- Independent window boundaries, including crossing midnight in Guatemala.
do $$
declare span tstzrange;
begin
  span:=private.access_window('2026-11-10 21:00:00-06','America/Guatemala',120);
  assert span @> '2026-11-10 00:00:00-06'::timestamptz;
  assert span @> '2026-11-11 01:59:59-06'::timestamptz;
  assert not (span @> '2026-11-11 02:00:00-06'::timestamptz);
  assert not (span @> '2026-11-09 23:59:59-06'::timestamptz);
  assert upper(private.access_window('2026-11-10 21:00:00-06','America/Guatemala',0))='2026-11-11 00:00:00-06'::timestamptz;
  assert upper(private.access_window('2026-11-10 21:00:00-06','America/Guatemala',720))='2026-11-11 12:00:00-06'::timestamptz;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated','session_id',session_id)::text,true) from access_fixture;
do $$
declare f access_fixture%rowtype; answer jsonb;
begin
  select * into f from access_fixture;
  assert public.staff_access(f.link,'start')->>'staffMemberId'=f.member_id::text;
  assert not public.is_organizer_account();
  assert not exists(select 1 from public.events);
  assert not exists(select 1 from public.registrations);
  assert not exists(select 1 from public.tickets);
  assert not exists(select 1 from public.staff_members);
  assert not exists(select 1 from public.ticket_validation_attempts);
  assert public.staff_access(f.link,'events')#>>'{events,0,id}'=f.event_id::text;
  answer:=public.staff_access(f.link,'validate',f.event_id,f.code,f.operation_id,'camera');
  assert answer->>'result'='accepted', 'Valid ticket not admitted';
  assert answer->>'holderName'='Titular sintético';
  assert public.staff_access(f.link,'validate',f.event_id,f.code,f.operation_id,'manual')->>'replayed'='true';
  assert public.staff_access(f.link,'recover',f.event_id,null,f.operation_id)->>'replayed'='true';
  assert public.staff_access(f.link,'validate',f.event_id,repeat('0',64),f.operation_id,'manual')->>'error'='accessOperationConflict';
  assert public.staff_access(f.link,'validate',f.event_id,f.code,gen_random_uuid(),'manual')->>'error'='accessTicketUsed';
  assert public.staff_access(f.link,'validate',f.event_id,'bad-code',gen_random_uuid(),'manual')->>'error'='accessCodeInvalid';
  assert public.staff_access(f.link,'validate',f.event_id,repeat('0',64),gen_random_uuid(),'manual')->>'error'='accessTicketNotFound';
  assert public.staff_access(f.link,'recover',f.event_id,null,gen_random_uuid())->>'result'='unconfirmed';
end $$;
reset role;
do $$
declare f access_fixture%rowtype; expired_operation uuid:=gen_random_uuid(); answer jsonb;
begin
  select * into f from access_fixture;
  assert (select estado='used' from public.tickets where id=f.ticket_id);
  assert (select count(*)=1 from public.ticket_validation_attempts where ticket_reference=f.ticket_id and result='accepted');
  assert not has_function_privilege('anon','public.staff_access(text,text,uuid,text,uuid,text)','execute');
  assert not has_function_privilege('authenticated','public.resolve_staff_login(text,text)','execute');
  assert not has_table_privilege('authenticated','public.ticket_validation_attempts','insert');
  assert not has_table_privilege('authenticated','public.staff_access_sessions','update');
  update public.events set fecha=fecha-interval '2 days' where id=f.event_id;
  assert public.staff_access(f.link,'validate',f.event_id,f.code,gen_random_uuid(),'manual')->>'error'='accessOutsideWindow';
  -- Recovery remains available after closing, without consuming again.
  assert public.staff_access(f.link,'recover',f.event_id,null,f.operation_id)->>'result'='accepted';
  update public.events set fecha=clock_timestamp(),estado='borrador' where id=f.event_id;
  assert public.staff_access(f.link,'validate',f.event_id,f.code,gen_random_uuid(),'manual')->>'error'='accessEventUnavailable';
  update public.events set estado='publicado' where id=f.event_id;
  delete from public.staff_event_assignments where staff_member_id=f.member_id;
  assert public.staff_access(f.link,'validate',f.event_id,f.code,gen_random_uuid(),'manual')->>'error'='eventUnavailable';
  insert into public.staff_event_assignments values(f.member_id,f.event_id,f.owner_id,clock_timestamp());
  update public.staff_members set is_active=false,access_invalid_before=clock_timestamp() where id=f.member_id;
  assert public.staff_access(f.link,'validate',f.event_id,f.code,gen_random_uuid(),'manual')->>'error'='staffAccessDenied';
  update public.staff_members set is_active=true where id=f.member_id;
  assert public.staff_access(f.link,'session')->>'error'='sessionRequired', 'Reactivation revived an old Auth session';
  update public.staff_members set access_invalid_before=clock_timestamp()-interval '1 hour' where id=f.member_id;
  update public.staff_access_sessions set last_activity_at=clock_timestamp()-interval '30 minutes' where auth_session_id=f.session_id;
  assert public.staff_access(f.link,'activity')->>'error'='accessSessionExpired';
  assert public.staff_access(f.link,'start')->>'error'='accessSessionExpired', 'Start revived an expired session';
  assert public.staff_access(f.link,'validate',f.event_id,f.code,expired_operation,'manual')->>'error'='accessSessionExpired';
  update public.staff_access_sessions set last_activity_at=clock_timestamp() where auth_session_id=f.session_id;
  -- Privileged fixture simulates a current authorized operational session.
  answer:=public.staff_access(f.link,'recover',f.event_id,null,expired_operation);
  assert answer->>'error'='accessSessionExpired' and answer->>'operationConfirmed'='true', 'Historical denial cannot be recovered conclusively';
end $$;

-- A failing audit insert must roll back the ticket update in the same subtransaction.
insert into public.registrations(comprador_id,evento_id,tipo_entrada_id,nombre_titular,correo_titular,clave_idempotencia)
  select owner_id,event_id,type_id,'Segundo titular','fixture2@example.test',gen_random_uuid() from access_fixture;
create function pg_temp.fail_access_audit() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure'; end $$;
create trigger test_fail_access_audit before insert on public.ticket_validation_attempts for each row execute function pg_temp.fail_access_audit();
do $$
declare f access_fixture%rowtype; target public.tickets%rowtype; failed boolean:=false;
begin
  select * into f from access_fixture;
  select t.* into target from public.tickets t join public.registrations r on r.id=t.registro_id where r.evento_id=f.event_id and t.id<>f.ticket_id;
  begin
    perform public.staff_access(f.link,'validate',f.event_id,target.codigo,gen_random_uuid(),'manual');
  exception when raise_exception then failed:=true; end;
  assert failed;
  assert (select estado='valid' from public.tickets where id=target.id), 'Ticket survived failed audit as used';
end $$;
drop trigger test_fail_access_audit on public.ticket_validation_attempts;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true) from access_fixture;
do $$ begin assert exists(select 1 from public.ticket_validation_attempts), 'Owner cannot read history'; end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true) from access_fixture;
do $$ begin assert not exists(select 1 from public.ticket_validation_attempts), 'Other owner can read history'; end $$;
reset role;
delete from public.events where id=(select event_id from access_fixture);
set constraints all immediate;
do $$
begin
  assert exists(select 1 from public.ticket_validation_attempts where organizer_id=(select owner_id from access_fixture) and event_id is null and event_title='Evento sintético de acceso' and result='accepted');
end $$;
rollback;
