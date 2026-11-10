import { after } from "next/server";
import { errorResponse, jsonResponse } from "@/lib/api-response";
import type { ConfirmRegistrationRequest, ConfirmRegistrationSuccess } from "@/lib/domain";
import { deliverTicket, deliveryConfigured } from "@/lib/email-server";
import { mapRegistrationResult } from "@/lib/persistence-mappers";
import { authenticatedBuyerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const auth = await authenticatedBuyerClient(request);
    if (!auth) return errorResponse("sessionRequired", 401);
    if (Number(request.headers.get("content-length")) > 4096) return errorResponse("payloadTooLarge", 413);
    let input: Partial<ConfirmRegistrationRequest>;
    try { input = await request.json() as Partial<ConfirmRegistrationRequest>; }
    catch { return errorResponse("invalidData", 400); }
    if (![input.eventId, input.ticketTypeId, input.idempotencyKey].every(isUuid) ||
      typeof input.name !== "string" || input.name.length > 200 ||
      typeof input.email !== "string" || input.email.length > 254) {
      return errorResponse("invalidData", 400);
    }
    const { data, error } = await auth.client.rpc("confirmar_registro", {
      p_evento_id: input.eventId,
      p_tipo_entrada_id: input.ticketTypeId,
      p_nombre: input.name,
      p_correo: input.email,
      p_clave: input.idempotencyKey,
    });
    if (error || !data) return errorResponse("unknownResult", 503);
    const result = mapRegistrationResult(data);
    if (result.status === "confirmed") {
      after(async () => { try { await deliverTicket(result.registrationId, auth.buyerId); } catch { /* Durable tasks remain recoverable. */ } });
      const response: ConfirmRegistrationSuccess = {
        registrationId: result.registrationId,
        ticket: result.ticket,
        emailConfigured: deliveryConfigured(),
      };
      return jsonResponse(response);
    }
    if (result.status === "sessionRequired") return errorResponse("sessionRequired", 401);
    if (result.status === "invalidData") return errorResponse("invalidData", 400);
    if (result.status === "eventUnavailable") return errorResponse("eventUnavailable", 409);
    if (result.status === "ticketTypeSoldOut") return errorResponse("ticketTypeSoldOut", 409);
    if (result.status === "invalidTicketType") return errorResponse("invalidTicketType", 400);
    return errorResponse("unknownResult", 503);
  } catch {
    return errorResponse("unknownResult", 503);
  }
}
