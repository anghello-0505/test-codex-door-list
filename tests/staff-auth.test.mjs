import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

const id = "550e8400-e29b-41d4-a716-446655440001";
const owner = "550e8400-e29b-41d4-a716-446655440002";
const identity = () => ({ id, email: `${id}@staff.invalid`, banned_until: "2099-01-01T00:00:00Z", app_metadata: { account_type: "access_staff", staff_member_id: id, organizer_id: owner } });

function fixture(options = {}) {
  const calls = [];
  let lookups = 0;
  const admin = {
    async getUserById(userId) {
      calls.push({ method: "get", id: userId });
      if (options.existing || lookups++ > 0) return { data: { user: options.user ?? identity() }, error: null };
      return { data: { user: null }, error: { status: options.lookupUnavailable ? 503 : 404 } };
    },
    async createUser(values) { calls.push({ method: "create", values }); return { data: { user: identity() }, error: options.createError ?? null }; },
    async updateUserById(userId, values) { calls.push({ method: "update", id: userId, values }); return { data: { user: values.ban_duration === "none" ? { ...identity(), banned_until: undefined } : identity() }, error: options.updateError ?? null }; },
  };
  return { calls, ...loadModule("src/lib/staff-auth.ts", { "server-only": {}, "@/lib/supabase/server": { adminClient: () => ({ auth: { admin } }) } }) };
}

test("Auth crea UUID fijo, alias sin datos personales, metadatos de servidor y bloqueo en una llamada", async () => {
  const instance = fixture();
  await instance.provisionStaffIdentity({ id }, owner, "password-not-logged");
  const create = instance.calls.find((call) => call.method === "create").values;
  assert.equal(create.id, id); assert.equal(create.email, `${id}@staff.invalid`);
  assert.equal(create.email_confirm, true); assert.equal(create.ban_duration, "876000h");
  assert.equal(create.role, undefined); assert.equal(create.user_metadata, undefined);
  assert.deepEqual(create.app_metadata, identity().app_metadata);
});

test("reintentar creación no cambia la contraseña y nunca adopta una identidad ajena o sin bloqueo", async () => {
  const existing = fixture({ existing: true });
  await existing.provisionStaffIdentity({ id }, owner, "changed-value");
  assert.deepEqual(existing.calls.map((call) => call.method), ["get"]);
  for (const user of [{ ...identity(), banned_until: undefined }, { ...identity(), app_metadata: { ...identity().app_metadata, organizer_id: "other" } }, { ...identity(), email: "other@example.test" }]) {
    const bad = fixture({ existing: true, user });
    await assert.rejects(bad.provisionStaffIdentity({ id }, owner, "password"));
    assert.ok(bad.calls.every((call) => call.method === "get"));
  }
});

test("un fallo de búsqueda no se confunde con identidad inexistente", async () => {
  const instance = fixture({ lookupUnavailable: true });
  await assert.rejects(instance.provisionStaffIdentity({ id }, owner, "password"));
  assert.ok(instance.calls.every((call) => call.method === "get"));
});

test("login habilita solo una identidad íntegra y el reset acepta identidades ya habilitadas", async () => {
  const blocked = fixture({ existing: true });
  await blocked.enableStaffIdentity(id, owner);
  assert.deepEqual(blocked.calls[1].values, { ban_duration: "none" });
  const enabled = fixture({ existing: true, user: { ...identity(), banned_until: undefined } });
  await enabled.enableStaffIdentity(id, owner);
  assert.deepEqual(enabled.calls.map((call) => call.method), ["get"]);
  await enabled.resetStaffIdentityPassword(id, owner, "replacement-password");
  assert.equal(enabled.calls.at(-1).values.ban_duration, "876000h");
  const foreign = fixture({ existing: true, user: { ...identity(), app_metadata: {} } });
  await assert.rejects(foreign.enableStaffIdentity(id, owner));
  assert.ok(foreign.calls.every((call) => call.method === "get"));
});

test("restablecer verifica identidad destino y mantiene el bloqueo sin cambiar rol o correo", async () => {
  const instance = fixture({ existing: true });
  await instance.resetStaffIdentityPassword(id, owner, "replacement-password");
  assert.deepEqual(instance.calls.map((call) => call.method), ["get", "update"]);
  assert.deepEqual(instance.calls[1].values, { password: "replacement-password", ban_duration: "876000h" });
  const weak = fixture({ existing: true, updateError: { code: "weak_password" } });
  assert.equal(await weak.resetStaffIdentityPassword(id, owner, "password"), "passwordRejected");
});
