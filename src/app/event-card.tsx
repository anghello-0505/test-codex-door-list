import Link from "next/link";
import type { AvailableEvent } from "@/lib/domain";
import { formatEventDate } from "@/lib/date";
import { getEventAvailability } from "@/lib/event-catalog";

type EventCardProps = { event: AvailableEvent; variant?: "featured" | "list" };

export default function EventCard({ event, variant = "featured" }: EventCardProps) {
  const availability = getEventAvailability(event);
  const canRegister = availability === "available";
  const availableCapacity = event.ticketTypes.reduce((total, ticketType) => total + Math.max(0, ticketType.available), 0);
  const description = event.description.trim().replace(/\s+/g, " ");
  const summary = description.length > 160 ? `${description.slice(0, 160).trimEnd()}…` : description;
  const availabilityText = canRegister
    ? `${availableCapacity.toLocaleString("es-GT")} ${availableCapacity === 1 ? "cupo disponible" : "cupos disponibles"}`
    : availability === "soldOut" ? "Agotado" : "Sin entradas disponibles";
  const actionLabel = canRegister ? "Registrarme" : "Ver detalles";
  const actionClassName = canRegister
    ? "inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 py-3 font-bold text-background hover:bg-accent/90"
    : "inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 px-5 py-3 font-semibold hover:border-accent hover:text-accent";

  if (variant === "list") {
    return (
      <article className="grid min-w-0 gap-4 py-6 sm:grid-cols-[minmax(9rem,0.6fr)_minmax(0,1.5fr)_minmax(9rem,0.6fr)_auto] sm:items-center sm:gap-6">
        <p className="text-sm font-semibold text-white/85"><time dateTime={event.date}>{formatEventDate(event.date)}</time></p>
        <div className="min-w-0">
          <h3 className="break-words text-xl font-bold tracking-tight">{event.title}</h3>
          <p className="mt-1 break-words text-sm text-white/70">{event.location}</p>
        </div>
        <p className={`text-sm font-semibold ${canRegister ? "text-accent" : "text-white/70"}`}>{availabilityText}</p>
        <Link href={`/eventos/${event.id}/registro`} aria-label={`${canRegister ? "Registrarme en" : "Ver detalles de"} ${event.title}`} className={actionClassName}>{actionLabel}</Link>
      </article>
    );
  }

  return (
    <article className="grid min-w-0 gap-6 border-y border-white/15 py-8 sm:grid-cols-[minmax(9rem,0.55fr)_minmax(0,1.5fr)_auto] sm:items-end sm:gap-8">
      <div className="border-l border-accent pl-4 sm:border-l-0 sm:border-t sm:border-white/15 sm:pt-4 sm:pl-0">
        <p className="text-sm font-semibold text-accent"><time dateTime={event.date}>{formatEventDate(event.date)}</time></p>
        <p className="mt-2 break-words text-sm text-white/70">{event.location}</p>
      </div>
      <div className="min-w-0">
        <h3 className="break-words text-3xl font-extrabold tracking-tight sm:text-4xl">{event.title}</h3>
        {summary && <p className="mt-4 max-w-prose break-words leading-relaxed text-white/75">{summary}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:flex-col sm:items-stretch">
        <p className={`text-sm font-semibold ${canRegister ? "text-accent" : "text-white/70"}`}>{availabilityText}</p>
        <Link href={`/eventos/${event.id}/registro`} aria-label={`${canRegister ? "Registrarme en" : "Ver detalles de"} ${event.title}`} className={actionClassName}>{actionLabel}</Link>
      </div>
    </article>
  );
}
