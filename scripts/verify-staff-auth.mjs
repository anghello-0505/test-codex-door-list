// Explicitly opt-in: creates and deletes ONE isolated, banned Auth identity.
// Never imported by npm test. No credentials or provider responses are logged.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadModule } from "../tests/helpers/load-module.mjs";

const expectedRef = "fhyngffqlqyqlmlbuyda";
if (!process.argv.includes(`--project-ref=${expectedRef}`) || !process.argv.includes("--allow-test-account")) {
  console.error("Explicit project and test-account authorization flags are required.");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url !== `https://${expectedRef}.supabase.co` || !key || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  console.error("The configured development project does not match the approved target.");
  process.exit(1);
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, key, options);
const userClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
const identity = loadModule("src/lib/staff-auth.ts", { "server-only": {}, "@/lib/supabase/server": { adminClient: () => admin } });
const id = randomUUID();
const owner = randomUUID();
const password = () => `${randomBytes(24).toString("base64url")}aA9!`;
const initialPassword = password();
let failed = false;
try {
  const created = await identity.provisionStaffIdentity({ id }, owner, initialPassword);
  assert.equal(created, undefined);
  const first = await admin.auth.admin.getUserById(id);
  assert.equal(first.error, null);
  assert.ok(identity.matchesStaffIdentity(first.data.user, id, owner));
  assert.ok(!Object.hasOwn(first.data.user, "encrypted_password"));
  const denied = await userClient.auth.signInWithPassword({ email: identity.staffTechnicalEmail(id), password: initialPassword });
  assert.equal(denied.data.session, null);
  assert.equal(denied.error?.code, "user_banned");
  await identity.provisionStaffIdentity({ id }, owner, password());
  const newPassword = password();
  assert.equal(await identity.resetStaffIdentityPassword(id, owner, newPassword), undefined);
  const stillDenied = await userClient.auth.signInWithPassword({ email: identity.staffTechnicalEmail(id), password: newPassword });
  assert.equal(stillDenied.data.session, null);
  assert.equal(stillDenied.error?.code, "user_banned");
  console.log("PASS: technical email accepted, identity confirmed and banned, creation retry and password reset verified, both sign-ins rejected.");
} catch {
  failed = true;
  console.error("FAIL: Auth verification did not complete. No credential or provider response has been logged.");
} finally {
  try {
    const current = await admin.auth.admin.getUserById(id);
    if (current.data.user) {
      assert.ok(identity.matchesStaffIdentity(current.data.user, id, owner));
      const removed = await admin.auth.admin.deleteUser(id);
      assert.equal(removed.error, null);
      console.log("PASS: isolated test identity deleted.");
    } else if (current.error?.status !== 404) throw new Error("Cleanup unavailable");
  } catch {
    failed = true;
    console.error(`FAIL: cleanup requires verification of test identity ${id}.`);
  }
}
process.exitCode = failed ? 1 : 0;
