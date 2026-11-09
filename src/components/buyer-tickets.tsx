"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BuyerEvent } from "@/lib/domain";
import { formatEventDate } from "@/lib/date";
import { mapBuyerEventsPayload } from "@/lib/persistence-mappers";
import { supabase } from "@/lib/supabase/client";
import { countValidTickets, groupBuyerEvents, type TicketCategory } from "@/lib/my-tickets";
import { ticketHref } from "@/lib/ticket-code";
import TicketStatus from "@/components/ticket-status";
import TicketEmailDelivery from "@/components/ticket-email-delivery";

type Snapshot = { buyerId: string; events: BuyerEvent[]; serverTime: number; receivedAt: number };
type Props = { buyerId: string; eventId?: string; refreshKey?: string };
const secondary = "rounded-full border border-white/25 px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-50";

function EventTickets({ event, category, buyerId, showAcquireLink = true }: { event: BuyerEvent; category: TicketCategory; buyerId: string; showAcquireLink?: boolean }) {
  return <article className="rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold">{event.title}</h3><p className="mt-2 text-sm text-white/70"><time dateTime={event.date}>{formatEventDate(event.date)}</time></p><p className="mt-1 text-sm text-white/60">{event.location}</p></div><p className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{event.registrations.length} {event.registrations.length === 1 ? "boleto" : "boletos"}</p></div>
    {category === "history" && <p className="mt-4 text-sm font-semibold text-amber-200">Evento pasado</p>}
    {event.status !== "published" && <p className="mt-4 text-sm font-semibold text-amber-200">Evento no publicado</p>}
    <ul className="mt-5 space-y-3">{event.registrations.map((registration) => <li key={registration.id} className="min-w-0 rounded-xl border border-white/10 bg-black/10 p-4">
      <p className="break-words font-bold">{registration.holderName}</p><p className="mt-1 break-all text-sm text-white/75">{registration.holderEmail}</p><p className="mt-2 text-sm text-accent">{registration.ticketTypeName}</p><p className="mt-2 break-all text-xs text-white/55">Folio: {registration.id}</p>
      {registration.ticket && <div className="mt-3"><TicketStatus status={registration.ticket.status} /></div>}
      {ticketHref(registration.ticket?.code) && <Link href={ticketHref(registration.ticket?.code)!} prefetch={false} className="mt-4 inline-block text-sm font-semibold text-accent hover:text-accent">Ver entrada y QR ↗</Link>}
      <TicketEmailDelivery registrationId={registration.id} buyerId={buyerId} available={category === "active" && registration.ticket?.status === "valid"} />
    </li>)}</ul>
    {showAcquireLink && category === "active" && <Link className={`${secondary} mt-5 inline-block`} href={`/eventos/${event.id}/registro`}>Adquirir otro boleto</Link>}
  </article>;
}

export default function BuyerTickets({ buyerId, eventId, refreshKey }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let mounted = true;
    let authorized = true;
    let generation = 0;
    const client = supabase;
    const { data: { subscription } } = client?.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      authorized = next?.user.id === buyerId;
      if (!authorized) { generation++; setSnapshot(null); setStatus("error"); }
    }) ?? { data: { subscription: null } };
    async function load() {
      const current = ++generation;
      try {
        if (!client || !authorized) throw new Error("session");
        const { data, error } = await client.rpc("mis_boletos", { p_evento_id: eventId ?? null });
        if (!mounted || current !== generation || !authorized) return;
        if (error || !data) throw new Error("query");
        const mapped = mapBuyerEventsPayload(data);
        if (mapped.buyerId !== buyerId) throw new Error("buyer");
        setSnapshot({ buyerId, events: mapped.events, serverTime: new Date(mapped.serverTime).getTime(), receivedAt: performance.now() });
        setElapsed(0); setStatus("ready");
      } catch { if (mounted && current === generation) { setSnapshot(null); setStatus("error"); } }
    }
    const refresh = () => { void load(); };
    const initial = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { mounted = false; generation++; subscription?.unsubscribe(); window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [buyerId, eventId, refreshKey, retry]);

  useEffect(() => {
    if (!snapshot) return;
    const timer = window.setInterval(() => setElapsed(performance.now() - snapshot.receivedAt), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot]);

  if (status === "loading" || (snapshot && snapshot.buyerId !== buyerId)) return <p role="status" className="mt-6 text-white/70">Cargando tus boletos…</p>;
  if (status === "error" || !snapshot) return <div role="alert" className="mt-6 space-y-3 rounded-xl border border-red-400/30 p-5"><p>No pudimos actualizar tus boletos. Si acabas de confirmar uno, tu confirmación sigue siendo válida.</p><button className={secondary} onClick={() => { setStatus("loading"); setRetry((value) => value + 1); }}>Reintentar consulta</button></div>;

  const groups = groupBuyerEvents(snapshot.events, snapshot.serverTime + elapsed);
  const categories = ["active", "history", "unavailable"] as const;
  if (eventId) return <section aria-labelledby="tus-boletos-evento" className="mt-8 border-t border-white/15 pt-8"><h2 id="tus-boletos-evento" className="text-2xl font-bold">Tus boletos para este evento</h2><p className="mt-3 text-white/70">Total adquirido: <strong className="text-accent">{snapshot.events.reduce((sum, event) => sum + event.registrations.length, 0)}</strong></p>{snapshot.events.length === 0 ? <p className="mt-4 text-white/60">Todavía no has adquirido boletos para este evento.</p> : <div className="mt-5 space-y-5">{categories.flatMap((category) => groups[category].map((event) => <EventTickets key={event.id} buyerId={buyerId} event={event} category={category} showAcquireLink={false} />))}</div>}</section>;

  return <div className="mt-8 space-y-10"><p className="rounded-xl border border-accent/30 bg-accent/10 p-5 text-lg">Boletos activos: <strong className="text-accent">{countValidTickets(groups.active)}</strong></p>{categories.map((category) => {
    const title = { active: "Activos", history: "Historial", unavailable: "No disponibles" }[category];
    if (category === "unavailable" && groups[category].length === 0) return null;
    return <section key={category} aria-labelledby={`boletos-${category}`}><h2 id={`boletos-${category}`} className="text-2xl font-bold">{title}</h2>{groups[category].length === 0 ? <p className="mt-4 text-white/60">{category === "active" ? "Aún no tienes boletos activos." : "No tienes historial."}</p> : <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">{groups[category].map((event) => <EventTickets key={event.id} buyerId={buyerId} event={event} category={category} />)}</div>}</section>;
  })}</div>;
}
