import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

function mount() {
  const slots = [];
  let index = 0;
  let cleanup;
  let tree;
  const downloads = [];
  const Component = loadModule("src/app/(workspace)/dashboard/eventos/[id]/export-attendees-button.tsx", {
    react: {
      useRef(value) { const slot = index++; return slots[slot] ??= { current: value }; },
      useState(value) { const slot = index++; slots[slot] ??= value; return [slots[slot], (next) => { slots[slot] = next; }]; },
      useEffect(effect) { cleanup ??= effect(); },
    },
    "@/lib/csv": { downloadCsv: (...args) => downloads.push(args) },
  }).default;
  const render = () => { index = 0; tree = Component({ eventId: "event", token: "token" }); };
  render();
  return { render, click: () => tree.props.children[0].props.onClick(), downloads, unmount: () => cleanup() };
}

test("descarga comprueba response.ok antes de leer el archivo y permite reintentar", async () => {
  const originalFetch = globalThis.fetch;
  let reads = 0;
  let calls = 0;
  try {
    globalThis.fetch = async () => ({ ok: ++calls > 1, blob: async () => { reads++; return new Blob(["csv"]); } });
    const button = mount();
    button.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(reads, 0);
    assert.equal(button.downloads.length, 0);
    button.render();
    button.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(reads, 1);
    assert.equal(button.downloads.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("desmontar al cambiar evento o sesión cancela la descarga y descarta resultados tardíos", async () => {
  const originalFetch = globalThis.fetch;
  let finish;
  let signal;
  let calls = 0;
  try {
    globalThis.fetch = (_url, init) => {
      calls++;
      signal = init.signal;
      assert.deepEqual(init.headers, { Authorization: "Bearer token" });
      assert.equal(init.cache, "no-store");
      return new Promise((resolve) => { finish = resolve; });
    };
    const button = mount();
    button.click();
    button.click();
    assert.equal(calls, 1, "Duplicate click initiated another export");
    button.unmount();
    assert.ok(signal.aborted);
    finish({ ok: true, blob: async () => new Blob(["private"] ) });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(button.downloads.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
