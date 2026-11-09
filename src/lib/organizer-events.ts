import type { SupabaseClient } from "@supabase/supabase-js";
import { mapOrganizerEvents } from "@/lib/persistence-mappers";

// RLS also permits buyers to read their registrations. Always verify ownership
// before exposing organizer data, even when the event is publicly readable.
export async function findOrganizerEvent(client: SupabaseClient, eventId: string, userId: string) {
  const result = await client.from("events")
    .select("id,titulo,descripcion,fecha,lugar,estado,aforo_maximo,tipos_entrada:ticket_types(id,evento_id,nombre,aforo_maximo)")
    .eq("id", eventId).eq("propietario_id", userId).maybeSingle();
  if (result.error) throw new Error("Event query failed");
  if (!result.data) return null;
  const event = mapOrganizerEvents([result.data])[0];
  // The generic persistence mapper defaults malformed numbers to zero. Reject
  // them here rather than publishing invented organizer availability.
  if (!Number.isSafeInteger(event.capacity) || event.capacity <= 0 ||
      event.ticketTypes.some((type) => !Number.isSafeInteger(type.capacity) || type.capacity <= 0)) {
    throw new Error("Invalid capacity");
  }
  return event;
}
