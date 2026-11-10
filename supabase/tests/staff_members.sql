-- Run ONLY after explicit approval on a disposable/development database with
-- 20261110042901_staff_members.sql applied. No passwords, emails or Auth API
-- calls are involved. All database fixtures are rolled back, including on failure.
begin;
create temporary table staff_fixture (
  owner_id uuid, other_id uuid, normal_id uuid,
  event_id uuid, second_event_id uuid, foreign_event_id uuid,
  member_id uuid, other_member_id uuid, creation_key uuid
);
insert into staff_fixture select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), null, null, gen_random_uuid();
grant select on staff_fixture to authenticated;

create function pg_temp.staff_expect_error(statement text, expected_state text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate <> expected_state then raise; end if;
    return;
  end;
  raise exception 'Expected SQLSTATE %', expected_state;
end;
$$;

insert into auth.users(id, raw_app_meta_data)
  select owner_id, '{}'::jsonb from staff_fixture union all
  select other_id, '{}'::jsonb from staff_fixture union all
  select normal_id, '{}'::jsonb from staff_fixture;
insert into public.events(id, propietario_id, titulo, descripcion, fecha, lugar, aforo_maximo)
  select event_id, owner_id, 'Staff RLS event', '', now() + interval '1 day', 'Test', 10 from staff_fixture union all
  select second_event_id, owner_id, 'Second event', '', now() + interval '2 days', 'Test', 10 from staff_fixture union all
  select foreign_event_id, other_id, 'Foreign event', '', now() + interval '1 day', 'Test', 10 from staff_fixture;

do $$
declare f staff_fixture%rowtype; first_id uuid; second_id uuid;
begin
  select * into f from staff_fixture;
  perform set_config('request.jwt.claim.sub', f.owner_id::text, true);
  first_id := public.reserve_staff_member('Maria', ' ALPHA ', '{}'::uuid[], f.creation_key);
  assert first_id = public.reserve_staff_member('Maria', 'alpha', '{}'::uuid[], f.creation_key), 'creation must be idempotent';
  assert (select provisioning_status = 'pending' and auth_user_id is null from public.staff_members where id = first_id);
  perform pg_temp.staff_expect_error(format('select public.reserve_staff_member(%L,%L,%L::uuid[],%L::uuid)', 'Duplicate', 'Alpha', '{}', gen_random_uuid()), '23505');
  perform pg_temp.staff_expect_error(format('select public.manage_staff_member(%L::uuid,%L)', first_id, 'complete'), 'P0001');
  perform set_config('request.jwt.claim.sub', f.other_id::text, true);
  second_id := public.reserve_staff_member('Other Maria', 'alpha', '{}'::uuid[], gen_random_uuid());
  assert second_id <> first_id, 'same username across organizers must have distinct identities';
  update staff_fixture set member_id = first_id, other_member_id = second_id;
end;
$$;

-- Simulate the already-banned Auth identities; this does not create working
-- credentials and cannot replace the separate real Auth integration check.
insert into auth.users(id, email, banned_until, raw_app_meta_data, raw_user_meta_data)
  select member_id, member_id::text || '@staff.invalid', now() + interval '100 years',
    jsonb_build_object('account_type','access_staff','staff_member_id',member_id,'organizer_id',owner_id),
    '{"role":"organizer","account_type":"normal"}'::jsonb from staff_fixture union all
  select other_member_id, other_member_id::text || '@staff.invalid', now() + interval '100 years',
    jsonb_build_object('account_type','access_staff','staff_member_id',other_member_id,'organizer_id',other_id), '{}'::jsonb from staff_fixture;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select owner_id::text from staff_fixture), true);
