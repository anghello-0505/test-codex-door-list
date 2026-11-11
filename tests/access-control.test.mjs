import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

const link = "a".repeat(64);
const member = "550e8400-e29b-41d4-a716-446655440001";
const owner = "550e8400-e29b-41d4-a716-446655440002";
const eventId = "550e8400-e29b-41d4-a716-446655440003";
const operationId = "550e8400-e29b-41d4-a716-446655440004";

function fixture(options = {}) {
  const calls = [];
  const client = {
    auth: {
      async getUser() { calls.push("getUser"); return { data: { user: options.unauthenticated ? null : { id: member } }, error: null }; },
      async signInWithPassword(values) { calls.push({ login: values }); return { data: { user: { id: member }, session: { access_token: "access-secret", refresh_token: "refresh-secret" } }, error: options.badPassword ? {} : null }; },
      async signOut() { calls.push("signOut"); },
    },
    async rpc(name, values) {
      calls.push({ name, values });
      return { data: options.rpcData ?? { result: "accepted", operationId }, error: options.databaseError ? { message: "private provider detail" } : null };
    },
  };
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test"; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
  const loaded = loadModule("src/lib/access-server.ts", {
    "server-only": {}, "@supabase/supabase-js": { createClient: () => client },
    "@/lib/supabase/server": { adminClient: () => ({ rpc: async () => { calls.push("resolveLogin"); return { data: options.lookup ?? { memberId: member, organizerId: owner }, error: null }; } }), authenticatedBuyerClient: async () => options.organizer === false ? null : { client, buyerId: owner } },
    "@/lib/staff-auth": { enableStaffIdentity: async (...values) => calls.push({ enable: values }), staffTechnicalEmail: (id) => `${id}@staff.invalid` },
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl ?? "https://example.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey ?? "publishable";
  return { ...loaded, calls, client };
}
function request(body, token = true, origin) {
  return new Request("https://doorlist.test/api/acceso/" + link, { method: body ? "POST" : "GET", headers: {
    ...(token ? { Authorization: "Bearer staff-token" } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...(origin ? { Origin: origin } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
test("operaciones exigen token validado y rechazan origen ajeno antes de invocar RPC", async () => {
  for (const [req, options, expected] of [[request(null, false), {}, 401], [request(null), { unauthenticated: true }, 401], [request(null, true, "https://foreign.test"), {}, 403]]) {
    const f = fixture(options); const response = await f.accessRoute(req, link, "events");
    assert.equal(response.status, expected); assert.ok(!f.calls.some((call) => call.name));
  }
});
test("QR y manual envían el mismo contrato, sin aceptar identidad del cliente", async () => {
  for (const source of ["camera", "manual"]) {
    const f = fixture(); const input = { eventId, operationId, code: "c".repeat(64), source };
    const response = await f.accessRoute(request(input), link, "validate");
    assert.equal(response.status, 200);
    assert.deepEqual(f.calls.find((call) => call.name).values, { p_link: link, p_action: "validate", p_event_id: eventId, p_code: input.code, p_operation_id: operationId, p_source: source });
    const denied = await f.accessRoute(request({ ...input, staffMemberId: owner }), link, "validate");
    assert.equal(denied.status, 400);
  }
});
test("rechazos conservan HTTP y errores técnicos no se convierten en boletos inválidos", async () => {
  const rejected = fixture({ rpcData: { error: "accessTicketUsed", status: 409 } });
  const response = await rejected.accessRoute(request(), link, "events");
  assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: "accessTicketUsed" });
  const failed = fixture({ databaseError: true });
  const failure = await failed.accessRoute(request(), link, "events");
  assert.equal(failure.status, 503); assert.deepEqual(await failure.json(), { error: "accessUnavailable" });
});
test("recuperación sin resultado es 202 y nunca envía una nueva validación", async () => {
  const f = fixture({ rpcData: { status: 202, result: "unconfirmed" } });
  const response = await f.accessRoute(new Request(`https://doorlist.test/api?eventId=${eventId}`, { headers: { Authorization: "Bearer token" } }), link, "recover", operationId);
  assert.equal(response.status, 202); assert.deepEqual(await response.json(), { result: "unconfirmed" });
  assert.equal(f.calls.find((call) => call.name).values.p_action, "recover");
});

test("un rechazo histórico confirmado conserva HTTP y se distingue de una sesión actual inválida", async () => {
  const f = fixture({ rpcData: { error: "accessSessionExpired", status: 401, operationConfirmed: true } });
  const response = await f.accessRoute(new Request(`https://doorlist.test/api?eventId=${eventId}`, { headers: { Authorization: "Bearer token" } }), link, "recover", operationId);
  assert.equal(response.status, 401); assert.equal(response.headers.get("X-Access-Operation-Confirmed"), "true");
  assert.deepEqual(await response.json(), { error: "accessSessionExpired" });
  const denied = fixture({ rpcData: { error: "accessSessionExpired", status: 401 } });
  const current = await denied.accessRoute(request(), link, "session");
  assert.equal(current.headers.get("X-Access-Operation-Confirmed"), null);
});
test("login resuelve organización y usuario antes de habilitar, verifica sesión operativa antes de devolver tokens", async () => {
  const f = fixture({ rpcData: { staffMemberId: member, name: "Personal" } });
  const response = await f.loginAccess(request({ username: " ALPHA ", password: "password123" }, false), link);
  assert.equal(response.status, 200);
  assert.equal(f.calls[0], "resolveLogin"); assert.deepEqual(f.calls[1], { enable: [member, owner] });
  assert.equal(f.calls[2].login.email, `${member}@staff.invalid`);
  assert.equal(f.calls[3].values.p_action, "start");
  const data = await response.json(); assert.equal(data.tokens.accessToken, "access-secret");
  const invalid = fixture({ lookup: { error: "accessCredentialsInvalid", status: 401 } });
  const denied = await invalid.loginAccess(request({ username: "alpha", password: "password123" }), link);
  assert.equal(denied.status, 401); assert.deepEqual(invalid.calls, ["resolveLogin"]);
});
test("un login con sesión operativa denegada no entrega tokens y cierra la sesión recién creada", async () => {
  const f = fixture({ rpcData: { error: "staffAccessDenied", status: 403 } });
  const response = await f.loginAccess(request({ username: "alpha", password: "password123" }), link);
  assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: "staffAccessDenied" });
  assert.equal(f.calls.at(-1), "signOut");
});
test("cuerpo JSON mal formado usa 400 y no llega al validador", async () => {
  const f = fixture();
  const response = await f.accessRoute(new Request("https://doorlist.test/api", { method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" }, body: "{" }), link, "validate");
  assert.equal(response.status, 400); assert.ok(!f.calls.some((call) => call.name));
});

test("búsqueda email normaliza el titular y conserva evento/link autenticados", async () => {
  const data = { tickets: [{ ticketId: operationId, holderName: "Titular", ticketTypeName: "General", status: "valid", code: "c".repeat(64) }], truncated: false };
  const f = fixture({ rpcData: data });
  const response = await f.accessRoute(request({ eventId, email: " TITULAR@Example.COM " }), link, "searchEmail");
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), data);
  assert.deepEqual(f.calls.find((call) => call.name), { name: "staff_search_email", values: { p_link: link, p_event_id: eventId, p_email: "titular@example.com" } });
});

test("búsqueda no permite enumeración parcial, eventos inválidos ni identidad del cliente", async () => {
  for (const body of [{ eventId, email: "titular" }, { eventId, email: "%@%" }, { eventId, email: "a".repeat(250) + "@example.com" }, { eventId: "otro", email: "a@example.com" }, { eventId, email: "a@example.com", organizerId: owner }]) {
    const f = fixture();
    assert.equal((await f.accessRoute(request(body), link, "searchEmail")).status, 400);
    assert.ok(!f.calls.some((call) => call.name));
  }
});

test("búsqueda requiere sesión y origen propios; no usa cliente administrador", async () => {
  for (const [req, options, expected] of [[request({ eventId, email: "a@example.com" }, false), {}, 401], [request({ eventId, email: "a@example.com" }), { unauthenticated: true }, 401], [request({ eventId, email: "a@example.com" }, true, "https://foreign.test"), {}, 403]]) {
    const f = fixture(options);
    assert.equal((await f.accessRoute(req, link, "searchEmail")).status, expected);
    assert.ok(!f.calls.some((call) => call.name || call === "resolveLogin"));
  }
});

test("búsqueda distingue vacío, permisos retirados, límite y fallo técnico sin filtrar proveedor", async () => {
  for (const [options, status, body] of [
    [{ rpcData: { tickets: [], truncated: false } }, 200, { tickets: [], truncated: false }],
    [{ rpcData: { error: "eventUnavailable", status: 404 } }, 404, { error: "eventUnavailable" }],
    [{ rpcData: { error: "accessSessionExpired", status: 401 } }, 401, { error: "accessSessionExpired" }],
    [{ rpcData: { error: "accessRateLimited", status: 429 } }, 429, { error: "accessRateLimited" }],
    [{ databaseError: true }, 503, { error: "accessUnavailable" }],
  ]) {
    const f = fixture(options); const response = await f.accessRoute(request({ eventId, email: "a@example.com" }), link, "searchEmail");
    assert.equal(response.status, status); assert.deepEqual(await response.json(), body);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});
test("rangos de configuración respetan 0–12 horas y pasos de media hora", () => {
  const { validAccessGrace, validAccessLink } = loadModule("src/lib/access-control.ts");
  for (const value of [0, 30, 120, 720]) assert.equal(validAccessGrace(value), true);
  for (const value of [-30, 15, 721, 750, NaN, 120.5]) assert.equal(validAccessGrace(value), false);
  assert.equal(validAccessLink(link), true); assert.equal(validAccessLink(owner), false);
});

test("una conexión colgada se aborta y sigue siendo un fallo operativo", async () => {
  const { fetchAccess } = loadModule("src/lib/access-control.ts");
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Unconfirmed", "AbortError")), { once: true });
  });
  try { await assert.rejects(fetchAccess("https://example.test", {}, 5), { name: "AbortError" }); }
  finally { globalThis.fetch = original; }
});
