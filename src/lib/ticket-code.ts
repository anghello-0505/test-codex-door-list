import type { TicketStatus } from "@/lib/domain";

export type { TicketStatus } from "@/lib/domain";

export const ticketStatusLabels: Record<TicketStatus, string> = {
  valid: "Válida",
  used: "Usada",
  revoked: "Revocada",
};

export function isTicketCode(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function ticketHref(code: unknown): string | null {
  return isTicketCode(code) ? `/entradas/${code}` : null;
}
