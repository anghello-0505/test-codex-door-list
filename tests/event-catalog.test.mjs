import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getEventAvailability, groupCatalogEvents } from "../src/lib/event-catalog.ts";
import { loadModule } from "./helpers/load-module.mjs";

const event = (id, date, isOpen = true, amounts = [3]) => ({
  id, date, isOpen, title: `Evento ${id}`, description: "Descripción del evento.", location: "Guatemala",
  ticketTypes: amounts.map((available, index) => ({ id: `${id}-${index}`, name: "General", available, capacity: 10, eventId: id })),
});
const sample = event("uno", "2026-12-01T18:00:00Z");
const Link = ({ children, ...props }) => createElement("a", props, children);
const EventCard = loadModule("src/app/event-card.tsx", { "next/link": { default: Link } }).default;
const settle = () => new Promise((resolve) => setImmediate(resolve));

function mountCatalog(rpc) {
  let state;
  let version = 0;
  let previousVersion;
  let pendingEffect;
  let cleanup;
  let tree;
  let updates = 0;
  const originalWindow = globalThis.window;
  const listeners = new Map();
  const intervals = new Set();
  globalThis.window = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
    setInterval: (callback) => { intervals.add(callback); return callback; },
    clearInterval: (callback) => intervals.delete(callback),
  };
  const Component = loadModule("src/app/events-catalog.tsx", {
    react: {
      useReducer(reducer, initial) {
        state ??= initial;
        return [state, (action) => { updates++; state = reducer(state, action); }];
      },
      useState: () => [version, (next) => { version = next(version); }],
      useEffect(effect, dependencies) {
        if (previousVersion !== dependencies[0]) { pendingEffect = effect; previousVersion = dependencies[0]; }
      },
    },
    "next/link": { default: Link },
    "@/lib/supabase/client": { supabase: rpc ? { rpc } : null },
    "./event-card": { default: EventCard },
  }).default;
  function render() {
    tree = Component();
    if (pendingEffect) { cleanup?.(); const effect = pendingEffect; pendingEffect = null; cleanup = effect(); }
    return renderToStaticMarkup(tree);
  }
  function findButton(node) {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === "button") return node;
    return [node.props?.children].flat(Infinity).map(findButton).find(Boolean);
  }
  render();
  return {
    render,
    get state() { return state; },
    get updates() { return updates; },
    get resources() { return listeners.size + intervals.size; },
    focus: () => listeners.get("focus")?.(),
    tick: () => { for (const callback of intervals) callback(); },
    retry: () => { findButton(tree).props.onClick(); render(); },
    unmount: () => cleanup?.(),
    restore: () => { cleanup?.(); globalThis.window = originalWindow; },
  };
}

const payload = (events) => ({ data: { ahora: "2026-11-07T12:00:00Z", eventos: events.map((value) => ({
  id: value.id, titulo: value.title, descripcion: value.description, fecha: value.date, lugar: value.location, abierto: value.isOpen,
  tipos_entrada: value.ticketTypes.map((type) => ({ id: type.id, nombre: type.name, aforo_maximo: type.capacity, disponibles: type.available })),
})) }, error: null });

test("un fallo al actualizar conserva el catálogo y el reintento recupera los datos", async () => {
  let calls = 0;
  const mounted = mountCatalog(async () => {
    calls++;
    if (calls === 2) throw new Error("private provider detail");
    return payload([calls === 1 ? sample : { ...sample, title: "Evento actualizado" }]);
  });
  try {
    await settle();
    assert.match(mounted.render(), /Evento uno/);
    assert.match(mounted.render(), /3 cupos disponibles/);
    mounted.focus();
    await settle();
    const stale = mounted.render();
    assert.match(stale, /Evento uno/);
    assert.match(stale, /Conservamos la última consulta/);
    assert.doesNotMatch(stale, /private provider detail/);
    mounted.retry();
    assert.equal(mounted.state.refreshing, true);
    await settle();
    assert.match(mounted.render(), /Evento actualizado/);
    assert.equal(mounted.state.error, false);
    assert.equal(calls, 3);
  } finally { mounted.restore(); }
});

test("error inicial permite reintentar sin mostrar un falso vacío", async () => {
  let calls = 0;
  const mounted = mountCatalog(async () => ++calls === 1 ? { data: null, error: { message: "secret" } } : payload([]));
  try {
    await settle();
    const failed = mounted.render();
    assert.match(failed, /role="alert"/);
    assert.match(failed, /Reintentar/);
    assert.doesNotMatch(failed, /Por ahora no hay/);
    mounted.retry();
    await settle();
    const empty = mounted.render();
    assert.match(empty, /Por ahora no hay eventos publicados/);
    assert.match(empty, /Actualizar lista/);
    assert.match(empty, /href="\/mis-boletos"/);
    assert.equal(mounted.state.error, false);
    mounted.focus();
    await settle();
  } finally { mounted.restore(); }
});

