import { errorResponse, jsonResponse } from "@/lib/api-response";
import type { RegistrationHistoryResponse } from "@/lib/domain";
import { adminClient, authenticatedBuyerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return errorResponse("invalidData", 400);
    const auth = await authenticatedBuyerClient(request);
    if (!auth) return errorResponse("sessionRequired", 401);
    const event = await auth.client.from("events").select("id,published_at,publication_date_estimated")
      .eq("id", id).eq("propietario_id", auth.buyerId).maybeSingle();
    if (event.error) return errorResponse("registrationsUnavailable", 503);
    if (!event.data) return errorResponse("eventUnavailable", 404);
    if (!event.data.published_at) return jsonResponse<RegistrationHistoryResponse>({ publishedAt: null, estimated: false, days: [] });
    const result = await adminClient().rpc("registration_history", { p_event_id: id });
    if (result.error) return errorResponse("registrationsUnavailable", 503);
    const response: RegistrationHistoryResponse = {
      publishedAt: event.data.published_at,
      estimated: event.data.publication_date_estimated,
      days: (result.data ?? []).map((row: { day: string; total: number }) => ({ date: row.day, count: Number(row.total) })),
    };
    return jsonResponse(response);
  } catch {
    return errorResponse("registrationsUnavailable", 503);
  }
}
