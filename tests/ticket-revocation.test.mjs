import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

const eventId = "550e8400-e29b-41d4-a716-446655440000";
const registrationId = "550e8400-e29b-41d4-a716-446655440001";
const jobId = "550e8400-e29b-41d4-a716-446655440002";
const lockId = "550e8400-e29b-41d4-a716-446655440003";
const reason = "Registro duplicado";

function fixture(options = {}) {
  const calls = [];
  const job = { id: jobId, reason, delivery_status: "pending", holder_name: "María", holder_email: "holder@example.test", event_title: "Evento", lock_id: lockId, uncertain: false, ...options.job };
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "revoke_ticket_with_reason") return { data: options.result ?? { id: jobId }, error: options.rpcError ?? null };
      if (name === "claim_ticket_revocation_email") return { data: options.claim === false ? null : job, error: null };
      if (name === "start_ticket_revocation_email") return { data: options.start !== false, error: null };
      if (name === "finish_ticket_revocation_email") job.delivery_status = args.p_status;
      return { data: null, error: null };
    },
    from(table) {
      const query = {
        select() { return query; }, eq(key, value) { calls.push({ table, key, value }); return query; },
        async maybeSingle() { return { data: options.statusMissing ? null : job, error: null }; },
      };
      return query;
    },
  };
  const overrides = {
    "server-only": {},
    "@/lib/supabase/server": { authenticatedBuyerClient: async () => options.signedIn === false ? null : { client, buyerId: "owner" }, adminClient: () => client },
    "@/lib/email-server": { deliveryConfigured: () => options.configured !== false },
    "@/lib/ticket-revocation-email": { buildRevocationMessage(data) { calls.push({ build: data }); return { to: [data.holderEmail], text: data.reason }; } },
    "@/lib/resend-delivery": { async sendWithResend(message, key) { calls.push({ send: message, key }); if (options.throwSend) throw new Error("provider secret"); return options.delivery ?? { status: "accepted", uncertain: false, resendId: "provider" }; } },
  };
  const server = loadModule("src/lib/ticket-revocation-server.ts", overrides);
  return { calls, job, deliver: () => server.deliverRevocation(jobId, "owner"),
    revoke: (body = { reason }, headers = {}, id = eventId) => server.revokeTicket(new Request("https://doorlist.test/api/revocar", {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
    }), id, registrationId) };
}

test("revocación exige sesión, configuración y datos acotados antes de mutar", async () => {
  for (const [options, expected] of [[{ signedIn: false }, 401], [{ configured: false }, 503]]) {
    const instance = fixture(options);
    const response = await instance.revoke();
    assert.equal(response.status, expected);
    assert.equal(instance.calls.length, 0);
  }
  for (const body of [{ reason: " " }, { reason: "x".repeat(1001) }, { reason, email: "attacker@example.test" }, [], "invalid JSON", { reason: "a\u0000b" }]) {
    const instance = fixture();
    assert.equal((await instance.revoke(body)).status, 400);
    assert.equal(instance.calls.length, 0);
  }
  assert.equal((await fixture().revoke({ reason }, {}, "invalid")).status, 400);
  assert.equal((await fixture().revoke({ reason }, { "content-length": "9000" })).status, 413);
  assert.equal((await fixture().revoke("x".repeat(9000))).status, 400);
});

test("rechazos de autorización, estado y proveedor usan HTTP y errores seguros", async () => {
  for (const [error, expected] of [["session_required", 401], ["denied", 404], ["conflict", 409], ["invalid_data", 400]]) {
    const instance = fixture({ result: { error } });
    const response = await instance.revoke();
    assert.equal(response.status, expected);
    assert.equal(instance.calls.length, 1);
    assert.equal(typeof (await response.json()).error, "string");
  }
  const response = await fixture({ rpcError: { message: "private SQL data" } }).revoke();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private SQL/);
});

test("revoca por registro y evento; envía únicamente al titular con clave estable", async () => {
  const instance = fixture();
  const response = await instance.revoke({ reason: `  ${reason}  ` });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ticketStatus: "revoked", reason, emailStatus: "accepted" });
  assert.deepEqual(instance.calls[0], { name: "revoke_ticket_with_reason", args: { p_event_id: eventId, p_registration_id: registrationId, p_reason: reason } });
  assert.deepEqual(instance.calls.find((call) => call.send).send.to, ["holder@example.test"]);
  assert.equal(instance.calls.find((call) => call.send).key, `revocation/${jobId}`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.ok(instance.calls.some((call) => call.key === "organizer_id" && call.value === "owner"));
});

test("fallo o incertidumbre de email conserva revocación y comunica estado durable", async () => {
  for (const options of [{ delivery: { status: "failed", uncertain: true } }, { throwSend: true }]) {
    const instance = fixture(options);
    const response = await instance.revoke();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).emailStatus, "failed");
    assert.equal(instance.calls.findLast((call) => call.name === "finish_ticket_revocation_email").args.p_uncertain, true);
  }
  assert.equal((await fixture({ statusMissing: true }).revoke()).status, 503);
});

test("reintento conserva payload almacenado y no envía jobs sin bloqueo", async () => {
  const message = { to: ["original@example.test"], text: reason };
  const instance = fixture({ job: { message, uncertain: true } });
  await instance.deliver();
  assert.equal(instance.calls.find((call) => call.send).send, message);
  assert.equal(instance.calls.filter((call) => call.build).length, 0);
  for (const options of [{ claim: false }, { start: false }]) {
    const noSend = fixture(options);
    await noSend.deliver();
    assert.ok(!noSend.calls.some((call) => call.send));
  }
});

test("mensaje de revocación escapa motivo, identifica evento y excluye QR", () => {
  const { buildRevocationMessage } = loadModule("src/lib/ticket-revocation-email.ts", {
    "./ticket-email": loadModule("src/lib/ticket-email.ts", { "./ticket-code.ts": loadModule("src/lib/ticket-code.ts"), "./date.ts": loadModule("src/lib/date.ts") }),
  });
  const message = buildRevocationMessage({ holderName: "María <script>", holderEmail: "holder@example.test", eventTitle: "Evento\r\nX", reason: "Duplicado <img src=x>\nRevisión & confirmación" }, "Doorlist <test@example.test>");
  assert.deepEqual(message.to, ["holder@example.test"]);
  assert.match(message.html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(message.html, /<script>|<img/);
  assert.match(message.text, /Duplicado <img src=x>/);
  assert.doesNotMatch(message.subject, /[\r\n]/);
  assert.deepEqual(message.attachments, []);
});
