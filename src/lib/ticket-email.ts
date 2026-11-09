import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";
import { isTicketCode } from "./ticket-code.ts";
import { formatEventDate } from "./date.ts";
import type { TicketEmailData } from "./domain";

export type EmailMessage = { from: string; to: string[]; subject: string; html: string; text: string; attachments: { filename: string; content: string; content_type: string; content_id?: string }[] };

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export function ticketDate(value: string) {
  return `${formatEventDate(value)} (Guatemala, UTC-6)`;
}

// Wrap even uninterrupted words, and paginate instead of truncating holder data.
export function wrapPdfText(text: string, font: Pick<PDFFont, "widthOfTextAtSize">, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const char of text.replace(/[\r\n\t]/g, " ")) {
    if (line && font.widthOfTextAtSize(line + char, size) > width) { lines.push(line.trimEnd()); line = ""; }
    line += char;
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

export async function buildTicketMessage(ticket: TicketEmailData, recipient: string, from: string): Promise<EmailMessage> {
  if (!isTicketCode(ticket.code)) throw new Error("Invalid ticket");
  const png = await QRCode.toBuffer(ticket.code, { type: "png", width: 640, margin: 4, errorCorrectionLevel: "M" });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const qr = await pdf.embedPng(png);
  let page = pdf.addPage([420, 650]);
  let y = 600;
  const ink = rgb(0.09, 0.07, 0.13);
  const heading = () => {
    page.drawRectangle({ x: 0, y: 610, width: 420, height: 40, color: ink });
    page.drawText("doorlist.  /  TU ENTRADA", { x: 28, y: 624, size: 14, font, color: rgb(0.78, 0.95, 0.4) });
  };
  heading();
  const draw = (value: string, size = 12) => {
    for (const line of wrapPdfText(value, font, size, 364)) {
      if (y < 35) { page = pdf.addPage([420, 650]); y = 590; heading(); }
      page.drawText(line, { x: 28, y, size, font, color: ink }); y -= size + 6;
    }
    y -= 8;
  };
  y = 580;
  draw(ticket.eventTitle, 22);
  draw(ticketDate(ticket.eventDate));
  draw(`Lugar: ${ticket.eventLocation}`);
  draw(`Titular: ${ticket.holderName}`);
  draw(`Correo: ${ticket.holderEmail}`);
  draw(`Entrada: ${ticket.ticketTypeName}`);
  if (y < 275) { page = pdf.addPage([420, 650]); heading(); y = 580; }
  page.drawImage(qr, { x: 110, y: y - 200, width: 200, height: 200 }); y -= 220;
  draw(ticket.code, 9);
  draw("Presenta este QR en el acceso. La validez se comprueba contra el estado actual de la entrada. No compartas tu código.", 10);
  pdf.setTitle("Entrada Doorlist");
  pdf.setCreationDate(new Date(0)); pdf.setModificationDate(new Date(0));
  const pdfBytes = await pdf.save();
  const safe = Object.fromEntries(Object.entries(ticket).map(([key, value]) => [key, escapeHtml(value)])) as TicketEmailData;
  const date = escapeHtml(ticketDate(ticket.eventDate));
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f3f1f7;font-family:Arial,sans-serif;color:#211b2e"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" style="max-width:600px;background:white;border-radius:20px;overflow:hidden" cellspacing="0" cellpadding="0"><tr><td style="background:#211b2e;color:#c8f568;padding:28px;font-size:28px;font-weight:bold">doorlist.</td></tr><tr><td style="padding:28px"><p style="color:#665779;font-size:12px;letter-spacing:2px">TU ENTRADA ESTÁ CONFIRMADA</p><h1 style="font-size:30px;line-height:1.2;overflow-wrap:anywhere">${safe.eventTitle}</h1><p><strong>Fecha:</strong> ${date}</p><p><strong>Lugar:</strong> ${safe.eventLocation}</p><hr style="border:0;border-top:1px solid #e7e2ee;margin:24px 0"><p><strong>Titular:</strong> ${safe.holderName}</p><p><strong>Correo:</strong> ${safe.holderEmail}</p><p><strong>Tipo de entrada:</strong> ${safe.ticketTypeName}</p><p style="text-align:center"><img src="cid:ticket-qr" width="260" height="260" alt="QR de tu entrada; también está incluido en el PDF adjunto" style="display:inline-block;max-width:100%;height:auto"></p><p style="font-size:11px;word-break:break-all;text-align:center">${safe.code}</p><p style="background:#eff9d9;padding:16px;border-radius:12px">Presenta este QR o el PDF adjunto en el acceso.</p><p style="font-size:12px;color:#665779">La validez se comprobará al ingresar. Conserva tu código en privado. Si tu aplicación oculta la imagen, encontrarás el mismo QR en el PDF adjunto.</p></td></tr></table></td></tr></table></body></html>`;
  return {
    from, to: [recipient], subject: `Tu entrada para ${ticket.eventTitle.replace(/[\r\n]/g, " ").slice(0, 160)}`,
    html, text: `Tu entrada está confirmada\n${ticket.eventTitle}\nFecha: ${ticketDate(ticket.eventDate)}\nLugar: ${ticket.eventLocation}\nTitular: ${ticket.holderName}\nCorreo: ${ticket.holderEmail}\nEntrada: ${ticket.ticketTypeName}\nCódigo: ${ticket.code}\nEl QR está en el PDF adjunto. Conserva tu código en privado. Su validez se comprueba al ingresar.`,
    attachments: [
      { filename: "qr-entrada.png", content: png.toString("base64"), content_type: "image/png", content_id: "ticket-qr" },
      { filename: "entrada-doorlist.pdf", content: Buffer.from(pdfBytes).toString("base64"), content_type: "application/pdf" },
    ],
  };
}
