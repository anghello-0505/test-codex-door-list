import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

function mount(onSearch) {
  const slots = []; let index = 0; let cleanup; let tree;
  const validated = [];
  const Component = loadModule("src/components/access-control/email-search.tsx", {
    react: {
      useState(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], (value) => { slots[slot] = value; }]; },
      useRef(value) { const slot = index++; return slots[slot] ??= { current: value }; },
      useEffect(effect) { cleanup ??= effect(); },
    },
    "@/components/ticket-status": { default: () => null },
  }).default;
  const render = (disabled = false) => { index = 0; tree = Component({ disabled, onSearch, onValidate: (code) => validated.push(code) }); };
  render();
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    return [node, ...[node.props?.children].flat(Infinity).filter((child) => child !== undefined).flatMap((child) => nodes(child))];
  }
  return { render, nodes, validated, unmount: () => cleanup(),
    change: (email) => nodes().find((node) => node.type === "input").props.onChange({ target: { value: email } }),
    search: () => nodes().find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }),
  };
}

test("buscar no consume entrada; solo ofrece validación explícita de entradas válidas y descarta al editar", async () => {
  const f = mount(async () => ({ tickets: ["valid", "used", "revoked"].map((status) => ({ ticketId: status, holderName: status, ticketTypeName: "General", status, code: status })), truncated: false }));
  f.change("titular@example.com"); f.render(); await f.search(); f.render();
  assert.deepEqual(f.validated, []);
  const buttons = f.nodes().filter((node) => node.type === "button" && node.props.onClick);
  assert.equal(buttons.length, 1);
  buttons[0].props.onClick(); assert.deepEqual(f.validated, ["valid"]);
  f.render(); assert.equal(f.nodes().filter((node) => node.type === "li").length, 0);
  await f.search(); f.render(); f.change("otro@example.com"); f.render();
  assert.equal(f.nodes().filter((node) => node.type === "li").length, 0);
});

test("cambiar evento/cuenta descarta respuestas tardías y una operación pendiente deshabilita búsqueda", async () => {
  let resolve; let calls = 0;
  const f = mount(() => { calls++; return new Promise((done) => { resolve = done; }); });
  f.render(true); await f.search(); assert.equal(calls, 0);
  f.render(); const searching = f.search(); f.render();
  assert.ok(f.nodes().some((node) => node.props?.role === "status"));
  f.unmount(); resolve({ tickets: [{ ticketId: "late", status: "valid" }], truncated: false }); await searching; f.render();
  assert.equal(f.nodes().filter((node) => node.type === "li").length, 0);
  assert.deepEqual(f.validated, []);
});
