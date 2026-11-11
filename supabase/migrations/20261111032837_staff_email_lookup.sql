-- Exact holder email lookup; never grants direct table access to staff.
create index registrations_event_holder_email_idx on public.registrations(evento_id, lower(correo_titular));

create function private.staff_search_email(p_link text, p_event_id uuid, p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; event public.events%rowtype; matches jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('error','sessionRequired','status',401); end if;
  perform set_config('lock_timeout','5s',true);
  if p_event_id is null or p_email is null or length(btrim(p_email)) > 254 or
      btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('error','invalidData','status',400);
  end if;
  context:=private.access_context(p_link,false);
  if context ? 'error' then return context; end if;
  select * into event from public.events where id=p_event_id and propietario_id=(context->>'organizerId')::uuid for share;
  if not found then return jsonb_build_object('error','eventUnavailable','status',404); end if;
  perform 1 from public.staff_event_assignments where staff_member_id=auth.uid() and event_id=event.id
    and organizer_id=(context->>'organizerId')::uuid for share;
  if not found then return jsonb_build_object('error','eventUnavailable','status',404); end if;
  if event.estado<>'publicado' then return jsonb_build_object('error','accessEventUnavailable','status',409); end if;
  if not (private.access_window(event.fecha,event.access_time_zone,event.access_grace_minutes) @> clock_timestamp()) then
    return jsonb_build_object('error','accessOutsideWindow','status',409);
  end if;
  if not private.access_rate('email-search:'||auth.uid()::text,30,60) then
    return jsonb_build_object('error','accessRateLimited','status',429);
  end if;
  select coalesce(jsonb_agg(row_data order by ticket_id),'[]'::jsonb) into matches from (
    select t.id as ticket_id, jsonb_build_object('ticketId',t.id,'holderName',r.nombre_titular,
      'ticketTypeName',tt.nombre,'status',t.estado,'code',t.codigo) as row_data
    from public.registrations r join public.tickets t on t.registro_id=r.id
      join public.ticket_types tt on tt.id=r.tipo_entrada_id
    where r.evento_id=event.id and lower(r.correo_titular)=lower(btrim(p_email))
    order by t.id limit 21
  ) candidates;
  update public.staff_access_sessions set last_activity_at=clock_timestamp() where auth_session_id=(context->>'sessionId')::uuid;
  return jsonb_build_object('tickets',case when jsonb_array_length(matches)>20 then matches-20 else matches end,
    'truncated',jsonb_array_length(matches)>20);
end;
$$;
revoke all on function private.staff_search_email(text,uuid,text) from public,anon,authenticated;
grant execute on function private.staff_search_email(text,uuid,text) to authenticated;
create function public.staff_search_email(p_link text,p_event_id uuid,p_email text) returns jsonb
language sql security invoker set search_path='' as $$ select private.staff_search_email(p_link,p_event_id,p_email); $$;
revoke all on function public.staff_search_email(text,uuid,text) from public,anon,authenticated;
grant execute on function public.staff_search_email(text,uuid,text) to authenticated;
