import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiErrorCode, StaffMember } from "@/lib/domain";
import { errorResponse, jsonResponse } from "@/lib/api-response";
import { authenticatedBuyerClient } from "@/lib/supabase/server";
import { findStaffMember, mapStaffMember, staffMemberColumns } from "@/lib/staff-members";
import { hasOnlyKeys, normalizeStaffUsername, staffBodyLimit, staffPageSize, validStaffEventIds, validStaffName, validStaffPassword, validStaffUsername } from "@/lib/staff-member-validation";
import { provisionStaffIdentity, resetStaffIdentityPassword, staffAuthConfigured } from "@/lib/staff-auth";
import { isUuid } from "@/lib/validation";

type StaffAuth = { client: SupabaseClient; buyerId: string };
export class StaffError extends Error {
  constructor(public errorCode: ApiErrorCode, public status: number) { super(errorCode); }
}

function databaseError(error: { code?: string; message?: string }): never {
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? "")) throw new StaffError("staffNotConfigured", 503);
  if (error.code === "23505") throw new StaffError("staffUsernameTaken", 409);
  if (error.message === "staff_unavailable") throw new StaffError("staffUnavailable", 404);
  if (error.message === "staff_conflict") throw new StaffError("staffConflict", 409);
  if (error.message === "staff_invalid_events" || error.code === "23503") throw new StaffError("staffInvalidEvents", 400);
  if (error.message === "staff_access_denied" || error.code === "42501") throw new StaffError("staffAccessDenied", 403);
  if (["23514", "22023", "22P02"].includes(error.code ?? "")) throw new StaffError("invalidData", 400);
  throw new StaffError("staffUnavailable", 503);
}

export async function staffRoute(request: Request, action: (auth: StaffAuth) => Promise<Response>) {
  try {
    const auth = await authenticatedBuyerClient(request);
    if (!auth) return errorResponse("sessionRequired", 401);
    const access = await auth.client.rpc("is_organizer_account");
    if (access.error) databaseError(access.error);
    if (access.data !== true) return errorResponse("staffAccessDenied", 403);
    return await action(auth);
  } catch (error) {
    if (error instanceof StaffError) return errorResponse(error.errorCode, error.status);
    // Do not log bodies, passwords, tokens, provider errors or user objects.
    return errorResponse("staffUnavailable", 503);
  }
}

