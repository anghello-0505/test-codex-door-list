import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import TicketStatus from "@/components/ticket-status";
import { formatEventDate } from "@/lib/date";
import { mapPublicTicket } from "@/lib/persistence-mappers";
import { isTicketCode } from "@/lib/ticket-code";
import { ticketQr } from "@/lib/ticket-qr";
import type { PublicTicket } from "@/lib/domain";
import TicketRefreshControl from "./ticket-refresh-control";

export const metadata: Metadata = {
  title: "Tu entrada | Doorlist",
  description: "Consulta tu entrada y su estado actual.",
  robots: { index: false, follow: false, noarchive: true, noimageindex: true },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ codigo: string }> };
async function Ticket({ params }: Props) {
  const { codigo } = await params;
  if (!isTicketCode(codigo)) notFound();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let ticket: PublicTicket | null = null;
  let failed = false;
  try {
    if (!url || !key) throw new Error("Configuration");
    // Always anonymous; never reuse the buyer's browser client or store a session.
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
    const { data, error } = await client.rpc("consultar_ticket", { p_codigo: codigo });
    if (error) throw new Error("Query");
    ticket = mapPublicTicket(data);
  } catch { failed = true; }
  if (failed) return <section className="space-y-5 rounded-3xl border border-white/15 bg-white/5 p-6 sm:p-9"><h1 className="text-3xl font-bold">No pudimos consultar tu entrada</h1><p role="alert" className="text-white/70">Comprueba tu conexión e inténtalo de nuevo. Esta consulta no cambia el estado de tu entrada.</p><TicketRefreshControl /></section>;
  if (!ticket) notFound();
  const qr = ticketQr(codigo);
  return <article className="rounded-3xl border border-white/15 bg-white/5 p-6 sm:p-9">
    <p className="text-xs font-bold uppercase tracking-widest text-accent">Tu entrada</p>
    <h1 className="mt-4 break-words text-3xl font-extrabold sm:text-4xl">{ticket.event.title}</h1>
    <div className="mt-5"><TicketStatus status={ticket.status} /></div>
    <p className="mt-3 text-sm text-white/70">{ticket.status === "valid" ? "La entrada no ha sido utilizada ni revocada." : ticket.status === "used" ? "Esta entrada ya fue utilizada y no permite un nuevo ingreso." : "Esta entrada fue revocada y no permite el ingreso."}</p>
    {ticket.status === "valid" ? (
      <section aria-label="Código de tu entrada" className="mt-8 border-t border-white/15 pt-7">
        <svg role="img" aria-label="Código QR de una entrada válida" aria-describedby="qr-instructions" viewBox={`0 0 ${qr.size} ${qr.size}`} width="288" height="288" shapeRendering="crispEdges" className="mx-auto h-auto w-full max-w-72 rounded-xl bg-white">
          <rect width={qr.size} height={qr.size} fill="#fff" /><path d={qr.path} fill="#000" />
        </svg>
        <p id="qr-instructions" className="mx-auto mt-4 max-w-prose text-center text-sm leading-relaxed text-white/70">Presenta este código al personal de acceso. Tu entrada sigue válida.</p>
      </section>
    ) : (
      <section aria-labelledby="ticket-resolution-title" className={`mt-6 rounded-2xl border p-6 ${ticket.status === "used" ? "border-amber-300/30 bg-amber-300/10 text-amber-200" : "border-red-300/30 bg-red-300/10 text-red-200"}`}>
        <h2 id="ticket-resolution-title" className="text-xl font-bold">{ticket.status === "used" ? "Esta entrada ya fue utilizada" : "Esta entrada fue revocada"}</h2>
        <p className="mt-3 text-sm leading-relaxed">No presentes este código para ingresar. Si crees que se trata de un error, contacta al organizador del evento.</p>
      </section>
    )}
    {(!ticket.event.published || ticket.event.past) && <aside className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-200">{!ticket.event.published && <p>Evento no publicado. Consulta con el organizador antes de asistir.</p>}{ticket.event.past && <p className={!ticket.event.published ? "mt-2" : undefined}>Evento pasado: la fecha y hora de inicio ya se alcanzaron.</p>}</aside>}
    <div className="mt-8 grid gap-8 sm:grid-cols-2">
      <section aria-labelledby="event-details-title">
        <h2 id="event-details-title" className="text-xl font-bold">Evento</h2>
        <dl className="mt-4 space-y-4">
          <div><dt className="text-sm text-white/55">Tipo de entrada</dt><dd className="break-words">{ticket.ticketTypeName}</dd></div>
          <div><dt className="text-sm text-white/55">Fecha y hora</dt><dd><time dateTime={ticket.event.date}>{formatEventDate(ticket.event.date)}</time><span className="text-sm text-white/55"> (Guatemala)</span></dd></div>
          <div><dt className="text-sm text-white/55">Lugar</dt><dd className="break-words">{ticket.event.location}</dd></div>
        </dl>
      </section>
      <section aria-labelledby="holder-details-title">
        <h2 id="holder-details-title" className="text-xl font-bold">Titular</h2>
        <dl className="mt-4 space-y-4">
          <div><dt className="text-sm text-white/55">Nombre</dt><dd className="break-words font-bold">{ticket.holderName}</dd></div>
          <div><dt className="text-sm text-white/55">Correo</dt><dd className="break-all">{ticket.holderEmail}</dd></div>
        </dl>
      </section>
    </div>
    <p className="mt-8 text-sm text-white/65">Este enlace permite consultar tu entrada y sus datos. Compártelo únicamente con la persona autorizada a consultarla.</p>
    <TicketRefreshControl />
  </article>;
}

export default function Page({ params }: Props) {
  return <div className="mx-auto min-h-svh max-w-2xl px-5 pb-16 sm:px-8">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 py-5 sm:py-6">
      <Link href="/" className="text-2xl font-extrabold">doorlist<span className="text-accent">.</span></Link>
      <nav aria-label="Navegación de Doorlist" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold sm:gap-x-5">
        <Link href="/dashboard" className="text-accent hover:underline">Dashboard</Link>
        <Link href="/mis-boletos" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-4 py-2 hover:border-accent hover:text-accent">
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.75">
            <path d="M6.5 3.5 2 8l4.5 4.5M2.5 8H14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Volver a mis boletos
        </Link>
        <Link href="/" className="text-white/70 hover:text-white">Eventos</Link>
      </nav>
    </header>
    <main className="py-10"><Suspense fallback={<p role="status">Cargando entrada…</p>}><Ticket params={params} /></Suspense></main>
  </div>;
}
