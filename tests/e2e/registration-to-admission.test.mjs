import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.DOORLIST_E2E_AUTHORIZED === "yes";
const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

function required(name) {
  assert.ok(process.env[name], `Falta ${name}; consulta docs/end-to-end.md`);
  return process.env[name];
}

// Deliberately omit provider messages, tokens and response bodies from failures.
function checked(result, stage) {
  assert.ok(!result.error, `${stage}: falló el servicio (${result.error?.code ?? "unknown"})`);
  return result.data;
}

test("E2E real: publicar → registrarse → recibir correo → validar ingreso", {
  skip: enabled ? false : "Requiere entorno de pruebas y DOORLIST_E2E_AUTHORIZED=yes tras aprobación explícita",
  timeout: 240_000,
}, async (t) => {
  const base = new URL(required("E2E_BASE_URL"));
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  assert.equal(new URL(url).origin, new URL(required("E2E_EXPECTED_SUPABASE_URL")).origin,
    "El destino Supabase no coincide con el entorno autorizado");
  const publicKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const inboxKey = required("MAILOSAUR_API_KEY");
  const inbox = required("MAILOSAUR_SERVER_ID");
  assert.match(inbox, /^[a-zA-Z0-9-]+$/);
  assert.ok(base.protocol === "https:" || ["localhost", "127.0.0.1"].includes(base.hostname),
    "Usa HTTPS para las credenciales fuera de localhost");

  const run = randomUUID();
  const organizerId = randomUUID();
  const buyerId = randomUUID();
  const eventId = randomUUID();
  const ticketTypeId = randomUUID();
  const staffKey = randomUUID();
  const password = `E2e!${randomUUID()}Aa9`;
  const recipient = `e2e-${run}@${inbox}.mailosaur.net`;
  const organizerEmail = `organizer-${run}@example.test`;
  const eventTitle = `E2E ${run}`;
  const startedAt = new Date().toISOString();
  // The registration cutoff is the event instant; access opens at Guatemala midnight.
  const guatemalaDay = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const eventDate = new Date(Date.parse(`${guatemalaDay}T23:59:59-06:00`));
  assert.ok(eventDate.getTime() - Date.now() > 300_000,
    "Ejecuta fuera de los últimos cinco minutos del día en Guatemala");

  const admin = createClient(url, serviceKey, { auth });
  const organizer = createClient(url, publicKey, { auth });
  const buyer = createClient(url, publicKey, { auth });
  const anonymous = createClient(url, publicKey, { auth });
  let organizerToken;
  let buyerToken;
  const receivedIds = new Set();

  async function step(name, action) {
    let completed = false;
    await t.test(name, async () => { await action(); completed = true; });
    assert.ok(completed, `Se detuvo el recorrido en «${name}»; se intentará limpiar los fixtures`);
  }

  async function app(path, { token, body, expected = 200, method = "POST" } = {}) {
    const response = await fetch(new URL(path, base), {
      method, redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { origin: base.origin, ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(response.status, expected, `${method} ${path.replace(/[0-9a-f]{64}/g, "[code]")}: estado HTTP inesperado`);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    return response.json();
  }

  async function mailbox(path, options = {}) {
    const response = await fetch(`https://mailosaur.com/api/${path}`, {
      ...options, redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Basic ${Buffer.from(`api:${inboxKey}`).toString("base64")}`,
        "content-type": "application/json" },
    });
    assert.ok(response.ok, `Buzón de pruebas: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  // Register cleanup before the first mutation, including uncertain HTTP outcomes.
  // Every DB filter is scoped to this run's randomly generated identity or event.
  t.after(async () => {
    const failures = [];
    async function clean(stage, operation) {
      try { await operation(); } catch { failures.push(stage); }
    }
    await clean("correo", async () => {
      const messages = await mailbox(`messages/search?${new URLSearchParams({ server: inbox, receivedAfter: startedAt })}`,
        { method: "POST", body: JSON.stringify({ sentTo: recipient }) });
      for (const message of messages.items ?? []) receivedIds.add(message.id);
      for (const id of receivedIds) await mailbox(`messages/${encodeURIComponent(id)}`, { method: "DELETE" });
    });
    // Delete the event first, exercising its registration/ticket cascades.
    await clean("evento", async () => checked(await admin.from("events").delete().eq("id", eventId).eq("propietario_id", organizerId), "limpieza evento"));
    const staff = await admin.from("staff_members").select("id").eq("organizer_id", organizerId).eq("creation_key", staffKey);
    if (staff.error) failures.push("consulta staff");
    if (staff.data?.length) {
      await clean("sesiones staff", async () => checked(await admin.from("staff_access_sessions").delete()
        .in("staff_member_id", staff.data.map((member) => member.id)), "limpieza sesiones"));
    }
    for (const table of ["ticket_validation_attempts", "staff_event_assignments", "staff_members", "organization_access_links"]) {
      await clean(table, async () => checked(await admin.from(table).delete().eq("organizer_id", organizerId), "limpieza"));
    }
    for (const id of [...(staff.data ?? []).map((member) => member.id), buyerId, organizerId]) {
      await clean("identidad", async () => {
        const result = await admin.auth.admin.deleteUser(id);
        if (result.error && !["user_not_found", "not_found"].includes(result.error.code)) checked(result, "limpieza identidad");
      });
    }
    assert.deepEqual(failures, [], `Limpieza incompleta (${failures.join(", ")}); run=${run}; organizerId=${organizerId}; eventId=${eventId}`);
  });

  await step("crear identidades aisladas y autenticarlas", async () => {
    checked(await admin.auth.admin.createUser({ id: organizerId, email: organizerEmail, password, email_confirm: true }), "crear organizador");
    checked(await admin.auth.admin.createUser({ id: buyerId, email: recipient, password, email_confirm: true }), "crear comprador");
    organizerToken = checked(await organizer.auth.signInWithPassword({ email: organizerEmail, password }), "login organizador").session.access_token;
    buyerToken = checked(await buyer.auth.signInWithPassword({ email: recipient, password }), "login comprador").session.access_token;
  });

  await step("crear borrador, impedir registro y publicar bajo RLS del organizador", async () => {
    checked(await organizer.from("events").insert({ id: eventId, propietario_id: organizerId,
      titulo: eventTitle, descripcion: "Fixture E2E efímero", lugar: "Pruebas E2E", fecha: eventDate.toISOString(),
      aforo_maximo: 1, access_grace_minutes: 120 }), "crear evento");
    checked(await organizer.from("ticket_types").insert({ id: ticketTypeId, evento_id: eventId, nombre: "General E2E", aforo_maximo: 1 }), "crear tipo");
    const rejected = await app("/api/registros/confirmar", { token: buyerToken, expected: 409,
      body: { eventId, ticketTypeId, name: "Titular E2E", email: recipient, idempotencyKey: randomUUID() } });
    assert.equal(rejected.error, "eventUnavailable");
    const hidden = checked(await anonymous.from("events").select("id").eq("id", eventId), "consulta pública borrador");
    assert.equal(hidden.length, 0);
    const published = checked(await organizer.from("events").update({ estado: "publicado" }).eq("id", eventId).select("id,estado").single(), "publicar");
    assert.equal(published.estado, "publicado");
    assert.equal(checked(await anonymous.from("events").select("id").eq("id", eventId).single(), "consulta pública").id, eventId);
  });

  let registration;
  await step("confirmar registro, recuperar reintento idempotente y rechazar falta de sesión", async () => {
    const body = { eventId, ticketTypeId, name: "Titular E2E", email: recipient, idempotencyKey: randomUUID() };
    assert.equal((await app("/api/registros/confirmar", { body, expected: 401 })).error, "sessionRequired");
    const results = await Promise.all([
      app("/api/registros/confirmar", { token: buyerToken, body }),
      app("/api/registros/confirmar", { token: buyerToken, body }),
    ]);
    registration = results[0];
    assert.equal(registration.emailConfigured, true, "La aplicación debe tener correo real configurado");
    assert.match(registration.ticket.code, /^[0-9a-f]{64}$/);
    assert.equal(registration.ticket.status, "valid");
    const retry = results[1];
    assert.equal(retry.registrationId, registration.registrationId);
    assert.ok(retry.ticket.code === registration.ticket.code, "El reintento emitió otro código");
    const rows = checked(await buyer.from("registrations").select("id").eq("evento_id", eventId), "registros comprador");
    assert.equal(rows.length, 1);
  });

  let receivedCode;
  await step("recibir el correo real con el mismo código y PDF", async () => {
    const deadline = Date.now() + 90_000;
    let message;
    while (Date.now() < deadline) {
      const result = await mailbox(`messages/search?${new URLSearchParams({ server: inbox, receivedAfter: startedAt })}`,
        { method: "POST", body: JSON.stringify({ sentTo: recipient, subject: eventTitle }) });
      for (const item of result.items ?? []) receivedIds.add(item.id);
      if (result.items?.length) {
        message = await mailbox(`messages/${encodeURIComponent(result.items[0].id)}`);
        break;
      }
      await delay(2000);
    }
    assert.ok(message, "No llegó el correo al buzón en 90 segundos; aceptación del proveedor no equivale a recepción");
    assert.ok(message.to.some((address) => address.email === recipient), "Destinatario incorrecto");
    assert.ok(message.subject.includes(eventTitle), "Evento incorrecto en correo");
    receivedCode = message.text?.body?.match(/\b[0-9a-f]{64}\b/)?.[0];
    assert.ok(receivedCode, "El correo recibido no contiene código");
    assert.ok(receivedCode === registration.ticket.code, "El código recibido no coincide con la entrada emitida");
    assert.ok(message.attachments.some((file) => file.fileName === "entrada-doorlist.pdf" && file.contentType === "application/pdf"), "Falta PDF adjunto");
  });

  await step("validar código recibido, recuperar resultado incierto y rechazar segundo ingreso", async () => {
    const staff = await app("/api/organizador/asistentes", { token: organizerToken, expected: 201,
      body: { name: "Puerta E2E", username: `e2e-${run.slice(0, 20)}`, password, eventIds: [eventId], idempotencyKey: staffKey } });
    assert.equal(staff.staffMember.provisioningStatus, "ready");
    const { path } = await app("/api/organizador/acceso", { token: organizerToken });
    assert.match(path, /^\/acceso\/[0-9a-f]{64}$/);
    const api = `/api${path}`;
    const login = await app(`${api}/sesion`, { body: { username: staff.staffMember.username, password } });
    const token = login.tokens.accessToken;
    const body = { eventId, code: receivedCode, operationId: randomUUID(), source: "camera" };
    const events = await app(`${api}/eventos`, { method: "GET", token });
    assert.ok(events.events.some((event) => event.id === eventId && event.available));
    const first = await app(`${api}/validaciones`, { token, body });
    assert.equal(first.result, "accepted");
    assert.equal(first.replayed, false);
    const recovered = await app(`${api}/validaciones/${body.operationId}?eventId=${eventId}`, { method: "GET", token });
    assert.equal(recovered.result, "accepted");
    const retry = await app(`${api}/validaciones`, { token, body });
    assert.equal(retry.replayed, true);
    const duplicate = await app(`${api}/validaciones`, { token, expected: 409, body: { ...body, operationId: randomUUID() } });
    assert.equal(duplicate.error, "accessTicketUsed");
    const ticket = checked(await buyer.from("tickets").select("estado").eq("registro_id", registration.registrationId).single(), "estado final");
    assert.equal(ticket.estado, "used");
  });
});
