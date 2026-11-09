import type { AvailableEvent } from "./domain.ts";

export type EventCatalogState = {
  events: AvailableEvent[] | null;
  refreshing: boolean;
  error: boolean;
};

export type EventCatalogAction =
  | { type: "loading" }
  | { type: "loaded"; events: AvailableEvent[] }
  | { type: "failed" };

export const initialEventCatalogState: EventCatalogState = { events: null, refreshing: true, error: false };

export function eventCatalogReducer(state: EventCatalogState, action: EventCatalogAction): EventCatalogState {
  switch (action.type) {
    case "loading": return { ...state, refreshing: true };
    case "loaded": return { events: action.events, refreshing: false, error: false };
    case "failed": return { ...state, refreshing: false, error: true };
  }
}

export function groupCatalogEvents(events: AvailableEvent[]) {
  return {
    upcoming: events.filter((event) => event.isOpen).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
    past: events.filter((event) => !event.isOpen).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
  };
}

export function getEventAvailability(event: AvailableEvent): "available" | "soldOut" | "unavailable" | "past" {
  if (!event.isOpen) return "past";
  if (event.ticketTypes.length === 0) return "unavailable";
  return event.ticketTypes.some((ticketType) => ticketType.available > 0) ? "available" : "soldOut";
}
