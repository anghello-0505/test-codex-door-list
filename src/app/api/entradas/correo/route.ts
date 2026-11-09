import { errorResponse, jsonResponse } from "@/lib/api-response";
import type { TicketDeliveriesResponse } from "@/lib/domain";
import { deliverTicket, deliveryConfigured } from "@/lib/email-server";
import { mapTicketDeliveries } from "@/lib/persistence-mappers";
import { authenticatedBuyerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const auth = await authenticatedBuyerClient(request);
    if (!auth) return errorResponse("sessionRequired", 401);
    const registrationId = new URL(request.url).searchParams.get("registro");
    if (!isUuid(registrationId)) return errorResponse("invalidRegistration", 400);
    const { data, error } = await auth.client.rpc("estado_envios_entrada", { p_registro: registrationId });
    if (error) return errorResponse("deliveryUnavailable", 503);
    const response: TicketDeliveriesResponse = { deliveries: mapTicketDeliveries(data), configured: deliveryConfigured() };
    return jsonResponse(response);
  } catch {
    return errorResponse("deliveryUnavailable", 503);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticatedBuyerClient(request);
    if (!auth) return errorResponse("sessionRequired", 401);
    let registrationId: unknown;
    try { ({ registrationId } = await request.json() as { registrationId?: unknown }); }
    catch { return errorResponse("invalidRegistration", 400); }
    if (!isUuid(registrationId)) return errorResponse("invalidRegistration", 400);
    const { data: own, error } = await auth.client.from("registrations").select("id").eq("id", registrationId).eq("comprador_id", auth.buyerId).maybeSingle();
    if (error || !own) return errorResponse("ticketUnavailable", 404);
    if (!deliveryConfigured()) return errorResponse("deliveryNotConfigured", 503);
    await deliverTicket(registrationId, auth.buyerId);
    const result = await auth.client.rpc("estado_envios_entrada", { p_registro: registrationId });
    if (result.error) return errorResponse("deliveryUnavailable", 503);
    const response: TicketDeliveriesResponse = { deliveries: mapTicketDeliveries(result.data), configured: true };
    return jsonResponse(response);
  } catch {
    return errorResponse("deliveryUnavailable", 503);
  }
}
