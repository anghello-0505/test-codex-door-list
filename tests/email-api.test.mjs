import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

// Exercise the actual route code with isolated transports; never touch Supabase.
const require = createRequire(import.meta.url);
function loadRoute(filename, dependencies) {
  const source = readFileSync(new URL(`../${filename}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), result, result.exports);
  return result.exports;
}
const registration = "550e8400-e29b-41d4-a716-446655440000";
const payload = { eventId: registration, ticketTypeId: registration, idempotencyKey: registration, name: "Titular", email: "titular@example.test" };
const persistencePayload = { p_evento_id: registration, p_tipo_entrada_id: registration, p_clave: registration, p_nombre: "Titular", p_correo: "titular@example.test" };
const jsonRequest = (path, body) => new Request(`https://doorlist.test${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const response = (body, status = 200) => Response.json(body, { status });
const apiResponses = { jsonResponse: response, errorResponse: (error, status) => response({ error }, status) };
const validation = { isUuid: (value) => typeof value === "string" && /^[0-9a-f-]{36}$/.test(value) };
const mapRegistrationResult = (data) => ({
  status: { confirmado: "confirmed", entrada_agotada: "ticketTypeSoldOut" }[data.estado] ?? "unknownResult",
  registrationId: data.folio ?? "",
  ticket: data.ticket,
});

test("confirmación responde antes del envío y conserva folio e idempotencia", async () => {
  const scheduled = []; const delivered = []; const received = [];
  const route = loadRoute("src/app/api/registros/confirmar/route.ts", {
    "next/server": { after: (fn) => scheduled.push(fn) },
    "@/lib/api-response": apiResponses,
    "@/lib/domain": {},
    "@/lib/email-server": {
      deliverTicket: async (...args) => delivered.push(args), deliveryConfigured: () => true,
    },
    "@/lib/persistence-mappers": { mapRegistrationResult },
    "@/lib/supabase/server": { authenticatedBuyerClient: async () => ({ buyerId: "buyer", client: { rpc: async (name, params) => { received.push({ name, params }); return { data: { estado: "confirmado", folio: registration } }; } } }) },
    "@/lib/validation": validation,
  });
  const result = await route.POST(jsonRequest("/api/registros/confirmar", { ...payload, destinatario: "attacker@example.test" }));
  assert.equal((await result.json()).registrationId, registration);
  assert.deepEqual(received[0], { name: "confirmar_registro", params: persistencePayload });
  assert.equal(delivered.length, 0);
  assert.equal(scheduled.length, 1);
  await scheduled[0]();
  assert.deepEqual(delivered[0], [registration, "buyer"]);
});

test("registro agotado no agenda correo y usuario sin sesión no confirma", async () => {
  for (const authorized of [true, false]) {
    const scheduled = [];
    const route = loadRoute("src/app/api/registros/confirmar/route.ts", {
      "next/server": { after: (fn) => scheduled.push(fn) },
      "@/lib/api-response": apiResponses,
      "@/lib/domain": {},
      "@/lib/email-server": { deliveryConfigured: () => false },
      "@/lib/persistence-mappers": { mapRegistrationResult },
      "@/lib/supabase/server": { authenticatedBuyerClient: async () => authorized ? { client: { rpc: async () => ({ data: { estado: "entrada_agotada" } }) } } : null },
      "@/lib/validation": validation,
    });
    const result = await route.POST(jsonRequest("/api/registros/confirmar", payload));
    assert.equal((await result.json()).error, authorized ? "ticketTypeSoldOut" : "sessionRequired");
    assert.equal(result.status, authorized ? 409 : 401);
    assert.equal(scheduled.length, 0);
  }
});

test("un organizador que no compró la entrada no puede solicitar su envío", async () => {
  const filters = []; let delivered = false;
  const query = { select: () => query, eq: (...args) => { filters.push(args); return query; }, maybeSingle: async () => ({ data: null }) };
  const route = loadRoute("src/app/api/entradas/correo/route.ts", {
    "@/lib/api-response": apiResponses, "@/lib/domain": {},
    "@/lib/email-server": { deliverTicket: async () => { delivered = true; }, deliveryConfigured: () => true },
    "@/lib/persistence-mappers": { mapTicketDeliveries: () => [] },
    "@/lib/supabase/server": { authenticatedBuyerClient: async () => ({ buyerId: "organizer", client: { from: () => query } }) },
    "@/lib/validation": validation,
  });
  assert.equal((await route.POST(jsonRequest("/api/entradas/correo", { registrationId: registration }))).status, 404);
  assert.ok(filters.some(([key, value]) => key === "comprador_id" && value === "organizer"));
  assert.equal(delivered, false);
});

test("la falta de configuración no dispara Resend ni invalida la entrada", async () => {
  let delivered = false;
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: registration } }) };
  const route = loadRoute("src/app/api/entradas/correo/route.ts", {
    "@/lib/api-response": apiResponses, "@/lib/domain": {},
    "@/lib/email-server": { deliverTicket: async () => { delivered = true; }, deliveryConfigured: () => false },
    "@/lib/persistence-mappers": { mapTicketDeliveries: () => [] },
    "@/lib/supabase/server": { authenticatedBuyerClient: async () => ({ buyerId: "buyer", client: { from: () => query } }) },
    "@/lib/validation": validation,
  });
  const result = await route.POST(jsonRequest("/api/entradas/correo", { registrationId: registration }));
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error, "deliveryNotConfigured");
  assert.equal(delivered, false);
});

