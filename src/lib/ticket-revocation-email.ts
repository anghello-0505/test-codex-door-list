import type { TicketRevocationEmailData } from "./ticket-revocation";
import { escapeHtml as escape, type EmailMessage } from "./ticket-email";

export function buildRevocationMessage(data: TicketRevocationEmailData, from: string): EmailMessage {
  return {
    from, to: [data.holderEmail], subject: `Entrada revocada: ${data.eventTitle.replace(/[\r\n]/g, " ").slice(0, 160)}`,
    html: `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#211b2e"><h1>Tu entrada fue revocada</h1><p>Hola, ${escape(data.holderName)}.</p><p>La organización de <strong>${escape(data.eventTitle)}</strong> revocó tu entrada. Ya no permite ingresar al evento.</p><h2>Motivo de la revocación</h2><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(data.reason)}</p><p>Si necesitas aclaraciones, comunícate con la organización del evento.</p><p>Doorlist</p></body></html>`,
    text: `Tu entrada fue revocada\nHola, ${data.holderName}.\nLa organización de ${data.eventTitle} revocó tu entrada. Ya no permite ingresar al evento.\n\nMotivo de la revocación:\n${data.reason}\n\nSi necesitas aclaraciones, comunícate con la organización del evento.\nDoorlist`,
    attachments: [],
  };
}
