"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEventDate } from "@/lib/date";
import type { OrganizerEvent } from "@/lib/domain";
import { mapOrganizerEvents } from "@/lib/persistence-mappers";
import { supabase } from "@/lib/supabase/client";

export default function DashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [status, setStatus] = useState<"checking" | "loading" | "ready" | "error">("checking");

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    let requestId = 0;

    async function load(nextSession: Session | null) {
      if (!active) return;
      const currentRequest = ++requestId;
      setSession(nextSession);
      setEvents([]);
      if (!nextSession) { setStatus("ready"); return; }
      setStatus("loading");
      try {
        const { data, error } = await client.from("events")
          .select("id,titulo,descripcion,fecha,lugar,estado,aforo_maximo,tipos_entrada:ticket_types(id,evento_id,nombre,aforo_maximo)")
          .eq("propietario_id", nextSession.user.id).order("fecha", { ascending: false });
        if (!active || currentRequest !== requestId) return;
        if (error) { setStatus("error"); return; }
        setEvents(mapOrganizerEvents(data));
        setStatus("ready");
      } catch {
        if (active && currentRequest === requestId) setStatus("error");
      }
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      void load(nextSession);
    });
    const refresh = () => { void client.auth.getSession().then(({ data }) => load(data.session)); };
    window.addEventListener("focus", refresh);
    return () => { active = false; requestId++; subscription.unsubscribe(); window.removeEventListener("focus", refresh); };
  }, []);

  return <div className="mx-auto min-h-screen max-w-6xl px-5 pb-16 sm:px-10">
    <main className="pt-12">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Panel del organizador</p>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Mis eventos<span className="text-accent">.</span></h1>
      {!supabase && <p role="alert" className="mt-8 text-white/70">Configura las variables públicas de Supabase para acceder al panel.</p>}
      {supabase && status === "checking" && <p role="status" className="mt-8 text-white/70">Comprobando sesión…</p>}
      {supabase && status !== "checking" && !session && <div className="mt-8 rounded-2xl border border-white/15 p-6"><p className="text-white/70">Inicia sesión para ver tus eventos.</p><Link href="/organizador" className="mt-4 inline-block rounded-full bg-accent px-5 py-3 font-bold text-[#171321]">Iniciar sesión</Link></div>}
      {session && status === "loading" && <p role="status" className="mt-8 text-white/70">Cargando eventos…</p>}
      {session && status === "error" && <p role="alert" className="mt-8 rounded-2xl border border-red-400/40 bg-red-400/10 p-5 text-red-200">No pudimos cargar tus eventos. Vuelve a intentarlo.</p>}
      {session && status === "ready" && events.length === 0 && <div className="mt-8 rounded-2xl border border-white/15 p-6"><p className="text-white/70">Aún no tienes eventos.</p><Link href="/organizador" className="mt-4 inline-block font-semibold text-accent hover:text-accent">Crear un evento →</Link></div>}
      {session && status === "ready" && events.length > 0 && <ul className="mt-8 grid gap-5 md:grid-cols-2">{events.map((event) => <li key={event.id} className="rounded-2xl border border-white/15 bg-white/5 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-accent">{event.status === "published" ? "Publicado" : "Borrador"}</p>
        <h2 className="mt-2 text-2xl font-bold">{event.title}</h2>
        <p className="mt-2 text-sm text-white/65"><time dateTime={event.date}>{formatEventDate(event.date)}</time> · {event.location}</p>
        <p className="mt-4 text-sm text-white/65">{event.ticketTypes.length} {event.ticketTypes.length === 1 ? "tipo de entrada" : "tipos de entrada"} · Aforo {event.capacity.toLocaleString("es-GT")}</p>
        <Link href={`/dashboard/eventos/${event.id}`} className="mt-5 inline-block rounded-full border border-accent px-5 py-2 text-sm font-bold text-accent hover:bg-accent hover:text-[#171321]">Ver evento y asistentes →</Link>
      </li>)}</ul>}
    </main>
  </div>;
}
