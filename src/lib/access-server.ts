import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient, authenticatedBuyerClient } from "@/lib/supabase/server";
import { enableStaffIdentity, staffTechnicalEmail } from "@/lib/staff-auth";
import { readStaffBody, StaffError } from "@/lib/staff-members-server";
import { errorResponse, jsonResponse } from "@/lib/api-response";
import { validAccessLink } from "@/lib/access-control";
import { isUuid } from "@/lib/validation";
import { normalizeAccessEmail } from "@/lib/access-email";
import { normalizeStaffUsername, validStaffUsername, validStaffPassword } from "@/lib/staff-member-validation";
import type { ApiErrorCode, ValidationHistoryEntry } from "@/lib/domain";

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
function sameOrigin(request: Request) {
  return !request.headers.get("origin") || request.headers.get("origin") === new URL(request.url).origin;
}
function publicClient(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configuration");
  return createClient(url, key, { auth: authOptions,
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}) });
}
function rpcResponse(data: Record<string, unknown> | null) {
  if (!data) return errorResponse("accessUnavailable", 503);
  if (typeof data.error === "string") {
    const response = errorResponse(data.error as ApiErrorCode, typeof data.status === "number" ? data.status : 503);
    if (data.operationConfirmed === true) response.headers.set("X-Access-Operation-Confirmed", "true");
    return response;
  }
  const { status, ...body } = data;
  return jsonResponse(body, typeof status === "number" ? status : 200);
}
export async function accessRpc(client: SupabaseClient, link: string, action: string, values: Record<string, unknown> = {}) {
  const result = await client.rpc("staff_access", { p_link: link, p_action: action, ...values });
  if (result.error) return errorResponse("accessUnavailable", 503);
  return rpcResponse(result.data);
}

export async function loginAccess(request: Request, link: string) {
  try {
    if (!sameOrigin(request)) return errorResponse("staffAccessDenied", 403);
    if (!validAccessLink(link)) return errorResponse("accessCredentialsInvalid", 401);
    const input = await readStaffBody(request);
    if (Object.keys(input).some((key) => !["username", "password"].includes(key)) ||
        !validStaffUsername(input.username) || !validStaffPassword(input.password)) return errorResponse("accessCredentialsInvalid", 401);
    const lookup = await adminClient().rpc("resolve_staff_login", { p_link: link, p_username: normalizeStaffUsername(input.username) });
    if (lookup.error || !lookup.data) return errorResponse("accessUnavailable", 503);
    if (lookup.data.error) return rpcResponse(lookup.data);
    const { memberId, organizerId } = lookup.data;
    if (!isUuid(memberId) || !isUuid(organizerId)) return errorResponse("accessUnavailable", 503);
    await enableStaffIdentity(memberId, organizerId);
    const client = publicClient();
    const result = await client.auth.signInWithPassword({ email: staffTechnicalEmail(memberId), password: input.password });
    if (result.error || !result.data.session || result.data.user?.id !== memberId) return errorResponse("accessCredentialsInvalid", 401);
    const operational = await accessRpc(client, link, "start");
    if (!operational.ok) {
      await client.auth.signOut({ scope: "local" }).catch(() => undefined);
      return operational;
    }
    return jsonResponse({ session: await operational.json(), tokens: {
      accessToken: result.data.session.access_token, refreshToken: result.data.session.refresh_token,
    } });
  } catch (error) { return error instanceof StaffError ? errorResponse(error.errorCode, error.status) : errorResponse("accessUnavailable", 503); }
}

