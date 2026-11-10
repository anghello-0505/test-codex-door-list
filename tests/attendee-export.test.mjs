import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

const { buildCsv, downloadCsv } = loadModule("src/lib/csv.ts");
const { ticketAvailability } = loadModule("src/lib/ticket-availability.ts");

test("CSV conserva BOM, Unicode, comas, comillas, saltos de línea y nulos", () => {
  assert.equal(buildCsv([['José, "Ana"\nLópez', "correo@example.test", null, undefined]]), '\uFEFF"José, ""Ana""\nLópez","correo@example.test","",""\r\n');
});

test("CSV neutraliza fórmulas y sus prefijos sin confundir texto normal", () => {
  for (const value of ["=1+1", "+SUM(1)", "-2", "@función", "  =1", "\t=1", "\n=1", "\u0000+1", "\tTexto"]) {
    assert.ok(buildCsv([[value]]).startsWith('\uFEFF"\''), JSON.stringify(value));
  }
  assert.equal(buildCsv([["Ana", "ana+tag@example.test"]]), '\uFEFF"Ana","ana+tag@example.test"\r\n');
});

test("disponibilidad conserva cupos y porcentaje reales, con exceso limitado solo en disponibles", () => {
  assert.deepEqual(ticketAvailability(10, 0), { registered: 0, available: 10, occupancyPercentage: 0 });
  assert.deepEqual(ticketAvailability(10, 4), { registered: 4, available: 6, occupancyPercentage: 40 });
  assert.deepEqual(ticketAvailability(10, 10), { registered: 10, available: 0, occupancyPercentage: 100 });
  assert.deepEqual(ticketAvailability(10, 12), { registered: 12, available: 0, occupancyPercentage: 120 });
  for (const capacity of [0, null, -1, NaN, Infinity]) assert.throws(() => ticketAvailability(capacity, 0));
  for (const occupied of [null, -1, NaN, 1.5]) assert.throws(() => ticketAvailability(10, occupied));
});

test("descarga elimina el enlace y libera su URL temporal", () => {
  const originalDocument = globalThis.document;
  const originalTimeout = globalThis.setTimeout;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let clicked = false;
  let removed = false;
  let revoked = null;
  const anchor = { click() { clicked = true; }, remove() { removed = true; } };
  try {
    globalThis.document = { createElement: () => anchor, body: { append: () => {} } };
    globalThis.setTimeout = (callback) => callback();
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = (url) => { revoked = url; };
    downloadCsv(new Blob(["csv"]), "asistentes.csv");
    assert.equal(anchor.download, "asistentes.csv");
    assert.equal(anchor.href, "blob:test");
    assert.ok(clicked && removed);
    assert.equal(revoked, "blob:test");
  } finally {
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalTimeout;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
