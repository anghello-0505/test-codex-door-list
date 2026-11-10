// Explicit opt-in integration test. NEVER invoked by npm test.
// Uses only newly created fixtures and cleans them up, including Auth identities.
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const expectedRef = process.argv.find((arg) => arg.startsWith("--project-ref="))?.split("=")[1];
const baseArg = process.argv.find((arg) => arg.startsWith("--base-url="))?.slice(11);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!expectedRef || !baseArg || !process.argv.includes("--allow-test-fixtures") || !url || !key || !secret || new URL(url).hostname !== `${expectedRef}.supabase.co`) {
  throw new Error("Require explicit project-ref, base-url, --allow-test-fixtures and configured environment. Approval required.");
}
const base = new URL(baseArg);
if (!["localhost", "127.0.0.1"].includes(base.hostname) || base.protocol !== "http:") throw new Error("Use a local app server connected to the explicitly approved test project.");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, secret, options);
const accounts = []; const owners = []; const members = []; const events = [];
const password = `Test-${randomUUID()}-Aa1`;
function checked(result, message) { if (result.error) throw new Error(message); return result.data; }
async function http(path, method = "GET", body, token) {
  const response = await fetch(new URL(path, base), { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), confirmed: response.headers.get("X-Access-Operation-Confirmed") === "true" };
}
async function fixture() {
  const account = checked(await admin.auth.admin.createUser({ email: `${randomUUID()}@example.invalid`, password, email_confirm: true }), "Create synthetic owner");
  accounts.push(account.user.id); owners.push(account.user.id);
  const client = createClient(url, key, options);
  const auth = checked(await client.auth.signInWithPassword({ email: account.user.email, password }), "Sign in synthetic owner");
  const memberId = checked(await client.rpc("reserve_staff_member", { p_name: "Personal sintético", p_username: "integration", p_event_ids: [], p_creation_key: randomUUID() }), "Reserve synthetic staff");
  members.push(memberId);
  checked(await admin.auth.admin.createUser({ id: memberId, email: `${memberId}@staff.invalid`, password, email_confirm: true, ban_duration: "876000h", app_metadata: { account_type: "access_staff", staff_member_id: memberId, organizer_id: account.user.id } }), "Create blocked synthetic staff");
  accounts.push(memberId);
  checked(await client.rpc("manage_staff_member", { p_staff_id: memberId, p_action: "complete" }), "Complete synthetic staff");
  const link = checked(await client.rpc("ensure_access_link"), "Create synthetic link");
  return { ownerId: account.user.id, client, memberId, link, ownerToken: auth.session.access_token };
}
let cleanupFailed = false;
try {
  const first = await fixture(); const second = await fixture();
  const blocked = createClient(url, key, options);
  assert.ok((await blocked.auth.signInWithPassword({ email: `${first.memberId}@staff.invalid`, password })).error, "Synthetic identity must start blocked");
  const one = await http(`/api/acceso/${first.link}/sesion`, "POST", { username: "integration", password });
  const two = await http(`/api/acceso/${first.link}/sesion`, "POST", { username: "integration", password });
  const other = await http(`/api/acceso/${second.link}/sesion`, "POST", { username: "integration", password });
  assert.equal(one.status, 200); assert.equal(two.status, 200); assert.equal(other.status, 200);
  assert.equal(one.body.session.staffMemberId, first.memberId); assert.equal(other.body.session.staffMemberId, second.memberId);
  const tokenA = one.body.tokens.accessToken; const tokenB = two.body.tokens.accessToken;
  const sessionId = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).session_id;
  assert.notEqual(sessionId(tokenA), sessionId(tokenB), "Concurrency requires two independent Auth sessions");
  assert.equal((await http(`/api/acceso/${second.link}/eventos`, "GET", null, tokenA)).status, 403);
  const event = checked(await first.client.from("events").insert({ propietario_id: first.ownerId, titulo: "Integración sintética de acceso", descripcion: "", fecha: new Date(Date.now() + 86400000).toISOString(), lugar: "Prueba", aforo_maximo: 10 }).select("id").single(), "Create synthetic event");
  events.push(event.id);
  const type = checked(await first.client.from("ticket_types").insert({ evento_id: event.id, nombre: "General", aforo_maximo: 10 }).select("id").single(), "Create synthetic ticket type");
  checked(await first.client.from("events").update({ estado: "publicado" }).eq("id", event.id), "Publish synthetic event");
  const issued = checked(await first.client.rpc("confirmar_registro", { p_evento_id: event.id, p_tipo_entrada_id: type.id, p_nombre: "Titular sintético", p_correo: "fixture@example.test", p_clave: randomUUID() }), "Issue synthetic ticket");
  assert.equal(issued.estado, "confirmado");
  checked(await first.client.from("events").update({ fecha: new Date().toISOString() }).eq("id", event.id), "Set synthetic access day");
  checked(await first.client.rpc("manage_staff_member", { p_staff_id: first.memberId, p_action: "events", p_values: { eventIds: [event.id] } }), "Assign synthetic event");
  const keyA = randomUUID(); const keyB = randomUUID();
  const payload = { eventId: event.id, code: issued.ticket.codigo };
  // Two different Auth sessions, requests and idempotency keys share one ticket.
  const responses = await Promise.all([
    http(`/api/acceso/${first.link}/validaciones`, "POST", { ...payload, source: "camera", operationId: keyA }, tokenA),
    http(`/api/acceso/${first.link}/validaciones`, "POST", { ...payload, source: "manual", operationId: keyB }, tokenB),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const winningKey = responses[0].status === 200 ? keyA : keyB;
  const replay = await http(`/api/acceso/${first.link}/validaciones`, "POST", { ...payload, source: "manual", operationId: winningKey }, tokenA);
  assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true);
  const recovered = await http(`/api/acceso/${first.link}/validaciones/${winningKey}?eventId=${event.id}`, "GET", null, tokenB);
  assert.equal(recovered.status, 200); assert.equal(recovered.body.replayed, true);
  const audits = checked(await admin.from("ticket_validation_attempts").select("result").eq("organizer_id", first.ownerId), "Read synthetic audit");
  assert.equal(audits.filter((row) => row.result === "accepted").length, 1);
  const staffClient = createClient(url, key, { ...options, global: { headers: { Authorization: `Bearer ${tokenA}` } } });
  assert.deepEqual(checked(await staffClient.from("events").select("id"), "Staff RLS read"), []);
  assert.equal((await staffClient.rpc("is_organizer_account")).data, false);
  checked(await first.client.rpc("manage_staff_member", { p_staff_id: first.memberId, p_action: "update", p_values: { isActive: false } }), "Deactivate synthetic staff");
  assert.equal((await http(`/api/acceso/${first.link}/validaciones`, "POST", { ...payload, source: "manual", operationId: randomUUID() }, tokenA)).status, 403);
  checked(await first.client.rpc("manage_staff_member", { p_staff_id: first.memberId, p_action: "update", p_values: { isActive: true } }), "Reactivate synthetic staff");
  assert.equal((await http(`/api/acceso/${first.link}/sesion`, "GET", null, tokenA)).status, 401);
  const fresh = await http(`/api/acceso/${first.link}/sesion`, "POST", { username: "integration", password });
  assert.equal(fresh.status, 200, "Reactivated staff needs a new Auth session");
  const replacementPassword = `Reset-${randomUUID()}-Bb2`;
  assert.equal((await http(`/api/organizador/asistentes/${first.memberId}/contrasena`, "POST", { password: replacementPassword }, first.ownerToken)).status, 200);
  assert.notEqual((await http(`/api/acceso/${first.link}/sesion`, "GET", null, fresh.body.tokens.accessToken)).status, 200);
  assert.equal((await http(`/api/acceso/${first.link}/sesion`, "POST", { username: "integration", password })).status, 401);
  const afterReset = await http(`/api/acceso/${first.link}/sesion`, "POST", { username: "integration", password: replacementPassword });
  assert.equal(afterReset.status, 200, "Password reset must support previously enabled identities");
  let currentToken = afterReset.body.tokens.accessToken;
  checked(await first.client.rpc("cambiar_estado_ticket", { p_codigo: issued.ticket.codigo, p_estado: "revoked" }), "Revoke synthetic used ticket");
  const revoked = await http(`/api/acceso/${first.link}/validaciones`, "POST", { ...payload, source: "manual", operationId: randomUUID() }, currentToken);
  assert.equal(revoked.status, 409); assert.equal(revoked.body.error, "accessTicketRevoked");
  checked(await first.client.from("events").update({ fecha: new Date(Date.now() - 172800000).toISOString() }).eq("id", event.id), "Close synthetic access window");
  const closed = await http(`/api/acceso/${first.link}/validaciones`, "POST", { ...payload, source: "manual", operationId: randomUUID() }, currentToken);
  assert.equal(closed.status, 409); assert.equal(closed.body.error, "accessOutsideWindow");
  const history = await http(`/api/organizador/validaciones?eventId=${event.id}`, "GET", null, first.ownerToken);
  assert.equal(history.status, 200); assert.equal(history.body.entries.filter((row) => row.result === "accepted").length, 1);
  const foreignHistory = await http(`/api/organizador/validaciones?eventId=${event.id}`, "GET", null, second.ownerToken);
  assert.equal(foreignHistory.status, 200); assert.deepEqual(foreignHistory.body.entries, []);
  const choices = await http("/api/organizador/validaciones?view=events", "GET", null, first.ownerToken);
  assert.equal(choices.status, 200); assert.ok(choices.body.events.some((row) => row.id === event.id && !row.deleted));
  checked(await admin.from("staff_access_sessions").update({ last_activity_at: new Date(Date.now() - 1860000).toISOString() }).eq("staff_member_id", first.memberId), "Expire synthetic operational sessions");
  const expiredOperation = randomUUID();
  const expired = await http(`/api/acceso/${first.link}/validaciones`, "POST", { ...payload, source: "manual", operationId: expiredOperation }, currentToken);
  assert.equal(expired.status, 401); assert.equal(expired.confirmed, false);
  const renewed = await http(`/api/acceso/${first.link}/sesion`, "POST", { username: "integration", password: replacementPassword });
  assert.equal(renewed.status, 200); currentToken = renewed.body.tokens.accessToken;
  const historical = await http(`/api/acceso/${first.link}/validaciones/${expiredOperation}?eventId=${event.id}`, "GET", null, currentToken);
  assert.equal(historical.status, 401); assert.equal(historical.confirmed, true); assert.equal(historical.body.error, "accessSessionExpired");
  assert.equal((await http(`/api/acceso/${first.link}/sesion`, "DELETE", null, currentToken)).status, 200);
  assert.equal((await http(`/api/acceso/${first.link}/sesion`, "GET", null, currentToken)).status, 401);
  checked(await first.client.rpc("manage_staff_member", { p_staff_id: first.memberId, p_action: "delete" }), "Logically delete synthetic staff");
  assert.equal((await http(`/api/acceso/${first.link}/sesion`, "POST", { username: "integration", password: replacementPassword })).status, 401);
  checked(await first.client.from("events").delete().eq("id", event.id), "Delete synthetic event");
  const archived = checked(await admin.from("ticket_validation_attempts").select("event_id,event_title,result").eq("organizer_id", first.ownerId), "Read archived synthetic audit");
  assert.ok(archived.some((row) => row.event_id === null && row.result === "accepted"));
  const archivedChoices = await http("/api/organizador/validaciones?view=events", "GET", null, first.ownerToken);
  assert.equal(archivedChoices.status, 200); assert.ok(archivedChoices.body.events.some((row) => row.id === event.id && row.deleted));
  console.log("PASS: login, independent-session concurrency, idempotency, recovery including historical denials, RLS, isolation, password reset, revocation/reactivation/deletion, inactivity, window, revoked ticket, logout, organizer history and archive retention.");
} finally {
  // Restrict every cleanup operation to IDs created by this invocation.
  for (const ownerId of owners) {
    for (const table of ["ticket_validation_attempts", "staff_event_assignments"]) {
      const result = await admin.from(table).delete().eq("organizer_id", ownerId); if (result.error) cleanupFailed = true;
    }
  }
  for (const eventId of events) if ((await admin.from("events").delete().eq("id", eventId)).error) cleanupFailed = true;
  for (const memberId of members) {
    if ((await admin.from("staff_access_sessions").delete().eq("staff_member_id", memberId)).error) cleanupFailed = true;
    if ((await admin.from("staff_members").delete().eq("id", memberId)).error) cleanupFailed = true;
  }
  for (const ownerId of owners) if ((await admin.from("organization_access_links").delete().eq("organizer_id", ownerId)).error) cleanupFailed = true;
  for (const id of accounts.reverse()) if ((await admin.auth.admin.deleteUser(id)).error) cleanupFailed = true;
  if (cleanupFailed) throw new Error("Synthetic fixture cleanup incomplete; review the approved test environment. No secrets are printed.");
  console.log("Synthetic fixture cleanup completed.");
}
