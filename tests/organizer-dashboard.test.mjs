import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module.mjs";

const eventId = "550e8400-e29b-41d4-a716-446655440000";
const ticketTypeId = "550e8400-e29b-41d4-a716-446655440001";
const entryId = (number) => `550e8400-e29b-41d4-a716-${String(number).padStart(12, "0")}`;
const event = {
  id: eventId, titulo: "Evento", descripcion: "", fecha: "2026-11-07T18:00:00Z", lugar: "Lugar",
  estado: "publicado", aforo_maximo: 100,
  tipos_entrada: [{ id: ticketTypeId, evento_id: eventId, nombre: "General", aforo_maximo: 100 }],
};
const entry = (number, values = {}) => ({
  id: entryId(number), estado: "valid",
  registration: { evento_id: eventId, nombre_titular: "Titular", correo_titular: "titular@example.test", tipo_entrada_id: ticketTypeId, created_at: "2026-11-07T06:00:00Z" },
  ...values,
});

function fixture(options = {}) {
  const calls = [];
  let batch = 0;
  const client = { from(table) {
    const call = { table, filters: [] };
    calls.push(call);
    const query = {
      select(columns, selectOptions) { call.columns = columns; call.head = selectOptions?.head; return query; },
      eq(...args) { call.filters.push(args); return query; },
      gt(...args) { call.cursor = args; return query; },
      order(...args) { (call.order ??= []).push(args); return query; },
      range(...args) { call.range = args; return query; },
      limit(value) { call.limit = value; return query; },
      abortSignal() { return query; },
      maybeSingle() { return Promise.resolve({ data: options.event === undefined ? event : options.event, error: options.eventError ?? null }); },
      then(resolve, reject) {
        if (table === "tickets") {
          const rows = (options.entries ?? []).filter((row) => row.estado === "valid" && row.registration.evento_id === eventId && (!call.cursor || row.id > call.cursor[1]));
          rows.sort((a, b) => a.id.localeCompare(b.id));
          return Promise.resolve({ data: rows.slice(0, options.serverLimit ?? call.limit), error: batch++ === options.failBatch ? { code: "failed" } : null }).then(resolve, reject);
        }
        return Promise.resolve({ data: [], count: call.head ? (options.occupied === undefined ? 63 : options.occupied) : 72, error: options.registrationError ?? null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const overrides = { "@/lib/supabase/server": {
    authenticatedBuyerClient: async () => options.signedIn === false ? null : { client, buyerId: "owner" },
    adminClient: () => { throw new Error("Privileged client must never be used"); },
  } };
  const detail = loadModule("src/app/api/organizador/eventos/[id]/route.ts", overrides);
  const csv = loadModule("src/app/api/organizador/eventos/[id]/asistentes/exportar/route.ts", overrides);
  return {
    calls,
    get: (kind = "detail", id = eventId, page = "1") => (kind === "detail" ? detail : csv).GET(
      new Request(`https://doorlist.test/api/organizador/eventos/${id}?page=${page}`), { params: Promise.resolve({ id }) }),
  };
}

test("detalle y exportación exigen sesión y propiedad antes de leer datos", async () => {
  for (const kind of ["detail", "csv"]) {
    for (const [options, expected] of [[{ signedIn: false }, 401], [{ event: null }, 404], [{ eventError: {} }, 503]]) {
      const instance = fixture(options);
      const response = await instance.get(kind);
      assert.equal(response.status, expected);
      assert.ok(instance.calls.every((call) => call.table === "events"));
      assert.ok((await response.json()).error);
      if (instance.calls.length) assert.deepEqual(instance.calls[0].filters, [["id", eventId], ["propietario_id", "owner"]]);
    }
    const invalid = fixture();
    assert.equal((await invalid.get(kind, "invalid")).status, 400);
    assert.equal(invalid.calls.length, 0);
  }
});

test("detalle conserva página y cuenta todos los registros bajo el usuario autenticado", async () => {
  const instance = fixture();
  const response = await instance.get("detail", eventId, "2");
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ticketTypes[0].registered, 63);
  assert.equal(result.ticketTypes[0].available, 37);
  assert.equal(result.ticketTypes[0].occupancyPercentage, 63);
  assert.equal(result.registrationCount, 72);
  assert.deepEqual(instance.calls[1].range, [50, 99]);
  assert.deepEqual(instance.calls[2].filters, [["evento_id", eventId], ["tipo_entrada_id", ticketTypeId]]);
  assert.ok(instance.calls.slice(1).every((call) => call.table === "registrations" && !call.filters.some(([key]) => key.includes("estado"))));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("detalle trata errores, recuentos nulos y capacidades inválidas como error, no como vacío", async () => {
  for (const options of [{ registrationError: {} }, { occupied: null }, { event: { ...event, aforo_maximo: null } }, { event: { ...event, tipos_entrada: [{ ...event.tipos_entrada[0], aforo_maximo: 0 }] } }]) {
    assert.equal((await fixture(options).get()).status, 503);
  }
  assert.equal((await fixture().get("detail", eventId, "0")).status, 400);
});

test("CSV vacío conserva exactamente los cinco encabezados y cabeceras privadas", async () => {
  const response = await fixture().get("csv");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '"Nombre del asistente","Correo electrónico","Tipo de entrada","Estado de entrada","Fecha de compra"\r\n');
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(response.headers.get("content-disposition"), /attachment; filename="asistentes-[\w-]+\.csv"/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("CSV usa titulares y estado valid, incluso para borradores pasados; excluye ajenos y no válidos", async () => {
  const instance = fixture({ event: { ...event, estado: "borrador", fecha: "2020-01-01T00:00:00Z" }, entries: [
    entry(1), entry(2), entry(3, { estado: "used" }), entry(4, { estado: "revoked" }),
    entry(5, { registration: { ...entry(5).registration, evento_id: "other-event" } }),
  ] });
  const response = await instance.get("csv");
  assert.equal(response.status, 200);
  const csv = await response.text();
  assert.equal(csv.match(/titular@example.test/g).length, 2);
  assert.match(csv, /"Titular","titular@example.test","General","Válida",/);
  assert.match(csv, /7 de noviembre de 2026/);
  for (const call of instance.calls.filter((item) => item.table === "tickets")) {
    assert.deepEqual(call.filters, [["estado", "valid"], ["registration.evento_id", eventId]]);
    assert.ok(!/codigo|comprador|clave_idempotencia/.test(call.columns));
  }
});

test("CSV recorre más de 500 entradas sin duplicar y tolera límites del servidor inferiores", async () => {
  for (const serverLimit of [500, 200]) {
    const instance = fixture({ entries: Array.from({ length: 1101 }, (_, index) => entry(index + 1)), serverLimit });
    const response = await instance.get("csv");
    assert.equal(response.status, 200);
    assert.equal((await response.text()).match(/titular@example.test/g).length, 1101);
    const batches = instance.calls.filter((call) => call.table === "tickets");
    assert.equal(batches[0].cursor, undefined);
    assert.deepEqual(batches[1].cursor, ["id", entryId(serverLimit)]);
    assert.equal(batches[0].limit, 500);
  }
});

test("CSV no devuelve datos parciales si falla un lote y rechaza estados desconocidos del mapper", async () => {
  const response = await fixture({ entries: [entry(1), entry(2)], serverLimit: 1, failBatch: 1 }).get("csv");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "registrationsUnavailable" });
  const { mapAttendeeExportEntries } = loadModule("src/lib/persistence-mappers.ts");
  assert.throws(() => mapAttendeeExportEntries([entry(1, { estado: null })], [{ id: ticketTypeId, name: "General" }]));
});
