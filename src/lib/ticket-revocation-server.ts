import "server-only";
import { errorResponse, jsonResponse } from "@/lib/api-response";
import { authenticatedBuyerClient, adminClient } from "@/lib/supabase/server";
import { deliveryConfigured } from "@/lib/email-server";
import { sendWithResend } from "@/lib/resend-delivery";
import { buildRevocationMessage } from "@/lib/ticket-revocation-email";
import { mapRevocationStatus, validRevocationReason, type TicketRevocationResponse } from "@/lib/ticket-revocation";
import type { EmailMessage } from "@/lib/ticket-email";
import { isUuid } from "@/lib/validation";

export async function deliverRevocation(id: string, organizerId: string) {
  const admin = adminClient();
  const { data: task, error } = await admin.rpc("claim_ticket_revocation_email", { p_id: id, p_organizer_id: organizerId });
  if (error) throw new Error("Revocation delivery unavailable");
  if (!task) return;
  let started = false;
  try {
    const message: EmailMessage = task.message ?? buildRevocationMessage({
      holderName: task.holder_name, holderEmail: task.holder_email, eventTitle: task.event_title, reason: task.reason,
    }, process.env.RESEND_FROM_EMAIL!);
    const marked = await admin.rpc("start_ticket_revocation_email", { p_id: id, p_lock_id: task.lock_id, p_message: message });
    if (marked.error || marked.data !== true) return;
    started = true;
    const result = await sendWithResend(message, `revocation/${id}`, process.env.RESEND_API_KEY!);
    const finished = await admin.rpc("finish_ticket_revocation_email", { p_id: id, p_lock_id: task.lock_id,
      p_status: result.status, p_uncertain: result.status !== "accepted" && (result.uncertain || task.uncertain), p_provider_id: result.resendId ?? null });
    if (finished.error) throw new Error("Unconfirmed delivery");
  } catch {
    await admin.rpc("finish_ticket_revocation_email", { p_id: id, p_lock_id: task.lock_id,
      p_status: "failed", p_uncertain: started || task.uncertain, p_provider_id: null });
  }
}

async function readReason(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 1 && validRevocationReason(input.reason)
      ? input.reason.trim() as string : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function revokeTicket(request: Request, eventId: string, registrationId: string) {
  try {
    if (!isUuid(eventId) || !isUuid(registrationId)) return errorResponse("invalidData", 400);
    const auth = await authenticatedBuyerClient(request);
    if (!auth) return errorResponse("sessionRequired", 401);
    if (Number(request.headers.get("content-length")) > 8192) return errorResponse("payloadTooLarge", 413);
    const reason = await readReason(request);
    if (!reason) return errorResponse("invalidData", 400);
    if (!deliveryConfigured()) return errorResponse("deliveryNotConfigured", 503);
    const result = await auth.client.rpc("revoke_ticket_with_reason", { p_event_id: eventId, p_registration_id: registrationId, p_reason: reason });
    if (result.error) return errorResponse("ticketRevocationUnavailable", 503);
    if (result.data?.error === "session_required") return errorResponse("sessionRequired", 401);
    if (result.data?.error === "denied") return errorResponse("ticketRevocationDenied", 404);
    if (result.data?.error === "conflict") return errorResponse("ticketRevocationConflict", 409);
    if (result.data?.error === "invalid_data") return errorResponse("invalidData", 400);
    if (!isUuid(result.data?.id)) return errorResponse("ticketRevocationUnavailable", 503);
    // A failed/uncertain provider attempt never rolls back the committed revocation.
    try { await deliverRevocation(result.data.id, auth.buyerId); } catch { /* Read durable status below. */ }
    const status = await auth.client.from("ticket_revocations").select("reason,delivery_status").eq("id", result.data.id).eq("organizer_id", auth.buyerId).maybeSingle();
    if (status.error || !status.data) return errorResponse("ticketRevocationUnavailable", 503);
    const response: TicketRevocationResponse = { ticketStatus: "revoked", reason: status.data.reason, emailStatus: mapRevocationStatus(status.data.delivery_status) };
    return jsonResponse(response);
  } catch { return errorResponse("ticketRevocationUnavailable", 503); }
}
