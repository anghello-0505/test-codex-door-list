"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBuyerSession } from "@/hooks/use-buyer-session";
import { accessField, accessMessage, accessSecondary } from "@/lib/access-control";
import { formatEventDate } from "@/lib/date";
import type { ValidationHistoryEntry, ValidationHistoryResponse, ValidationHistoryEvent } from "@/lib/domain";
import AccountForm from "@/components/account-form";
import type { Session } from "@supabase/supabase-js";

export default function ValidationHistory() {
  const { session, checking } = useBuyerSession();
  if (checking) return <p role="status" className="mt-8">Comprobando sesión…</p>;
  if (!session) return <section className="mt-8"><AccountForm returnTo="/organizador/validaciones" /></section>;
  return <HistoryContent key={session.user.id} session={session} />;
}

function HistoryContent({ session }: { session: Session }) {
  const params = useSearchParams();
  const [eventId, setEventId] = useState(params.get("eventId") ?? "");
  const [outcome, setOutcome] = useState(""); const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]); const [next, setNext] = useState<string | null>(null);
  const [rows, setRows] = useState<ValidationHistoryEntry[]>([]);
  const [events, setEvents] = useState<ValidationHistoryEvent[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading"); const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState("loading");
      const query = new URLSearchParams();
      if (eventId.trim()) query.set("eventId", eventId.trim()); if (outcome) query.set("result", outcome); if (cursor) query.set("cursor", cursor);
      try {
        const options = { cache: "no-store" as const, signal: controller.signal, headers: { Authorization: `Bearer ${session!.access_token}` } };
        const [response, eventResponse] = await Promise.all([fetch(`/api/organizador/validaciones?${query}`, options), fetch("/api/organizador/validaciones?view=events", options)]);
        if (!response.ok || !eventResponse.ok) throw new Error("query");
        const data: ValidationHistoryResponse = await response.json();
        const eventData: { events: ValidationHistoryEvent[] } = await eventResponse.json();
        if (!controller.signal.aborted) { setRows(data.entries); setEvents(eventData.events); setNext(data.nextCursor); setState("ready"); }
      } catch { if (!controller.signal.aborted) setState("error"); }
    }
    void load(); return () => controller.abort();
  }, [session, eventId, outcome, cursor, refresh]);
  return <section className="mt-8">
    <div className="grid gap-4 sm:grid-cols-2"><label className="block font-semibold">Evento<select className={accessField} value={eventId} onChange={(event) => { setEventId(event.target.value); setCursor(null); setPrevious([]); }}><option value="">Todos tus eventos</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}{event.deleted ? " (eliminado)" : ""}</option>)}</select></label><label className="block font-semibold">Resultado<select className={accessField} value={outcome} onChange={(event) => { setOutcome(event.target.value); setCursor(null); setPrevious([]); }}><option value="">Todos</option><option value="accepted">Ingresos autorizados</option><option value="rejected">Intentos rechazados</option></select></label></div>
    {eventId && <button className={`${accessSecondary} mt-4`} onClick={() => { setEventId(""); setCursor(null); setPrevious([]); }}>Ver todos los eventos</button>}
    {state === "error" && <div role="alert" className="mt-5 text-red-200"><p>No pudimos consultar el historial. Revisa el identificador del evento o vuelve a intentar.</p><button className={`${accessSecondary} mt-3`} onClick={() => setRefresh((value) => value + 1)}>Volver a intentar</button></div>}
    <div className="mt-6 overflow-hidden rounded-2xl border border-white/15 bg-white/5" aria-busy={state === "loading"}>
      {state === "loading" && <p role="status" className="sr-only">Cargando historial…</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left"><thead><tr className="border-b border-white/15 text-xs font-bold uppercase tracking-[0.2em] text-white/70">{["Evento", "Responsable", "Resultado", "Momento y método"].map((title) => <th key={title} scope="col" className="p-4">{title}</th>)}</tr></thead><tbody>
        {state === "loading" ? [0, 1, 2].map((row) => <tr key={row}>{[0, 1, 2, 3].map((column) => <td className="p-4" key={column}><span aria-hidden="true" className="block h-3 w-28 animate-pulse rounded bg-white/10 motion-reduce:animate-none" /></td>)}</tr>) : state === "error" ? <tr><td colSpan={4} className="p-8 text-center text-white/70">El historial no está disponible.</td></tr> : !rows.length ? <tr><td colSpan={4} className="p-8 text-center text-white/70">{eventId || outcome ? "No hay validaciones que coincidan con los filtros." : "Aún no hay validaciones. Aquí aparecerán los ingresos y los intentos rechazados."}</td></tr> : rows.map((row) => <tr key={row.id} className="border-b border-white/15 text-sm last:border-0"><td className="p-4"><p className="font-bold">{row.eventTitle ?? "Evento no autorizado"}</p>{row.eventDeleted && row.eventTitle && <p className="mt-1 text-white/70">Evento eliminado</p>}<button className="mt-2 min-h-11 text-accent underline underline-offset-4" onClick={() => { setEventId(row.eventId); setCursor(null); setPrevious([]); }}>Ver este evento</button></td><td className="p-4">{row.staffName}</td><td className="max-w-xs p-4"><p className={row.result === "accepted" ? "font-bold text-accent" : "font-bold text-red-200"}>{row.result === "accepted" ? "Ingreso autorizado" : "Rechazado"}</p>{row.reason && <p className="mt-2 text-white/70">{accessMessage(row.reason)}</p>}{row.ticketReference && <p className="mt-2 break-all text-xs text-white/70">Referencia: {row.ticketReference}</p>}</td><td className="p-4"><time dateTime={row.createdAt}>{formatEventDate(row.createdAt)}</time><p className="mt-2 text-white/70">{row.source === "camera" ? "Cámara" : "Código manual"} · Guatemala</p></td></tr>)}
      </tbody></table></div>
    </div>
    <div className="mt-5 flex gap-3"><button className={accessSecondary} disabled={!previous.length || state === "loading"} onClick={() => { setCursor(previous.at(-1) ?? null); setPrevious((value) => value.slice(0, -1)); }}>Anterior</button><button className={accessSecondary} disabled={!next || state !== "ready"} onClick={() => { setPrevious((value) => [...value, cursor]); setCursor(next); }}>Siguiente</button></div>
  </section>;
}