export async function accessRoute(request: Request, link: string, action: string, operationId?: string) {
  try {
    if (!sameOrigin(request)) return errorResponse("staffAccessDenied", 403);
    if (!validAccessLink(link)) return errorResponse("staffAccessDenied", 403);
    const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return errorResponse("sessionRequired", 401);
    const client = publicClient(token);
    const identity = await client.auth.getUser(token);
    if (identity.error || !identity.data.user) return errorResponse("sessionRequired", 401);
    if (action === "searchEmail") {
      const input = await readStaffBody(request);
      const email = normalizeAccessEmail(input.email);
      if (Object.keys(input).some((key) => !["eventId", "email"].includes(key)) || !isUuid(input.eventId) || !email) return errorResponse("invalidData", 400);
      const result = await client.rpc("staff_search_email", { p_link: link, p_event_id: input.eventId, p_email: email });
      return result.error ? errorResponse("accessUnavailable", 503) : rpcResponse(result.data);
    }
    let values: Record<string, unknown> = {};
    if (action === "validate") {
      const input = await readStaffBody(request);
      if (Object.keys(input).some((key) => !["eventId", "code", "operationId", "source"].includes(key)) ||
          !isUuid(input.eventId) || !isUuid(input.operationId) || typeof input.code !== "string" ||
          new TextEncoder().encode(input.code).length > 1024 || !["camera", "manual"].includes(String(input.source))) return errorResponse("invalidData", 400);
      values = { p_event_id: input.eventId, p_code: input.code, p_operation_id: input.operationId, p_source: input.source };
    }
    if (action === "recover") {
      const eventId = new URL(request.url).searchParams.get("eventId");
      if (!isUuid(operationId) || !isUuid(eventId)) return errorResponse("invalidData", 400);
      values = { p_operation_id: operationId, p_event_id: eventId };
    }
    const response = await accessRpc(client, link, action, values);
    if (action === "logout" && response.ok) await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return response;
  } catch (error) { return error instanceof StaffError ? errorResponse(error.errorCode, error.status) : errorResponse("accessUnavailable", 503); }
}

export async function organizerAccessLink(request: Request) {
  try {
    const auth = await authenticatedBuyerClient(request);
    if (!auth) return errorResponse("sessionRequired", 401);
    const result = await auth.client.rpc("ensure_access_link");
    if (result.error || typeof result.data !== "string" || !validAccessLink(result.data)) return errorResponse("accessUnavailable", 503);
    return jsonResponse({ path: `/acceso/${result.data}` });
  } catch { return errorResponse("accessUnavailable", 503); }
}

export async function validationHistory(request: Request) {
  try {
    const auth = await authenticatedBuyerClient(request);
    if (!auth) return errorResponse("sessionRequired", 401);
    const account = await auth.client.rpc("is_organizer_account");
    if (account.error) return errorResponse("accessUnavailable", 503);
    if (account.data !== true) return errorResponse("staffAccessDenied", 403);
    const params = new URL(request.url).searchParams;
    if (params.get("view") === "events") {
      const result = await auth.client.rpc("validation_history_events");
      if (result.error || !Array.isArray(result.data)) return errorResponse("accessUnavailable", 503);
      return jsonResponse({ events: result.data });
    }
    const eventId = params.get("eventId"); const outcome = params.get("result");
    if ((eventId && !isUuid(eventId)) || (outcome && !["accepted", "rejected"].includes(outcome))) return errorResponse("invalidData", 400);
    let query = auth.client.from("ticket_validation_attempts")
      .select("id,event_reference,event_id,event_title,staff_name,ticket_reference,result,reason,created_at,source")
      .eq("organizer_id", auth.buyerId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51);
    if (eventId) query = query.eq("event_reference", eventId);
    if (outcome) query = query.eq("result", outcome);
    const cursor = params.get("cursor");
    if (cursor) {
      if (cursor.length > 256) return errorResponse("invalidData", 400);
      let parsed: { date: string; id: string };
      try { parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); }
      catch { return errorResponse("invalidData", 400); }
      if (!isUuid(parsed.id) || typeof parsed.date !== "string" || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|\+00:00)$/.test(parsed.date) || !Number.isFinite(Date.parse(parsed.date))) return errorResponse("invalidData", 400);
      query = query.or(`created_at.lt.${parsed.date},and(created_at.eq.${parsed.date},id.lt.${parsed.id})`);
    }
    const result = await query;
    if (result.error || !result.data) return errorResponse("accessUnavailable", 503);
    const rows = result.data.slice(0, 50);
    const entries: ValidationHistoryEntry[] = rows.map((row) => ({ id: row.id, eventId: row.event_reference,
      eventTitle: row.event_title, eventDeleted: row.event_id === null, staffName: row.staff_name,
      ticketReference: row.ticket_reference, result: row.result, reason: row.reason, createdAt: row.created_at, source: row.source }));
    const last = rows.at(-1);
    return jsonResponse({ entries, nextCursor: result.data.length > 50 && last ? Buffer.from(JSON.stringify({ date: last.created_at, id: last.id })).toString("base64url") : null });
  } catch { return errorResponse("accessUnavailable", 503); }
}
