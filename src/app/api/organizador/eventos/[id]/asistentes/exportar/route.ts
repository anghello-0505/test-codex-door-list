import { errorResponse } from "@/lib/api-response";
import { buildCsv } from "@/lib/csv";
import { formatEventDate } from "@/lib/date";
import { findOrganizerEvent } from "@/lib/organizer-events";
import { mapAttendeeExportEntries } from "@/lib/persistence-mappers";
import { authenticatedBuyerClient } from "@/lib/supabase/server";
import { ticketStatusLabels } from "@/lib/ticket-code";
import { isUuid } from "@/lib/validation";

const batchSize = 500;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return errorResponse("invalidData", 400);
    const auth = await authenticatedBuyerClient(request);
    if (!auth) return errorResponse("sessionRequired", 401);
    const event = await findOrganizerEvent(auth.client, id, auth.buyerId);
    if (!event) return errorResponse("eventUnavailable", 404);

    const rows: string[][] = [["Nombre del asistente", "Correo electrónico", "Tipo de entrada", "Estado de entrada", "Fecha de compra"]];
    let cursor: string | null = null;
    while (true) {
      if (request.signal.aborted) throw new Error("Export cancelled");
      let query = auth.client.from("tickets")
        .select("id,estado,registration:registrations!inner(nombre_titular,correo_titular,tipo_entrada_id,created_at,evento_id)")
        .eq("estado", "valid").eq("registration.evento_id", id)
        .order("id", { ascending: true }).limit(batchSize).abortSignal(request.signal);
      if (cursor) query = query.gt("id", cursor);
      const result = await query;
      if (result.error || !result.data) throw new Error("Export query failed");
      const entries = mapAttendeeExportEntries(result.data, event.ticketTypes);
      if (!entries.length) break;
      for (const entry of entries) {
        rows.push([entry.holderName, entry.holderEmail, entry.ticketTypeName, ticketStatusLabels[entry.status], formatEventDate(entry.createdAt)]);
      }
      const nextCursor = entries.at(-1)!.id;
      if (nextCursor === cursor) throw new Error("Export cursor did not advance");
      cursor = nextCursor;
      // Continue until an empty batch: a project-side row limit may be below 500.
    }
    return new Response(buildCsv(rows), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="asistentes-${id}.csv"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    } });
  } catch {
    return errorResponse("registrationsUnavailable", 503);
  }
}