test("sin configuración se muestra un error recuperable sin hacer consultas", async () => {
  const mounted = mountCatalog(null);
  try {
    await settle();
    assert.match(mounted.render(), /No pudimos cargar los eventos/);
    assert.equal(mounted.state.events, null);
  } finally { mounted.restore(); }
});

test("no solapa consultas por foco y temporizador ni actualiza después de desmontar", async () => {
  let resolve;
  let calls = 0;
  const mounted = mountCatalog(() => { calls++; return new Promise((done) => { resolve = done; }); });
  try {
    mounted.focus(); mounted.tick();
    assert.equal(calls, 1);
    mounted.unmount();
    assert.equal(mounted.resources, 0);
    const updates = mounted.updates;
    resolve(payload([sample]));
    await settle();
    assert.equal(mounted.updates, updates);
  } finally { mounted.restore(); }
});

test("separa próximos y pasados según el servidor, ordena por instante y conserva los originales", () => {
  const events = [
    event("lejano", "2026-12-03T18:00:00Z"), event("cercano", "2026-12-01T13:00:00-04:00"),
    event("antiguo", "2026-10-01T18:00:00Z", false), event("reciente", "2026-11-01T18:00:00Z", false),
  ];
  const before = structuredClone(events);
  const grouped = groupCatalogEvents(events);
  assert.deepEqual(grouped.upcoming.map((value) => value.id), ["cercano", "lejano"]);
  assert.deepEqual(grouped.past.map((value) => value.id), ["reciente", "antiguo"]);
  assert.deepEqual(events, before);
});

test("la disponibilidad distingue agotado, sin tipos, pasado y al menos un tipo con cupo", () => {
  assert.equal(getEventAvailability(sample), "available");
  assert.equal(getEventAvailability({ ...sample, ticketTypes: [] }), "unavailable");
  assert.equal(getEventAvailability(event("cero", sample.date, true, [0, 0])), "soldOut");
  assert.equal(getEventAvailability(event("mixto", sample.date, true, [0, 1])), "available");
  assert.equal(getEventAvailability({ ...sample, isOpen: false }), "past");
  for (const amounts of [[], [0, 0]]) {
    const html = renderToStaticMarkup(createElement(EventCard, { event: event("sin-cupos", sample.date, true, amounts) }));
    assert.doesNotMatch(html, /Registrarme/);
    assert.match(html, /Ver detalles de Evento sin-cupos/);
  }
  const html = renderToStaticMarkup(createElement(EventCard, { event: { ...sample, description: "Texto largo ".repeat(100) } }));
  assert.match(html, /aria-label="Registrarme en Evento uno"/);
  assert.match(html, /3 cupos disponibles/);
  assert.doesNotMatch(html, /Texto largo[^<]{200}/);
});

test("la cartelera destaca la primera fecha y convierte las demás en una agenda", async () => {
  const secondEvent = event("dos", "2026-12-02T18:00:00Z");
  const mounted = mountCatalog(async () => payload([sample, secondEvent]));
  try {
    await settle();
    const html = mounted.render();
    assert.match(html, /border-y border-white\/15 py-8/);
    assert.match(html, /Más fechas para elegir/);
    assert.match(html, /sm:grid-cols-\[minmax\(9rem,0\.6fr\)_minmax\(0,1\.5fr\)_minmax\(9rem,0\.6fr\)_auto\]/);
  } finally { mounted.restore(); }
});

test("la portada enlaza los boletos y la gestión desde sus secciones de apoyo", () => {
  const Home = loadModule("src/app/page.tsx", {
    "next/link": { default: Link },
    "./events-catalog": { default: () => createElement("section", null, "Cartelera") },
    "./home-navigation": { default: () => createElement("nav", null, "Navegación") },
  }).default;
  const html = renderToStaticMarkup(createElement(Home));
  assert.match(html, /Tu entrada sigue contigo/);
  assert.match(html, /¿Tienes algo que convocar/);
  assert.match(html, /href="\/mis-boletos"/);
  assert.match(html, /href="\/organizador"/);
});

test("la navegación dirige al comprador a sus boletos y mantiene la entrada del organizador", () => {
  for (const session of [null, { user: { id: "buyer" } }]) {
    const Navigation = loadModule("src/app/home-navigation.tsx", {
      "next/link": { default: Link },
      "@/hooks/use-buyer-session": { useBuyerSession: () => ({ session, checking: false }) },
    }).default;
    const html = renderToStaticMarkup(createElement(Navigation));
    assert.match(html, /href="\/mis-boletos"/);
    assert.match(html, /href="\/organizador"/);
    assert.doesNotMatch(html, /Dashboard|href="\/dashboard"/);
    assert.match(html, session ? /Mis boletos/ : /Iniciar sesión/);
  }
});