do $$
declare f staff_fixture%rowtype; original_invalid_before timestamptz;
begin
  select * into f from staff_fixture;
  assert public.is_organizer_account();
  assert (select count(*) from public.staff_members) = 1, 'owner cannot read foreign staff';
  perform public.manage_staff_member(f.member_id, 'complete');
  assert (select provisioning_status = 'ready' from public.staff_members where id = f.member_id);
  perform public.manage_staff_member(f.member_id, 'update', '{"name":"Maria Updated","username":" ALPHA2 "}'::jsonb);
  assert (select display_name = 'Maria Updated' and username = 'alpha2' from public.staff_members where id = f.member_id);
  perform public.manage_staff_member(f.member_id, 'events', jsonb_build_object('eventIds', jsonb_build_array(f.event_id, f.second_event_id)));
  assert (select count(*) from public.staff_event_assignments) = 2;
  perform pg_temp.staff_expect_error(format('select public.manage_staff_member(%L::uuid,%L,%L::jsonb)', f.member_id, 'events', jsonb_build_object('eventIds',jsonb_build_array(f.foreign_event_id))), 'P0001');
  assert (select count(*) from public.staff_event_assignments) = 2, 'failed replacement must roll back';
  perform pg_temp.staff_expect_error(format('select public.manage_staff_member(%L::uuid,%L,%L::jsonb)', f.member_id, 'events', jsonb_build_object('eventIds',jsonb_build_array(f.event_id,f.event_id))), '22023');
  assert (select count(*) from public.staff_event_assignments) = 2;
  select access_invalid_before into original_invalid_before from public.staff_members where id = f.member_id;
  perform public.manage_staff_member(f.member_id, 'update', '{"isActive":false}'::jsonb);
  assert (select not is_active and access_invalid_before >= original_invalid_before from public.staff_members where id = f.member_id);
  assert (select count(*) from public.staff_event_assignments) = 2, 'deactivation keeps assignments';
  perform pg_temp.staff_expect_error(format('select public.reserve_staff_member(%L,%L,%L::uuid[],%L::uuid)', 'Duplicate', 'alpha2', '{}', gen_random_uuid()), '23505');
  perform public.manage_staff_member(f.member_id, 'update', '{"isActive":true}'::jsonb);
  assert (select is_active from public.staff_members where id = f.member_id);
  perform public.manage_staff_member(f.member_id, 'invalidate');
  perform pg_temp.staff_expect_error(format('select public.manage_staff_member(%L::uuid,%L)', f.other_member_id, 'delete'), 'P0001');
  perform pg_temp.staff_expect_error(format('select public.manage_staff_member(%L::uuid,%L)', f.other_member_id, 'invalidate'), 'P0001');
  perform pg_temp.staff_expect_error(format('update public.staff_members set organizer_id = %L::uuid where id = %L::uuid', f.other_id, f.member_id), '42501');
  perform pg_temp.staff_expect_error(format('delete from public.staff_members where id = %L::uuid', f.member_id), '42501');
  perform pg_temp.staff_expect_error(format('insert into public.staff_event_assignments(staff_member_id,event_id,organizer_id) values (%L,%L,%L)', f.member_id,f.foreign_event_id,f.owner_id), '42501');
  perform public.manage_staff_member(f.member_id, 'events', '{"eventIds":[]}'::jsonb);
  assert (select count(*) from public.staff_event_assignments) = 0;
  perform public.manage_staff_member(f.member_id, 'events', jsonb_build_object('eventIds',jsonb_build_array(f.event_id)));
end;
$$;

select set_config('request.jwt.claim.sub', (select other_id::text from staff_fixture), true);
do $$
declare f staff_fixture%rowtype;
begin
  select * into f from staff_fixture;
  assert (select count(*) from public.staff_members) = 1;
  assert not exists(select 1 from public.staff_event_assignments);
  perform pg_temp.staff_expect_error(format('select public.manage_staff_member(%L::uuid,%L,%L::jsonb)', f.member_id, 'events', jsonb_build_object('eventIds',jsonb_build_array(f.foreign_event_id))), 'P0001');
end;
$$;

