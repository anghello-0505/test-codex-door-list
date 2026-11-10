import assert from "node:assert/strict";
import test from "node:test";
import { groupBuyerEvents } from "../src/lib/my-tickets.ts";

const now = Date.parse("2026-11-05T18:00:00Z");
function event(id, date, status = "published", registrations = []) {
  return { id, date, status, title: id, location: "Guatemala", registrations };
}

test("el boleto pasa al historial exactamente a la hora de inicio del servidor", () => {
  const value = event("limite", "2026-11-05T12:00:00-06:00");
  assert.equal(groupBuyerEvents([value], now - 1).active.length, 1);
  const closed = groupBuyerEvents([value], now);
  assert.equal(closed.active.length, 0);
  assert.equal(closed.history.length, 1);
});

test("los borradores futuros quedan fuera de activos y los pasados permanecen en el historial", () => {
  const grouped = groupBuyerEvents([
    event("futuro", "2026-11-06T18:00:00Z", "draft"),
    event("pasado", "2026-11-04T18:00:00Z", "draft"),
  ], now);
  assert.deepEqual(grouped.active, []);
  assert.equal(grouped.unavailable[0].id, "futuro");
  assert.equal(grouped.history[0].id, "pasado");
});

test("ordena próximos por cercanía e historial por fecha reciente, comparando instantes", () => {
  const grouped = groupBuyerEvents([
    event("lejano", "2026-11-06T16:00:00Z"),
    event("cercano", "2026-11-06T11:00:00-04:00"),
    event("antiguo", "2026-11-01T18:00:00Z"),
    event("reciente", "2026-11-04T18:00:00Z"),
  ], now);
  assert.deepEqual(grouped.active.map((value) => value.id), ["cercano", "lejano"]);
  assert.deepEqual(grouped.history.map((value) => value.id), ["reciente", "antiguo"]);
});

test("conserva cada boleto y sus titulares aunque compartan correo y no modifica la consulta", () => {
  const tickets = [
    { id: "uno", holderName: "Ana", holderEmail: "titular@example.test", ticketTypeName: "General" },
    { id: "dos", holderName: "Luis", holderEmail: "titular@example.test", ticketTypeName: "VIP" },
  ];
  const values = [event("evento", "2026-11-06T18:00:00Z", "published", tickets)];
  const before = structuredClone(values);
  const grouped = groupBuyerEvents(values, now);
  assert.deepEqual(grouped.active[0].registrations, tickets);
  assert.deepEqual(values, before);
  assert.deepEqual(groupBuyerEvents([], now), { active: [], history: [], unavailable: [] });
});
