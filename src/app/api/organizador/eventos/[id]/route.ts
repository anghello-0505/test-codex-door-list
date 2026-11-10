import { errorResponse, jsonResponse } from "@/lib/api-response";
import type { OrganizerEventDetailResponse } from "@/lib/domain";
import { mapOrganizerRegistrations } from "@/lib/persistence-mappers";
import { findOrganizerEvent } from "@/lib/organizer-events";
import { ticketAvailability } from "@/lib/ticket-availability";
import { authenticatedBuyerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";

const pageSize = 50;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  let stage = "request";
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return errorResponse("invalidData", 400);

    stage = "authentication";
    const auth = await authenticatedBuyerClient(request);
    if (!auth) return errorResponse("sessionRequired", 401);

    const pageParam = new URL(request.url).searchParams.get("page") ?? "1";
    const page = Number(pageParam);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return errorResponse("invalidData", 400);

    stage = "eventLookup";
    const event = await findOrganizerEvent(auth.client, id, auth.buyerId);
    if (!event) return errorResponse("eventUnavailable", 404);

    stage = "registrationQueries";
    const registrationsClient = auth.client;
    const start = (page - 1) * pageSize;
    const [registrationResult, ...countResults] = await Promise.all([
      registrationsClient.from("registrations")
        .select("id,nombre_titular,correo_titular,tipo_entrada_id,created_at", { count: "exact" })
        .eq("evento_id", id).order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(start, start + pageSize - 1),
      ...event.ticketTypes.map((ticketType) => registrationsClient.from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("evento_id", id).eq("tipo_entrada_id", ticketType.id)),
    ]);
    if (registrationResult.error || countResults.some((result) => result.error)) {
      const failedResult = registrationResult.error ?? countResults.find((result) => result.error)?.error;
      console.error("Organizer dashboard query failed", { stage, code: failedResult?.code ?? "unknown" });
      return errorResponse("registrationsUnavailable", 503);
    }

    if (!Number.isSafeInteger(registrationResult.count) || registrationResult.count! < 0 || registrationResult.data === null) {
      throw new Error("Missing registrations");
    }
    const response: OrganizerEventDetailResponse = {
      event,
      ticketTypes: event.ticketTypes.map((ticketType, index) => ({
        ...ticketType,
        ...ticketAvailability(ticketType.capacity, countResults[index].count ?? NaN),
      })),
      registrations: mapOrganizerRegistrations(registrationResult.data, event.ticketTypes),
      registrationCount: registrationResult.count!,
      page,
      pageSize,
    };
    return jsonResponse(response);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "unknown";
    console.error("Organizer dashboard request failed", { stage, code });
    return errorResponse("registrationsUnavailable", 503);
  }
}
