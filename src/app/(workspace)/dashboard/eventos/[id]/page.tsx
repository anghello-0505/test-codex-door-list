"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { Suspense, use, useEffect, useState } from "react";
import { formatEventDate } from "@/lib/date";
import type { OrganizerEventDetailResponse } from "@/lib/domain";
import { supabase } from "@/lib/supabase/client";
import RegistrationChart from "./registration-chart";
import ExportAttendeesButton from "./export-attendees-button";

export default function OrganizerEventPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<p className="p-8 text-white/70">Cargando evento…</p>}><OrganizerEventDetail params={params} /></Suspense>;
}

function OrganizerEventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<OrganizerEventDetailResponse | null>(null);
  const [status, setStatus] = useState<"checking" | "loading" | "ready" | "missing" | "error">("checking");

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const controller = new AbortController();
    let active = true;
    let requestId = 0;

    async function load(nextSession: Session | null) {
      if (!active) return;
      const currentRequest = ++requestId;
      setSession(nextSession);
      setDetail(null);
      if (!nextSession) { setStatus("ready"); return; }
      setStatus("loading");
      try {
        const response = await fetch(`/api/organizador/eventos/${encodeURIComponent(id)}?page=${page}`, {
          headers: { Authorization: `Bearer ${nextSession.access_token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!active || currentRequest !== requestId) return;
        if (!response.ok) { setStatus(response.status === 404 ? "missing" : "error"); return; }
        const result = await response.json() as OrganizerEventDetailResponse;
        if (!active || currentRequest !== requestId) return;
        setDetail(result);
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
    return () => { active = false; requestId++; controller.abort(); subscription.unsubscribe(); window.removeEventListener("focus", refresh); };
  }, [id, page, retry]);

  const hasAttendees = status === "ready" && detail !== null && detail.registrationCount > 0;
  const totalPages = detail ? Math.max(1, Math.ceil(detail.registrationCount / detail.pageSize)) : 1;
  const totalRegistered = detail?.ticketTypes.reduce((sum, ticketType) => sum + ticketType.registered, 0) ?? 0;

  return <div className="mx-auto min-h-screen max-w-6xl px-5 pb-16 sm:px-10">
    <main className="pt-12">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Panel del organizador</p>
      {!supabase && <p role="alert" className="mt-8 text-white/70">Configura las variables públicas de Supabase para acceder al panel.</p>}
      {supabase && status === "checking" && <p role="status" className="mt-8 text-white/70">Comprobando sesión…</p>}
      {supabase && status !== "checking" && !session && <div className="mt-8 rounded-2xl border border-white/15 p-6"><p>Inicia sesión para ver este evento.</p><Link href="/organizador" className="mt-4 inline-block font-semibold text-accent">Iniciar sesión →</Link></div>}
      {session && status === "loading" && <section role="status" aria-label="Cargando disponibilidad" className="mt-8"><h2 className="text-2xl font-bold">Tipos de entrada</h2><p className="sr-only">Cargando disponibilidad…</p><div aria-hidden="true" className="mt-5 grid gap-4 md:grid-cols-2">{[0, 1].map((item) => <div key={item} className="space-y-5 rounded-2xl border border-white/15 bg-white/5 p-6"><div className="h-5 w-32 animate-pulse rounded bg-white/10" /><div className="h-12 animate-pulse rounded bg-white/10" /><div className="h-2 animate-pulse rounded bg-white/10" /></div>)}</div></section>}
      {session && status === "loading" && <section role="status" aria-label="Cargando asistentes" className="mt-8 overflow-hidden rounded-2xl border border-white/15 bg-white/5"><p className="sr-only">Cargando asistentes…</p><div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left"><thead><tr className="border-b border-white/15 text-xs font-bold uppercase tracking-[0.2em] text-white/70"><th className="px-4 py-4">Titular</th><th className="px-4 py-4">Correo</th><th className="px-4 py-4">Entrada y fecha</th></tr></thead><tbody>{[0, 1, 2].map((row) => <tr key={row} className="border-b border-white/15 last:border-0"><td className="px-4 py-5"><span className="block h-3 w-32 animate-pulse rounded bg-white/10" /></td><td className="px-4 py-5"><span className="block h-3 w-48 animate-pulse rounded bg-white/10" /></td><td className="px-4 py-5"><span className="block h-3 w-20 animate-pulse rounded bg-white/10" /></td></tr>)}</tbody></table></div></section>}
      {session && status === "missing" && <p role="alert" className="mt-8 rounded-2xl border border-white/15 p-6 text-white/70">El evento no existe o no tienes acceso a su panel.</p>}
      {session && status === "error" && <div role="alert" className="mt-8 rounded-2xl border border-red-400/40 bg-red-400/10 p-5 text-red-200"><p>No pudimos cargar los asistentes.</p><button type="button" className="mt-3 rounded-full border border-red-300/50 px-4 py-2 text-sm font-semibold hover:border-red-200" onClick={() => setRetry((value) => value + 1)}>Volver a intentar</button></div>}
      {session && status === "ready" && detail && <>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{detail.event.title}<span className="text-accent">.</span></h1><p className="mt-3 text-white/65"><time dateTime={detail.event.date}>{formatEventDate(detail.event.date)}</time> · {detail.event.location}</p></div>
        </div>
        <p className="mt-6 text-white/70">{totalRegistered.toLocaleString("es-GT")} registros · Aforo del evento: {detail.event.capacity.toLocaleString("es-GT")}</p>
        <section aria-labelledby="ticket-types-title" className="mt-10">
          <h2 id="ticket-types-title" className="text-2xl font-bold">Tipos de entrada</h2>
          <p className="mt-3 text-sm text-white/70">Cada registro ocupa un cupo, incluso si su entrada fue utilizada o revocada.</p>
          {detail.ticketTypes.length === 0 ? <p className="mt-4 text-white/70">Este evento aún no tiene tipos de entrada.</p> : <ul className="mt-5 grid gap-4 md:grid-cols-2">{detail.ticketTypes.map((ticketType) => <li key={ticketType.id} className="rounded-2xl border border-white/15 bg-white/5 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="break-words text-lg font-bold">{ticketType.name}</h3><p className="font-bold text-accent">{ticketType.occupancyPercentage.toLocaleString("es-GT", { maximumFractionDigits: 1 })} % de ocupación</p></div>
            <dl className="mt-5 grid grid-cols-1 gap-4 min-[400px]:grid-cols-3">
              <div><dt className="text-sm text-white/70">Capacidad total</dt><dd className="mt-1 text-xl font-bold">{ticketType.capacity.toLocaleString("es-GT")}</dd></div>
              <div><dt className="text-sm text-white/70">Ocupadas</dt><dd className="mt-1 text-xl font-bold">{ticketType.registered.toLocaleString("es-GT")}</dd></div>
              <div><dt className="text-sm text-white/70">Disponibles</dt><dd className="mt-1 text-xl font-bold text-accent">{ticketType.available.toLocaleString("es-GT")}</dd></div>
            </dl>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`Ocupación de ${ticketType.name}`} aria-valuenow={Math.min(100, ticketType.occupancyPercentage)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${ticketType.registered} de ${ticketType.capacity} cupos ocupados; ${ticketType.occupancyPercentage.toLocaleString("es-GT", { maximumFractionDigits: 1 })} %`}><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, ticketType.occupancyPercentage)}%` }} /></div>
            {ticketType.registered > ticketType.capacity && <p className="mt-4 text-sm text-red-200">La ocupación supera la capacidad configurada. Revisa los datos de este tipo de entrada.</p>}
          </li>)}</ul>}
        </section>
        <RegistrationChart eventId={id} token={session.access_token} />
        <section aria-labelledby="attendees-title" className="mt-12 border-t border-white/15 pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 id="attendees-title" className="text-2xl font-bold">Asistentes registrados</h2><p className="text-sm text-white/60">{detail.registrationCount.toLocaleString("es-GT")} en total</p></div>
          {hasAttendees && <ExportAttendeesButton key={`${id}:${session.user.id}:${session.access_token}`} eventId={id} token={session.access_token} />}
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/15 bg-white/5"><div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left"><thead><tr className="border-b border-white/15 text-xs font-bold uppercase tracking-[0.2em] text-white/70"><th scope="col" className="px-4 py-4">Titular</th><th scope="col" className="px-4 py-4">Correo</th><th scope="col" className="px-4 py-4">Entrada y fecha</th></tr></thead><tbody>{!hasAttendees ? <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-white/70">Aún no hay asistentes registrados. Aquí aparecerán el nombre y correo del titular, el tipo de entrada y la fecha de registro.</td></tr> : detail.registrations.map((registration) => <tr key={registration.id} className="border-b border-white/15 last:border-0"><td className="px-4 py-4 text-sm font-semibold">{registration.holderName}</td><td className="break-all px-4 py-4 text-sm text-white/70">{registration.holderEmail}</td><td className="px-4 py-4 text-sm text-white/70"><span className="block text-white">{registration.ticketTypeName}</span><time dateTime={registration.createdAt}>{formatEventDate(registration.createdAt)}</time></td></tr>)}</tbody></table></div></div>
          {hasAttendees && <>
            <nav aria-label="Páginas de asistentes" className="mt-5 flex items-center justify-between gap-4"><button type="button" className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span className="text-sm text-white/60">Página {page} de {totalPages}</span><button type="button" className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Siguiente</button></nav>
          </>}
        </section>
      </>}
    </main>
  </div>;
}
