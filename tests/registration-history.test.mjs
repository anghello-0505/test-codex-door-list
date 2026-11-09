import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const id = "550e8400-e29b-41d4-a716-446655440000";
const context = { params: Promise.resolve({ id }) };
function route(event, history, signedIn = true) {
  let adminCalls = 0;
  const query = { select: () => query, eq: () => query, maybeSingle: async () => event };
  const deps = {
    "@/lib/api-response": { errorResponse: (error, status) => Response.json({ error }, { status }), jsonResponse: (data) => Response.json(data) },
    "@/lib/supabase/server": { authenticatedBuyerClient: async () => signedIn ? { client: { from: () => query }, buyerId: "owner" } : null, adminClient: () => { adminCalls++; return { rpc: async () => history }; } },
    "@/lib/validation": { isUuid: (value) => value === id },
  };
  const source = readFileSync(new URL("../src/app/api/organizador/eventos/[id]/registros-por-dia/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const routeModule = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => deps[name], routeModule, routeModule.exports);
  return { get: () => routeModule.exports.GET(new Request("https://example.test"), context), calls: () => adminCalls };
}
test("history requires authentication and event ownership before privileged access", async () => {
  for (const instance of [route({}, {}, false), route({ data: null, error: null }, {})]) {
    const response = await instance.get();
    assert.ok([401, 404].includes(response.status));
    assert.equal(instance.calls(), 0);
  }
});
test("history maps daily counts and reports an unpublished event", async () => {
  const instance = route({ data: { published_at: "2026-01-01T00:00:00Z", publication_date_estimated: true }, error: null }, { data: [{ day: "2026-01-01", total: 3 }, { day: "2026-01-02", total: 0 }], error: null });
  assert.deepEqual(await (await instance.get()).json(), { publishedAt: "2026-01-01T00:00:00Z", estimated: true, days: [{ date: "2026-01-01", count: 3 }, { date: "2026-01-02", count: 0 }] });
  const draft = route({ data: { published_at: null }, error: null }, {});
  assert.deepEqual(await (await draft.get()).json(), { publishedAt: null, estimated: false, days: [] });
  assert.equal(draft.calls(), 0);
});
