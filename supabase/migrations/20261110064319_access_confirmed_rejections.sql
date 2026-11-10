-- A recovered historical 401/403 is a confirmed attempt result, not a failure
-- of the current session. Preserve business HTTP status and mark only results
-- actually read from the immutable audit row. Current authorization still runs
-- before access_result and never receives this marker.
create or replace function private.access_result(p_attempt public.ticket_validation_attempts,p_replayed boolean) returns jsonb
language sql set search_path='' as $$
  select case when p_attempt.result='accepted' then jsonb_build_object('operationId',p_attempt.operation_id,
    'result','accepted','holderName',p_attempt.holder_name,'ticketTypeName',p_attempt.ticket_type_name,
    'validatedAt',p_attempt.created_at,'replayed',p_replayed)
  else jsonb_build_object('error',p_attempt.reason,'status',p_attempt.http_status,'operationConfirmed',true) end;
$$;
