-- Event deletion cascades through registrations/tickets and also nulls the audit
-- event FK. Defer the ticket FK until all cascade paths have completed; otherwise
-- the intermediate event_id update can check a ticket already being deleted.
-- Historical ticket_reference remains immutable and is not a foreign key.
alter table public.ticket_validation_attempts
  alter constraint ticket_validation_attempts_ticket_id_fkey deferrable initially deferred;
