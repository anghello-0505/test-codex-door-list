import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

function mount(registration = {}) {
  const slots = [];
  let index = 0;
  let cleanup;
  let tree;
  const Component = loadModule("src/app/(workspace)/dashboard/eventos/[id]/revoke-ticket-control.tsx", {
    react: {
      useId: () => "reason-id",
      useRef(value) { const slot = index++; return slots[slot] ??= { current: value }; },
      useState(value) { const slot = index++; if (!(slot in slots)) slots[slot] = value; return [slots[slot], (next) => { slots[slot] = next; }]; },
      useEffect(effect) { cleanup ??= effect(); },
    },
  }).default;
  const render = () => { index = 0; tree = Component({ eventId: "event", token: "token", registration: { id: "registration", ticket: { code: "secret", status: "valid" }, ...registration } }); };
  function all(node, type) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((child) => all(child, type));
    return [...(node.type === type ? [node] : []), ...all(node.props?.children, type)];
  }
  render();
  return { render, find: (type) => all(tree, type), unmount: () => cleanup() };
}

test("revocación muestra acción solo para válidas y permite indicar motivo", () => {
  const form = mount();
  assert.equal(form.find("button")[0].props.children, "Revocar entrada");
  form.find("button")[0].props.onClick(); form.render();
  assert.equal(form.find("label")[0].props.htmlFor, form.find("textarea")[0].props.id);
  assert.equal(form.find("textarea")[0].props.maxLength, 1000);
  assert.ok(form.find("button")[0].props.disabled);
  form.find("textarea")[0].props.onChange({ target: { value: "Duplicado" } }); form.render();
  assert.equal(form.find("button")[0].props.disabled, false);
  assert.equal(mount({ ticket: { code: "secret", status: "used" } }).find("button").length, 0);
  assert.equal(mount({ ticket: { code: "secret", status: "revoked" } }).find("button").length, 0);
});

test("resultado perdido bloquea el motivo y reintenta el mismo contrato sin leer errores crudos", async () => {
  const previous = globalThis.fetch;
  const calls = [];
  let reads = 0;
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return calls.length === 1 ? { ok: false, status: 503, json: async () => { reads++; return { error: "provider secret" }; } }
        : Response.json({ ticketStatus: "revoked", reason: "Duplicado", emailStatus: "accepted" });
    };
    const form = mount();
    form.find("button")[0].props.onClick(); form.render();
    form.find("textarea")[0].props.onChange({ target: { value: "Duplicado" } }); form.render();
    await form.find("form")[0].props.onSubmit({ preventDefault() {} }); form.render();
    assert.equal(reads, 0);
    assert.equal(form.find("textarea")[0].props.disabled, true);
    await form.find("form")[0].props.onSubmit({ preventDefault() {} }); form.render();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.body, calls[1].init.body);
    assert.deepEqual(calls[0].init.headers, { Authorization: "Bearer token", "Content-Type": "application/json" });
    assert.equal(form.find("button").length, 0);
    assert.equal(form.find("textarea").length, 0);
  } finally { globalThis.fetch = previous; }
});

test("desmontar cancela la petición al cambiar sesión o evento", async () => {
  const previous = globalThis.fetch;
  let signal;
  let finish;
  try {
    globalThis.fetch = (_url, init) => { signal = init.signal; return new Promise((resolve) => { finish = resolve; }); };
    const form = mount({ revocation: { reason: "Duplicado", emailStatus: "failed" } });
    const pending = form.find("form")[0].props.onSubmit({ preventDefault() {} });
    form.unmount();
    assert.equal(signal.aborted, true);
    finish(Response.json({ ticketStatus: "revoked", reason: "Duplicado", emailStatus: "accepted" }));
    await pending;
    form.render();
    assert.equal(form.find("form").length, 1, "Late result should be discarded");
  } finally { globalThis.fetch = previous; }
});

test("mapper conserva estado y aviso en relaciones uno-a-uno de Supabase", () => {
  const { mapOrganizerRegistrations } = loadModule("src/lib/persistence-mappers.ts");
  for (const wrap of [(value) => value, (value) => [value]]) {
    const rows = mapOrganizerRegistrations([{ id: "registration", tickets: wrap({ codigo: "secret", estado: "revoked", ticket_revocations: wrap({ reason: "Duplicado", delivery_status: "failed" }) }) }], []);
    assert.deepEqual(rows[0].revocation, { reason: "Duplicado", emailStatus: "failed" });
    assert.equal(rows[0].ticket.status, "revoked");
  }
});
