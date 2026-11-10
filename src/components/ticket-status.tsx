import { ticketStatusLabels, type TicketStatus as Status } from "@/lib/ticket-code";

const colors: Record<Status, string> = {
  valid: "border-accent/30 bg-accent/10 text-accent",
  used: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  revoked: "border-red-300/30 bg-red-300/10 text-red-200",
};

export default function TicketStatus({ status }: { status: Status }) {
  return <span className={`inline-block rounded-full border px-3 py-1 text-sm font-bold ${colors[status]}`}>{ticketStatusLabels[status]} ({status})</span>;
}
