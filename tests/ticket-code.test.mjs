import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import { isTicketCode, ticketHref, ticketStatusLabels } from "../src/lib/ticket-code.ts";
import { ticketQr } from "../src/lib/ticket-qr.ts";
import { countValidTickets, groupBuyerEvents } from "../src/lib/my-tickets.ts";

const code = "a1b2c3d4".repeat(8);

test("solo el código completo permite construir enlaces públicos", () => {
  assert.equal(isTicketCode(code), true);
  assert.equal(ticketHref(code), `/entradas/${code}`);
  for (const invalid of [null, undefined, 1, "1", "550e8400-e29b-41d4-a716-446655440000", code.slice(1), `${code}0`, code.toUpperCase(), ` ${code}`, "../mis-boletos", "javascript:alert(1)"]) {
    assert.equal(isTicketCode(invalid), false);
    assert.equal(ticketHref(invalid), null);
  }
});

test("el QR SVG conserva todos los módulos del codificador y su margen de lectura", () => {
  const encoded = QRCode.create(code, { errorCorrectionLevel: "M" });
  const rendered = ticketQr(code);
  assert.equal(rendered.size, encoded.modules.size + 8);
  // Rasterize the actual SVG path into a matrix and compare it to the encoder.
  const pixels = Array.from({ length: rendered.size }, () => Array(rendered.size).fill(false));
  const segments = [...rendered.path.matchAll(/M(\d+) (\d+)h(\d+)v1H(\d+)z/g)];
  assert.ok(segments.length > 0);
  assert.equal(segments.map((segment) => segment[0]).join(""), rendered.path);
  for (const [, x, y, length, end] of segments) {
    assert.equal(Number(x), Number(end));
    for (let i = Number(x); i < Number(x) + Number(length); i++) pixels[Number(y)][i] = true;
  }
  for (let y = 0; y < rendered.size; y++) {
    for (let x = 0; x < rendered.size; x++) {
      const inside = x >= 4 && y >= 4 && x < rendered.size - 4 && y < rendered.size - 4;
      assert.equal(pixels[y][x], inside ? !!encoded.modules.get(y - 4, x - 4) : false);
    }
  }
  assert.throws(() => ticketQr("folio-123"), /inválido/);
});

test("el contador activo excluye entradas usadas, revocadas y eventos pasados o no publicados", () => {
  const values = [
    { id: "futuro", date: "2026-11-06T18:00:00Z", status: "published", registrations: [
      { ticket: { status: "valid" } }, { ticket: { status: "used" } }, { ticket: { status: "revoked" } },
    ] },
    { id: "pasado", date: "2026-11-04T18:00:00Z", status: "published", registrations: [{ ticket: { status: "valid" } }] },
    { id: "borrador", date: "2026-11-06T18:00:00Z", status: "draft", registrations: [{ ticket: { status: "valid" } }] },
  ];
  assert.equal(countValidTickets(groupBuyerEvents(values, Date.parse("2026-11-05T18:00:00Z")).active), 1);
  assert.deepEqual(Object.keys(ticketStatusLabels).sort(), ["revoked", "used", "valid"]);
});
