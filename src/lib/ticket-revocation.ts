import type { TicketDeliveryStatus } from "./domain";

export type TicketRevocationRequest = { reason: string };
export type TicketRevocationResponse = { ticketStatus: "revoked"; reason: string; emailStatus: TicketDeliveryStatus };
export type TicketRevocationEmailData = { holderName: string; holderEmail: string; eventTitle: string; reason: string };

export function validRevocationReason(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 1000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

export function mapRevocationStatus(value: unknown): TicketDeliveryStatus {
  if (["pending", "sending", "accepted", "failed", "review"].includes(value as string)) return value as TicketDeliveryStatus;
  throw new Error("Invalid revocation status");
}