test("el servidor reutiliza adjuntos persistidos y no envía si pierde el bloqueo", async () => {
  const names = ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "NEXT_PUBLIC_SUPABASE_URL"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) process.env[name] = name === "NEXT_PUBLIC_SUPABASE_URL" ? "https://example.test" : "fake-test-value";
  try {
    for (const canStart of [true, false]) {
      const frozen = { html: "frozen message", attachments: [{ content: "frozen PDF" }] };
      const sent = []; const updates = [];
      const admin = {
        from: (name) => {
          const query = { select: () => query, eq: () => query,
            maybeSingle: async () => ({ data: { id: "ticket-id" } }),
            neq: async () => ({ data: [{ id: "pending" }, { id: "accepted" }] }),
          };
          assert.ok(["tickets", "ticket_deliveries"].includes(name)); return query;
        },
        rpc: async (name, params) => {
          if (name === "preparar_envios_entrada") return {};
          if (name === "reclamar_envio_entrada") return { data: params.p_id === "accepted" ? null : { id: "pending", bloqueo: "lease", mensaje: frozen, incierto: true } };
          if (name === "iniciar_envio_entrada") { assert.deepEqual(params.p_mensaje, frozen); return { data: canStart }; }
          if (name === "finalizar_envio_entrada") { updates.push(params); return {}; }
          throw new Error(`Unexpected RPC: ${name}`);
        },
      };
      const server = loadRoute("src/lib/email-server.ts", {
        "server-only": {},
        "@/lib/ticket-email": { buildTicketMessage: () => { throw new Error("Frozen message rebuilt"); } },
        "@/lib/persistence-mappers": {
          mapTicketDeliveryTask: (task) => ({ id: task.id, lockId: task.bloqueo, message: task.mensaje, uncertain: task.incierto, emailData: task.datos, recipient: task.destinatario }),
          deliveryResultToPersistence: (status, uncertain, resendId) => ({ p_estado: status === "accepted" ? "aceptado" : status === "review" ? "revision" : "fallido", p_incierto: uncertain, p_resend_id: resendId ?? null }),
        },
        "@/lib/resend-delivery": { sendWithResend: async (message, id) => { sent.push({ message, id }); return { status: "failed", uncertain: false }; } },
        "@/lib/supabase/server": { adminClient: () => admin, authenticatedBuyerClient: async () => null },
        "@/lib/validation": { uuidPattern: /^[0-9a-f-]{36}$/ },
      });
      await server.deliverTicket(registration, "buyer");
      assert.equal(sent.length, canStart ? 1 : 0);
      if (canStart) {
        assert.deepEqual(sent[0], { message: frozen, id: "pending" });
        assert.equal(updates[0].p_incierto, true, "A later rejection must not erase an earlier unknown outcome");
      }
    }
  } finally {
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});
