import type { TicketStatus } from "@/lib/domain";

export type AccessEmailSearchRequest = { eventId: string; email: string };
export type AccessEmailMatch = { ticketId: string; holderName: string; ticketTypeName: string; status: TicketStatus; code: string };
export type AccessEmailSearchResponse = { tickets: AccessEmailMatch[]; truncated: boolean };

export function normalizeAccessEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
