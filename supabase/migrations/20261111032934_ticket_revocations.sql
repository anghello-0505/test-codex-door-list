-- Revocation and its holder notification are committed together. Only the
-- service role can claim delivery jobs; organizers can read their own status.
create table public.ticket_revocations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  organizer_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  holder_name text not null,
  holder_email text not null,
  event_title text not null,
  created_at timestamptz not null default now(),
  delivery_status text not null default 'pending' check (delivery_status in ('pending','sending','accepted','failed','review')),
  message jsonb,
  uncertain boolean not null default false,
  first_sent_at timestamptz,
  last_attempt_at timestamptz,
  lock_id uuid,
  lock_until timestamptz,
  provider_id text
);
create index ticket_revocations_organizer_idx on public.ticket_revocations(organizer_id);
alter table public.ticket_revocations enable row level security;
revoke all on public.ticket_revocations from public,anon,authenticated;
grant select(id,ticket_id,organizer_id,reason,delivery_status) on public.ticket_revocations to authenticated;
grant all on public.ticket_revocations to service_role;
create policy ticket_revocations_owner_read on public.ticket_revocations for select to authenticated
  using (organizer_id=(select auth.uid()) and (select private.is_standard_account()));

create function private.revoke_ticket_with_reason(p_event_id uuid,p_registration_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ticket public.tickets%rowtype; job public.ticket_revocations%rowtype; event public.events%rowtype; holder public.registrations%rowtype;
begin
  if not private.is_standard_account() or not exists (
    select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid()
      and (s.not_after is null or s.not_after>clock_timestamp())
  ) then return jsonb_build_object('error','session_required'); end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000
    or p_reason ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then return jsonb_build_object('error','invalid_data'); end if;
  -- Same event -> ticket lock order as admission; deletion waits for this job.
  select * into event from public.events where id=p_event_id and propietario_id=auth.uid() for share;
  if not found then return jsonb_build_object('error','denied'); end if;
  select * into holder from public.registrations where id=p_registration_id and evento_id=event.id;
  if not found then return jsonb_build_object('error','denied'); end if;
  select * into ticket from public.tickets where registro_id=holder.id for update;
  if not found then return jsonb_build_object('error','denied'); end if;
  select * into job from public.ticket_revocations where ticket_id=ticket.id;
  if found then
    if job.reason is distinct from btrim(p_reason) or ticket.estado<>'revoked' then return jsonb_build_object('error','conflict'); end if;
    return jsonb_build_object('id',job.id);
  end if;
  -- Historical revoked tickets never invent a reason or silently send an email.
  if ticket.estado<>'valid' then return jsonb_build_object('error','conflict'); end if;
  update public.tickets set estado='revoked' where id=ticket.id;
  insert into public.ticket_revocations(ticket_id,organizer_id,reason,holder_name,holder_email,event_title)
    values(ticket.id,auth.uid(),btrim(p_reason),holder.nombre_titular,holder.correo_titular,event.titulo) returning * into job;
  return jsonb_build_object('id',job.id);
end;
$$;
revoke all on function private.revoke_ticket_with_reason(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.revoke_ticket_with_reason(uuid,uuid,text) to authenticated;
create function public.revoke_ticket_with_reason(p_event_id uuid,p_registration_id uuid,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$ select private.revoke_ticket_with_reason(p_event_id,p_registration_id,p_reason); $$;
revoke all on function public.revoke_ticket_with_reason(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.revoke_ticket_with_reason(uuid,uuid,text) to authenticated;

-- Disable the legacy path, which accepts neither a reason nor a notification.
revoke all on function public.cambiar_estado_ticket(text,text) from public,anon,authenticated;

create function public.claim_ticket_revocation_email(p_id uuid,p_organizer_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.ticket_revocations%rowtype;
begin
  select * into job from public.ticket_revocations where id=p_id and organizer_id=p_organizer_id for update;
  if not found or job.delivery_status in ('accepted','review') then return null; end if;
  if job.lock_until>clock_timestamp() or job.last_attempt_at>clock_timestamp()-interval '60 seconds' then return null; end if;
  if job.uncertain and job.first_sent_at<clock_timestamp()-interval '23 hours' then
    update public.ticket_revocations set delivery_status='review',lock_id=null,lock_until=null where id=p_id;
    return null;
  end if;
  update public.ticket_revocations set delivery_status='sending',last_attempt_at=clock_timestamp(),
    lock_id=gen_random_uuid(),lock_until=clock_timestamp()+interval '3 minutes' where id=p_id returning * into job;
  return to_jsonb(job);
end;
$$;
revoke all on function public.claim_ticket_revocation_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_ticket_revocation_email(uuid,uuid) to service_role;

create function public.start_ticket_revocation_email(p_id uuid,p_lock_id uuid,p_message jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.ticket_revocations set message=coalesce(message,p_message),uncertain=true,first_sent_at=coalesce(first_sent_at,clock_timestamp())
    where id=p_id and lock_id=p_lock_id and lock_until>clock_timestamp() and delivery_status='sending';
  return found;
end;
$$;
revoke all on function public.start_ticket_revocation_email(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.start_ticket_revocation_email(uuid,uuid,jsonb) to service_role;

create function public.finish_ticket_revocation_email(p_id uuid,p_lock_id uuid,p_status text,p_uncertain boolean,p_provider_id text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('accepted','failed','review') or p_uncertain is null then raise exception 'Invalid delivery status'; end if;
  update public.ticket_revocations set delivery_status=p_status,uncertain=p_uncertain,provider_id=p_provider_id,lock_id=null,lock_until=null
    where id=p_id and lock_id=p_lock_id and delivery_status='sending';
end;
$$;
revoke all on function public.finish_ticket_revocation_email(uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.finish_ticket_revocation_email(uuid,uuid,text,boolean,text) to service_role;
