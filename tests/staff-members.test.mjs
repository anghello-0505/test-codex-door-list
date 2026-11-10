import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadModule } from "./helpers/load-module.mjs";

const owner = "550e8400-e29b-41d4-a716-446655440000";
const staffId = "550e8400-e29b-41d4-a716-446655440001";
const eventId = "550e8400-e29b-41d4-a716-446655440002";
const key = "550e8400-e29b-41d4-a716-446655440003";
const other = "550e8400-e29b-41d4-a716-446655440004";
const password = "test-only-password";
const row = (values = {}) => ({ id: staffId, organizer_id: owner, display_name: "María", username: "maria", is_active: true, provisioning_status: "ready", deleted_at: null, created_at: "2026-11-10T00:00:00Z", ...values });

function fixture(options = {}) {
  const calls = [];
  const members = options.members ?? [row()];
  const tables = {
    staff_members: members,
    staff_event_assignments: options.assignments ?? [],
    events: options.events ?? [],
  };
  const client = {
    from(table) {
      const call = { table, filters: [], columns: "", range: null, limit: null };
      calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(...args) { call.filters.push(["eq", ...args]); return query; },
        is(...args) { call.filters.push(["eq", ...args]); return query; },
        in(...args) { call.filters.push(["in", ...args]); return query; },
        gt(...args) { call.filters.push(["gt", ...args]); return query; },
        order() { return query; },
        limit(size) { call.limit = size; return query; },
        range(start, end) { call.range = [start, end]; return query; },
        data() {
          return tables[table].filter((item) => call.filters.every(([op, name, value]) => op === "in" ? value.includes(item[name]) : op === "gt" ? item[name] > value : item[name] === value));
        },
        maybeSingle() { return Promise.resolve({ data: query.data()[0] ?? null, error: options.queryError ?? null }); },
        then(resolve, reject) {
          const all = query.data();
          const data = all.slice(call.range?.[0] ?? 0, call.range ? call.range[1] + 1 : call.limit ?? all.length);
          return Promise.resolve({ data, count: all.length, error: options.queryError ?? null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args = {}) {
      calls.push({ rpc: name, args });
      if (name === "is_organizer_account") return { data: options.staff !== true, error: options.accessError ?? null };
      if (options.rpcError) return { data: null, error: options.rpcError };
      if (name === "reserve_staff_member") {
        if (!members.find((member) => member.id === staffId)) members.push(row({ display_name: args.p_name, username: args.p_username, provisioning_status: "pending" }));
        return { data: staffId, error: null };
      }
      if (args.p_action === "complete") members.find((member) => member.id === args.p_staff_id).provisioning_status = "ready";
      return { data: null, error: null };
    },
  };
  const overrides = {
    "server-only": {},
    "@/lib/supabase/server": { authenticatedBuyerClient: async () => options.anonymous ? null : { client, buyerId: owner } },
    "@/lib/staff-auth": {
      staffAuthConfigured: () => !options.unconfigured,
      provisionStaffIdentity: async (...args) => { calls.push({ privileged: "create", id: args[0].id, owner: args[1] }); if (options.authFailure) throw new Error("provider secret response"); return options.passwordRejected ? "passwordRejected" : undefined; },
      resetStaffIdentityPassword: async (...args) => { calls.push({ privileged: "password", id: args[0], owner: args[1] }); if (options.authFailure) throw new Error("provider secret response"); return options.passwordRejected ? "passwordRejected" : undefined; },
    },
  };
  const routes = {
    list: loadModule("src/app/api/organizador/asistentes/route.ts", overrides),
    member: loadModule("src/app/api/organizador/asistentes/[id]/route.ts", overrides),
    password: loadModule("src/app/api/organizador/asistentes/[id]/contrasena/route.ts", overrides),
    complete: loadModule("src/app/api/organizador/asistentes/[id]/completar/route.ts", overrides),
    assignments: loadModule("src/app/api/organizador/asistentes/[id]/eventos/route.ts", overrides),
    events: loadModule("src/app/api/organizador/asistentes/eventos/route.ts", overrides),
  };
  return {
    calls,
    async request(kind, method, body, id = staffId, page = "1") {
      return routes[kind][method](new Request(`https://doorlist.test/api/organizador/asistentes?page=${page}`, {
        method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      }), { params: Promise.resolve({ id }) });
    },
  };
}

test("todas las rutas de personal exigen sesión y rechazan personal antes de consultar o usar Auth", async () => {
  for (const [kind, method] of [["list", "GET"], ["list", "POST"], ["member", "PATCH"], ["member", "DELETE"], ["password", "POST"], ["complete", "POST"], ["assignments", "PUT"], ["events", "GET"]]) {
    for (const [options, status] of [[{ anonymous: true }, 401], [{ staff: true }, 403]]) {
      const instance = fixture(options);
      assert.equal((await instance.request(kind, method)).status, status);
      assert.ok(instance.calls.every((call) => call.rpc === "is_organizer_account"));
    }
  }
});

test("listar exige propiedad, excluye eliminados y devuelve contratos públicos sin credenciales", async () => {
  const instance = fixture({ members: [row(), row({ id: other, organizer_id: other }), row({ id: key, deleted_at: "2026-11-10T00:00:00Z" })], assignments: [{ staff_member_id: staffId, organizer_id: owner, event_id: eventId }] });
  const response = await instance.request("list", "GET");
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.total, 1);
  assert.deepEqual(result.staffMembers[0].eventIds, [eventId]);
  assert.deepEqual(Object.keys(result.staffMembers[0]).sort(), ["id", "name", "username", "isActive", "provisioningStatus", "eventIds", "createdAt"].sort());
  assert.ok(instance.calls.find((call) => call.table === "staff_members").filters.some((filter) => filter[1] === "organizer_id" && filter[2] === owner));
});

test("recursos ajenos, eliminados e IDs inválidos nunca llegan a operaciones privilegiadas", async () => {
  for (const [kind, method, body] of [["member", "PATCH", { name: "Otro", username: "otro" }], ["member", "DELETE"], ["password", "POST", { password }], ["complete", "POST", { password }], ["assignments", "PUT", { eventIds: [] }]]) {
    for (const options of [{ members: [] }, { members: [row({ organizer_id: other })] }, { members: [row({ deleted_at: "2026-11-10T00:00:00Z" })] }]) {
      const instance = fixture(options);
      assert.equal((await instance.request(kind, method, body)).status, 404);
      assert.ok(!instance.calls.some((call) => call.privileged || call.rpc === "manage_staff_member"));
    }
    const invalid = fixture();
    assert.equal((await invalid.request(kind, method, body, "invalid")).status, 400);
  }
});

test("crear normaliza usuario, permite cero eventos y reserva antes de crear identidad", async () => {
  const instance = fixture({ members: [] });
  const response = await instance.request("list", "POST", { name: " María ", username: " MARIA ", password, eventIds: [], idempotencyKey: key });
  assert.equal(response.status, 201);
  const reserve = instance.calls.findIndex((call) => call.rpc === "reserve_staff_member");
  const create = instance.calls.findIndex((call) => call.privileged === "create");
  assert.ok(reserve < create);
  assert.deepEqual(instance.calls[reserve].args, { p_name: "María", p_username: "maria", p_event_ids: [], p_creation_key: key });
  assert.equal((await response.json()).staffMember.provisioningStatus, "ready");
  assert.ok(!JSON.stringify(instance.calls).includes(password));
});

test("alta repetida lista no vuelve a crear ni restablecer credenciales", async () => {
  const instance = fixture();
  assert.equal((await instance.request("list", "POST", { name: "María", username: "maria", password, eventIds: [], idempotencyKey: key })).status, 200);
  assert.ok(!instance.calls.some((call) => call.privileged));
});

test("validación rechaza sobreasignación, duplicados, campos de propietario y contraseñas inválidas antes de reservar", async () => {
  const valid = { name: "María", username: "maria", password, eventIds: [], idempotencyKey: key };
  for (const bad of [{ name: " " }, { username: "x" }, { username: "maría" }, { organizerId: other }, { authUserId: other }, { eventIds: [eventId, eventId.toUpperCase()] }, { eventIds: ["bad"] }, { password: "short" }, { password: "é".repeat(37) }]) {
    const instance = fixture();
    assert.equal((await instance.request("list", "POST", { ...valid, ...bad })).status, 400);
    assert.ok(!instance.calls.some((call) => call.rpc === "reserve_staff_member" || call.privileged));
  }
});

test("errores de base de datos conservan códigos HTTP y no filtran respuestas del proveedor", async () => {
  for (const [error, status, code] of [[{ code: "23505" }, 409, "staffUsernameTaken"], [{ message: "staff_invalid_events" }, 400, "staffInvalidEvents"], [{ message: "staff_conflict" }, 409, "staffConflict"], [{ code: "42501" }, 403, "staffAccessDenied"], [{ code: "PGRST202" }, 503, "staffNotConfigured"]]) {
    const instance = fixture({ rpcError: error });
    const response = await instance.request("assignments", "PUT", { eventIds: [eventId] });
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { error: code });
  }
});

test("fallo parcial de Auth mantiene reserva pendiente y permite completar sin duplicar", async () => {
  const instance = fixture({ members: [], authFailure: true });
  const response = await instance.request("list", "POST", { name: "María", username: "maria", password, eventIds: [], idempotencyKey: key });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "staffCreationPending" });
  assert.ok(!instance.calls.some((call) => call.args?.p_action === "complete"));
  const retry = fixture({ members: [row({ provisioning_status: "pending" })] });
  assert.equal((await retry.request("complete", "POST", { password })).status, 201);
  assert.equal(retry.calls.filter((call) => call.privileged).length, 1);
});