export async function readStaffBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > staffBodyLimit) throw new StaffError("payloadTooLarge", 413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new StaffError("invalidData", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new StaffError("invalidData", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > staffBodyLimit) { await reader.cancel(); throw new StaffError("payloadTooLarge", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const input: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid input");
    return input as Record<string, unknown>;
  } catch (error) {
    if (error instanceof StaffError) throw error;
    throw new StaffError("invalidData", 400);
  } finally { reader.releaseLock(); }
}

async function memberOrFail(auth: StaffAuth, id: string) {
  if (!isUuid(id)) throw new StaffError("invalidData", 400);
  let member: StaffMember | null;
  try { member = await findStaffMember(auth.client, id, auth.buyerId); }
  catch (error) { databaseError(error as { code?: string; message?: string }); }
  if (!member) throw new StaffError("staffUnavailable", 404);
  return member;
}

async function manage(auth: StaffAuth, id: string, action: string, values: Record<string, unknown> = {}) {
  const result = await auth.client.rpc("manage_staff_member", { p_staff_id: id, p_action: action, p_values: values });
  if (result.error) databaseError(result.error);
}

export async function listStaff(request: Request, auth: StaffAuth) {
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new StaffError("invalidData", 400);
  const start = (page - 1) * staffPageSize;
  const result = await auth.client.from("staff_members").select(staffMemberColumns, { count: "exact" })
    .eq("organizer_id", auth.buyerId).is("deleted_at", null).order("created_at", { ascending: false }).order("id")
    .range(start, start + staffPageSize - 1);
  if (result.error) databaseError(result.error);
  if (result.data === null || result.count === null) throw new StaffError("staffUnavailable", 503);
  const ids = result.data.map((member) => member.id);
  const assignments = new Map<string, string[]>();
  let offset = 0;
  while (ids.length) {
    const batch = await auth.client.from("staff_event_assignments").select("staff_member_id,event_id")
      .eq("organizer_id", auth.buyerId).in("staff_member_id", ids)
      .order("staff_member_id").order("event_id").range(offset, offset + 499);
    if (batch.error) databaseError(batch.error);
    if (batch.data === null) throw new StaffError("staffUnavailable", 503);
    if (!batch.data.length) break;
    for (const row of batch.data) assignments.set(row.staff_member_id, [...(assignments.get(row.staff_member_id) ?? []), row.event_id]);
    offset += batch.data.length;
  }
  return jsonResponse({ staffMembers: result.data.map((row) => mapStaffMember(row, assignments.get(row.id) ?? [])), page, pageSize: staffPageSize, total: result.count });
}

async function finishCreation(auth: StaffAuth, member: StaffMember, password: string) {
  if (member.provisioningStatus === "ready") return jsonResponse({ staffMember: member });
  try {
    const result = await provisionStaffIdentity(member, auth.buyerId, password);
    if (result === "passwordRejected") return errorResponse("staffPasswordRejected", 400);
  } catch { return errorResponse("staffCreationPending", 503); }
  try {
    await manage(auth, member.id, "complete");
    return jsonResponse({ staffMember: await memberOrFail(auth, member.id) }, 201);
  } catch (error) {
    if (error instanceof StaffError && error.status === 404) throw error;
    return errorResponse("staffCreationPending", 503);
  }
}

export async function createStaff(request: Request, auth: StaffAuth) {
  if (!staffAuthConfigured()) throw new StaffError("staffNotConfigured", 503);
  const input = await readStaffBody(request);
  if (!hasOnlyKeys(input, ["name", "username", "password", "eventIds", "idempotencyKey"]) ||
      !validStaffName(input.name) || !validStaffUsername(input.username) || !validStaffEventIds(input.eventIds) || !isUuid(input.idempotencyKey)) throw new StaffError("invalidData", 400);
  if (!validStaffPassword(input.password)) throw new StaffError("staffPasswordRejected", 400);
  const result = await auth.client.rpc("reserve_staff_member", {
    p_name: input.name.trim(), p_username: normalizeStaffUsername(input.username),
    p_event_ids: input.eventIds.map((id) => id.toLowerCase()), p_creation_key: input.idempotencyKey,
  });
  if (result.error) databaseError(result.error);
  if (!isUuid(result.data)) throw new StaffError("staffCreationPending", 503);
  return finishCreation(auth, await memberOrFail(auth, result.data), input.password);
}

export async function updateStaff(request: Request, auth: StaffAuth, id: string) {
  await memberOrFail(auth, id);
  const input = await readStaffBody(request);
  const details = hasOnlyKeys(input, ["name", "username"]) && validStaffName(input.name) && validStaffUsername(input.username);
  const state = hasOnlyKeys(input, ["isActive"]) && typeof input.isActive === "boolean";
  if (!details && !state) throw new StaffError("invalidData", 400);
  const values = details ? { name: (input.name as string).trim(), username: normalizeStaffUsername(input.username as string) } : { isActive: input.isActive };
  await manage(auth, id, "update", values);
  return jsonResponse({ staffMember: await memberOrFail(auth, id) });
}

export async function deleteStaff(auth: StaffAuth, id: string) {
  await memberOrFail(auth, id);
  await manage(auth, id, "delete");
  return jsonResponse({ deleted: true });
}

export async function assignStaffEvents(request: Request, auth: StaffAuth, id: string) {
  await memberOrFail(auth, id);
  const input = await readStaffBody(request);
  if (!hasOnlyKeys(input, ["eventIds"]) || !validStaffEventIds(input.eventIds)) throw new StaffError("invalidData", 400);
  await manage(auth, id, "events", { eventIds: input.eventIds.map((eventId) => eventId.toLowerCase()) });
  return jsonResponse({ staffMember: await memberOrFail(auth, id) });
}

export async function setStaffPassword(request: Request, auth: StaffAuth, id: string, complete = false) {
  const member = await memberOrFail(auth, id); // Ownership before any privileged Auth access.
  if (!staffAuthConfigured()) throw new StaffError("staffNotConfigured", 503);
  const input = await readStaffBody(request);
  if (!hasOnlyKeys(input, ["password"])) throw new StaffError("invalidData", 400);
  if (!validStaffPassword(input.password)) throw new StaffError("staffPasswordRejected", 400);
  if (complete) return finishCreation(auth, member, input.password);
  if (member.provisioningStatus !== "ready") throw new StaffError("staffConflict", 409);
  // Invalidate earlier access first. A provider failure must fail closed.
  await manage(auth, id, "invalidate");
  try {
    const result = await resetStaffIdentityPassword(member.id, auth.buyerId, input.password);
    if (result === "passwordRejected") return errorResponse("staffPasswordRejected", 400);
  } catch { return errorResponse("staffPasswordUnconfirmed", 503); }
  return jsonResponse({ updated: true });
}

export async function listStaffEvents(auth: StaffAuth) {
  const events: { id: string; title: string; date: string; status: "draft" | "published" }[] = [];
  let after: string | null = null;
  while (true) {
    let query = auth.client.from("events").select("id,titulo,fecha,estado").eq("propietario_id", auth.buyerId).order("id").limit(500);
    if (after) query = query.gt("id", after);
    const batch = await query;
    if (batch.error) databaseError(batch.error);
    if (batch.data === null) throw new StaffError("staffUnavailable", 503);
    if (!batch.data.length) break;
    for (const row of batch.data) events.push({ id: row.id, title: row.titulo, date: row.fecha, status: row.estado === "publicado" ? "published" : "draft" });
    after = batch.data[batch.data.length - 1].id;
  }
  return jsonResponse({ events });
}
