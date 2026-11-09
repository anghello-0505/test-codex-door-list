import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildTicketMessage, escapeHtml, ticketDate, wrapPdfText } from "../src/lib/ticket-email.ts";
import { sendWithResend } from "../src/lib/resend-delivery.ts";

const ticket = { code: "abcdef12".repeat(8), holderName: "María López", holderEmail: "titular@example.com", ticketTypeName: "General", eventTitle: "Música <en vivo>", eventDate: "2026-12-01T02:00:00Z", eventLocation: "Salón & Teatro" };

test("correo autocontenido con QR CID y PDF real, escapando datos del evento", async () => {
  const message = await buildTicketMessage(ticket, "comprador@example.com", "Doorlist <test@example.com>");
  assert.deepEqual(message.to, ["comprador@example.com"]);
  assert.match(message.html, /src="cid:ticket-qr"/);
  assert.match(message.html, /Música &lt;en vivo&gt;/);
  assert.match(message.html, /Salón &amp; Teatro/);
  assert.doesNotMatch(message.html, /https?:\/\//);
  assert.ok(message.text.includes(ticket.code));
  assert.equal(message.attachments[0].content_id, "ticket-qr");
  const png = Buffer.from(message.attachments[0].content, "base64");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const pdf = await PDFDocument.load(Buffer.from(message.attachments[1].content, "base64"));
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), "Entrada Doorlist");
  assert.ok(pdf.getPages()[0].node.Resources().has((await import("pdf-lib")).PDFName.of("XObject")));
});

test("texto largo se conserva en páginas adicionales sin truncar el QR", async () => {
  const message = await buildTicketMessage({ ...ticket, holderName: "Á".repeat(200), eventTitle: "Evento largo ".repeat(100), eventLocation: "Dirección ".repeat(200) }, ticket.holderEmail, "test@example.com");
  const pdf = await PDFDocument.load(Buffer.from(message.attachments[1].content, "base64"));
  assert.ok(pdf.getPageCount() > 1);
  const lines = wrapPdfText("abcdefghijkl", { widthOfTextAtSize: (s) => s.length }, 1, 4);
  assert.equal(lines.join(""), "abcdefghijkl");
  assert.ok(lines.every((s) => s.length <= 4));
  assert.equal(escapeHtml('<script>"&\''), "&lt;script&gt;&quot;&amp;&#39;");
  assert.match(ticketDate(ticket.eventDate), /30 de noviembre de 2026/);
  assert.match(ticketDate(ticket.eventDate), /Guatemala/);
});

test("Resend usa el mismo payload y clave idempotente al reintentar", async () => {
  const calls = [];
  const request = async (url, options) => { calls.push({ url, options }); return Response.json({ id: "provider-id" }); };
  const message = { to: [ticket.holderEmail], html: "test" };
  assert.deepEqual(await sendWithResend(message, "task-uuid", "fake-key", request), { status: "accepted", uncertain: false, resendId: "provider-id" });
  await sendWithResend(message, "task-uuid", "fake-key", request);
  assert.equal(calls[0].options.headers["Idempotency-Key"], "ticket-email/task-uuid");
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
});

test("errores y timeouts no se confunden con envío aceptado", async () => {
  for (const [status, uncertain, resultStatus] of [[422, false, "failed"], [429, false, "failed"], [500, true, "failed"], [409, true, "review"]]) {
    const result = await sendWithResend({}, "task", "key", async () => new Response("private error", { status }));
    assert.deepEqual(result, { status: resultStatus, uncertain });
    assert.ok(!JSON.stringify(result).includes("private error"));
  }
  assert.deepEqual(await sendWithResend({}, "task", "key", async () => { throw new Error("timeout"); }), { status: "failed", uncertain: true });
  await assert.rejects(buildTicketMessage({ ...ticket, code: "invalid" }, ticket.holderEmail, "test@example.com"));
});