test("cambiar contraseña invalida acceso antes de Auth y trata un timeout como resultado incierto", async () => {
  const instance = fixture({ authFailure: true });
  const response = await instance.request("password", "POST", { password });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "staffPasswordUnconfirmed" });
  assert.ok(instance.calls.findIndex((call) => call.args?.p_action === "invalidate") < instance.calls.findIndex((call) => call.privileged === "password"));
  const pending = fixture({ members: [row({ provisioning_status: "pending" })] });
  assert.equal((await pending.request("password", "POST", { password })).status, 409);
  assert.ok(!pending.calls.some((call) => call.privileged));
});

test("desactivar, reactivar y eliminar no requieren Auth ni levantan bloqueos", async () => {
  const instance = fixture();
  assert.equal((await instance.request("member", "PATCH", { isActive: false })).status, 200);
  assert.equal((await instance.request("member", "PATCH", { isActive: true })).status, 200);
  assert.equal((await instance.request("member", "DELETE")).status, 200);
  assert.deepEqual(instance.calls.filter((call) => call.rpc === "manage_staff_member").map((call) => call.args.p_action), ["update", "update", "delete"]);
  assert.ok(!instance.calls.some((call) => call.privileged));
});

test("lector de solicitudes controla tamaño real sin Content-Length y JSON mal formado", async () => {
  const { readStaffBody } = loadModule("src/lib/staff-members-server.ts", { "server-only": {}, "@/lib/supabase/server": {}, "@/lib/staff-auth": {} });
  for (const [body, expected] of [["x".repeat(65537), 413], ["null", 400], ["[]", 400], ["{", 400]]) {
    await assert.rejects(readStaffBody(new Request("https://doorlist.test", { method: "POST", headers: { "Content-Type": "application/json" }, body })), (error) => error.status === expected);
  }
});

test("formularios distinguen creación, edición y asignación sin renderizar credenciales existentes", () => {
  const { default: Editor } = loadModule("src/app/(workspace)/organizador/asistentes/staff-editor.tsx");
  const props = { member: { id: staffId, name: "María", username: "maria", eventIds: [] }, events: [], busy: false, error: "", onCancel() {}, async onSave() { return true; } };
  const create = renderToStaticMarkup(React.createElement(Editor, { ...props, mode: "create" }));
  const edit = renderToStaticMarkup(React.createElement(Editor, { ...props, mode: "edit" }));
  const assignments = renderToStaticMarkup(React.createElement(Editor, { ...props, mode: "events" }));
  assert.match(create, /Contraseña inicial/); assert.match(create, /new-password/);
  assert.ok(!edit.includes('type="password"'));
  assert.match(assignments, /guardar sin eventos/); assert.match(assignments, /no tienes eventos/);
});
