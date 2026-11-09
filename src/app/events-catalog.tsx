"use client";

import { useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { eventCatalogReducer, groupCatalogEvents, initialEventCatalogState } from "@/lib/event-catalog";
import { formatEventDate } from "@/lib/date";
import { mapAvailableEventsPayload } from "@/lib/persistence-mappers";
import { supabase } from "@/lib/supabase/client";
import EventCard from "./event-card";

export default function EventsCatalog() {
  const [state, dispatch] = useReducer(eventCatalogReducer, initialEventCatalogState);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    async function loadEvents() {
      if (inFlight) return;
      inFlight = true;
      dispatch({ type: "loading" });
      try {
        if (!supabase) throw new Error("unavailable");
        const { data, error } = await supabase.rpc("eventos_disponibles");
        if (error || !data) throw new Error("unavailable");
        if (active) dispatch({ type: "loaded", events: mapAvailableEventsPayload(data).events });
      } catch {
        if (active) dispatch({ type: "failed" });
      } finally {
        inFlight = false;
      }
    }
    void loadEvents();
    const refresh = () => { void loadEvents(); };
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.clearInterval(interval);
    };
  }, [requestVersion]);

  const { upcoming, past } = groupCatalogEvents(state.events ?? []);
  const [featuredEvent, ...remainingEvents] = upcoming;
  const retryButton = (
    <button type="button" disabled={state.refreshing} onClick={() => setRequestVersion((version) => version + 1)} className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${state.events === null && state.error ? "bg-accent text-background hover:bg-accent/90" : "border border-white/25 text-foreground hover:border-accent hover:text-accent"}`}>
      {state.refreshing ? "Actualizando…" : state.error ? "Reintentar" : "Actualizar lista"}
    </button>
  );

  return (
    <div className="mt-8">
      {state.error && (
        <div className={`mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${state.events === null ? "border-red-400/40 bg-red-400/10" : "border-white/15 bg-white/5"}`}>
          <p role={state.events === null ? "alert" : "status"} className={`max-w-prose text-sm leading-relaxed ${state.events === null ? "text-red-200" : "text-white/80"}`}>
            {state.events === null
              ? "No pudimos cargar los eventos. Reintenta para consultar el catálogo."
              : "No pudimos actualizar los eventos. Conservamos la última consulta; la disponibilidad puede haber cambiado."}
          </p>
          {retryButton}
        </div>
      )}
      {state.events === null && state.refreshing && <p role="status" className="py-6 text-white/70">Cargando eventos…</p>}
      {state.events !== null && (
        <>
          <section aria-labelledby="upcoming-events-title">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 id="upcoming-events-title" className="text-2xl font-bold">Próximos eventos</h2>
              {retryButton}
            </div>
            {state.refreshing && <p role="status" aria-live="polite" className="mt-2 text-sm text-white/70">Actualizando la lista de eventos…</p>}
            {upcoming.length > 0 ? (
              <>
                <p className="mt-2 max-w-prose text-sm text-white/70">Elige un evento para ver sus tipos de entrada. La disponibilidad se confirma al registrar cada boleto.</p>
                <div className="mt-6"><EventCard event={featuredEvent} /></div>
                {remainingEvents.length > 0 && (
                  <section aria-labelledby="more-events-title" className="mt-10">
                    <h3 id="more-events-title" className="text-lg font-bold">Más fechas para elegir</h3>
                    <ol className="mt-2 divide-y divide-white/15">{remainingEvents.map((event) => <li key={event.id}><EventCard event={event} variant="list" /></li>)}</ol>
                  </section>
                )}
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/15 p-6">
                <p className="text-white/80">{past.length > 0 ? "Por ahora no hay próximos eventos publicados. Puedes consultar los eventos pasados abajo." : "Por ahora no hay eventos publicados."}</p>
                <p className="mt-2 text-sm text-white/70">Puedes actualizar la lista o consultar los boletos que ya registraste.</p>
                <Link href="/mis-boletos" className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent hover:underline">Ver mis boletos</Link>
              </div>
            )}
          </section>
          {past.length > 0 && (
            <details className="mt-10 border-t border-white/15 pt-4">
              <summary className="min-h-11 cursor-pointer py-3 font-semibold">Eventos pasados ({past.length.toLocaleString("es-GT")})</summary>
              <ul className="mt-2 divide-y divide-white/15">
                {past.map((event) => (
                  <li key={event.id} className="min-w-0 py-5">
                    <h3 className="break-words text-lg font-bold">{event.title}</h3>
                    <p className="mt-2 text-sm text-white/70"><time dateTime={event.date}>{formatEventDate(event.date)}</time></p>
                    <p className="mt-1 break-words text-sm text-white/70">{event.location}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
