-- Cover nullable live-resource FKs used by ON DELETE SET NULL, independently
-- from the immutable historical references and organizer pagination indexes.
create index ticket_validation_live_event_idx on public.ticket_validation_attempts(event_id);
create index ticket_validation_live_ticket_idx on public.ticket_validation_attempts(ticket_id);
