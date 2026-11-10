import type { BuyerEvent } from "@/lib/domain";

export type TicketCategory = "active" | "history" | "unavailable";

export function countValidTickets(events: BuyerEvent[]): number {
  return events.reduce((total, event) => total + event.registrations.filter((registration) => registration.ticket?.status === "valid").length, 0);
}

export function groupBuyerEvents(events: BuyerEvent[], now: number): Record<TicketCategory, BuyerEvent[]> {
  const groups: Record<TicketCategory, BuyerEvent[]> = { active: [], history: [], unavailable: [] };
  for (const event of events) {
    if (new Date(event.date).getTime() <= now) groups.history.push(event);
    else if (event.status !== "published") groups.unavailable.push(event);
    else groups.active.push(event);
  }
  const chronological = (a: BuyerEvent, b: BuyerEvent) => new Date(a.date).getTime() - new Date(b.date).getTime();
  groups.active.sort(chronological);
  groups.history.sort((a, b) => chronological(b, a));
  groups.unavailable.sort(chronological);
  return groups;
}