-- A regular account still has the existing right to organize its own resources.
select set_config('request.jwt.claim.sub', (select normal_id::text from staff_fixture), true);
do $$
begin
  assert public.is_organizer_account();
  assert not exists(select 1 from public.staff_members);
  assert public.reserve_staff_member('Normal owner staff', 'alpha', '{}'::uuid[], gen_random_uuid()) is not null;
end;
$$;

-- Staff are rejected even with forged user_metadata or simulated issued tokens.
select set_config('request.jwt.claim.sub', (select member_id::text from staff_fixture), true);
do $$
declare f staff_fixture%rowtype;
begin
  select * into f from staff_fixture;
  assert not public.is_organizer_account();
  assert not exists(select 1 from public.staff_members);
  assert not exists(select 1 from public.staff_event_assignments);
  assert not exists(select 1 from public.events);
  assert public.confirmar_registro(f.event_id, gen_random_uuid(), 'Holder', 'holder@example.test', gen_random_uuid())->>'estado' = 'sesion_requerida';
  assert public.cambiar_estado_ticket(repeat('a',64), 'used')->>'estado' = 'sesion_requerida';
  perform pg_temp.staff_expect_error('select public.mis_boletos()', '42501');
  perform pg_temp.staff_expect_error(format('select public.reserve_staff_member(%L,%L,%L::uuid[],%L::uuid)', 'Nested staff', 'nested', '{}', gen_random_uuid()), '42501');
  perform pg_temp.staff_expect_error(format('insert into public.events(propietario_id,titulo,descripcion,fecha,lugar,aforo_maximo) values (%L,%L,%L,now(),%L,10)',f.member_id,'Denied','','Test'), '42501');
end;
$$;

reset role;
do $$
declare f staff_fixture%rowtype;
begin
  select * into f from staff_fixture;
  assert (select banned_until > now() from auth.users where id=f.member_id), 'reactivation did not unban Auth';
  update auth.users set raw_app_meta_data = '{}'::jsonb, banned_until = null where id = f.member_id;
  perform set_config('request.jwt.claim.sub', f.member_id::text, true);
  assert not public.is_organizer_account(), 'staff relation prevents escalation even if Auth metadata is removed';
  perform pg_temp.staff_expect_error(format('insert into public.staff_event_assignments(staff_member_id,event_id,organizer_id) values (%L,%L,%L)',f.member_id,f.foreign_event_id,f.other_id),'23503');
  assert not has_table_privilege('anon','public.staff_members','select');
  assert not has_table_privilege('authenticated','public.staff_members','truncate');
  assert not has_function_privilege('anon','public.reserve_staff_member(text,text,uuid[],uuid)','execute');
  assert not has_function_privilege('authenticated','private.replace_staff_event_assignments(uuid,uuid,uuid[])','execute');
  assert not (select prosecdef from pg_proc where oid='public.manage_staff_member(uuid,text,jsonb)'::regprocedure);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select owner_id::text from staff_fixture), true);
do $$
declare f staff_fixture%rowtype; replacement uuid;
begin
  select * into f from staff_fixture;
  perform public.manage_staff_member(f.member_id, 'delete');
  assert (select deleted_at is not null and not is_active from public.staff_members where id=f.member_id);
  assert exists(select 1 from public.staff_event_assignments where staff_member_id=f.member_id), 'logical deletion keeps referential history';
  perform pg_temp.staff_expect_error(format('select public.manage_staff_member(%L::uuid,%L,%L::jsonb)',f.member_id,'update','{"isActive":true}'),'P0001');
  replacement := public.reserve_staff_member('Replacement', 'alpha2', '{}'::uuid[], gen_random_uuid());
  assert replacement <> f.member_id, 'reused usernames must receive a new identity';
  delete from public.events where id=f.event_id;
  assert not exists(select 1 from public.staff_event_assignments where event_id=f.event_id);
  assert exists(select 1 from public.staff_members where id=f.member_id), 'deleting an event cannot delete staff';
end;
$$;
rollback;
