"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ApiError, AvailableEvent, ConfirmRegistrationRequest, ConfirmRegistrationSuccess, Ticket } from "@/lib/domain";
import { formatEventDate } from "@/lib/date";
import { mapAvailableEventsPayload } from "@/lib/persistence-mappers";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/validation";
import AccountForm from "@/components/account-form";
import BuyerTickets from "@/components/buyer-tickets";
import TicketStatus from "@/components/ticket-status";
import TicketEmailDelivery from "@/components/ticket-email-delivery";
import { ticketHref } from "@/lib/ticket-code";

const field = "mt-2 w-full rounded-xl border border-white/20 bg-[#211b2e] px-4 py-3 text-white outline-none focus:border-accent disabled:opacity-60";
const button = "rounded-full bg-accent px-5 py-3 font-bold text-[#171321] hover:bg-accent/90 disabled:opacity-50";
type Attempt = { key: string; name: string; email: string; ticketTypeId: string; ticketTypeName: string; buyerId: string; eventTitle: string };

export default function Registration({ id }: { id: string }) {
  const [event, setEvent] = useState<AvailableEvent | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Attempt | null>(null);
  const [success, setSuccess] = useState<(Attempt & { registrationId: string; ticket?: Ticket }) | null>(null);
  const [clock, setClock] = useState({ now: 0, offset: 0 });
  const lock = useRef(false);
  const generation = useRef(0);
  const account = useRef<string | null>(null);
  const [ticketsVersion, setTicketsVersion] = useState(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    if (!isUuid(id)) { setEvent(null); setStatus("ready"); return; }
    try {
      if (!supabase) throw new Error("config");
      const { data, error } = await supabase.rpc("eventos_disponibles", { p_evento_id: id });
      if (current !== generation.current) return;
      if (error || !data) throw new Error("load");
      const mapped = mapAvailableEventsPayload(data);
      setEvent((previous) => mapped.events[0] ?? (previous ? { ...previous, isOpen: false } : null));
      const serverTime = new Date(mapped.serverTime).getTime();
      setClock({ now: serverTime, offset: serverTime - Date.now() });
      setStatus("ready");
    } catch { if (current === generation.current) setStatus("error"); }
  }, [id]);

  useEffect(() => {
    const requests = generation;
    const refresh = () => { void load(); };
    const initial = window.setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 30000);
    return () => { requests.current++; window.clearTimeout(initial); window.removeEventListener("focus", refresh); window.clearInterval(interval); };
  }, [load]);

  useEffect(() => { const timer = window.setInterval(() => setClock((value) => ({ ...value, now: Date.now() + value.offset })), 1000); return () => window.clearInterval(timer); }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((authEvent, next) => {
      const nextId = next?.user.id ?? null;
      if (account.current !== nextId) { setSuccess(null); setName(""); setEmail(""); setTicketTypeId(""); setError(""); }
      if (authEvent === "SIGNED_OUT") setPending(null);
      else if (nextId) setPending((previous) => previous?.buyerId === nextId ? previous : null);
      account.current = nextId; setSession(next); setChecking(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const available = event && event.isOpen && new Date(event.date).getTime() > clock.now;
  const selected = event?.ticketTypes.find((item) => item.id === ticketTypeId);
  const successHref = ticketHref(success?.ticket?.code);

  async function confirm(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!supabase || lock.current || !session || !event) return;
    setError("");
    if (pending && pending.buyerId !== session.user.id) { setError("Inicia sesión con la cuenta que inició este registro para reintentarlo."); return; }
    if (!pending && (!name.trim() || !email.trim() || !selected)) { setError("Completa el nombre, correo y tipo de entrada."); return; }
    const attempt = pending ?? { key: crypto.randomUUID(), name: name.trim(), email: email.trim().toLowerCase(), ticketTypeId, ticketTypeName: selected!.name, buyerId: session.user.id, eventTitle: event.title };
    lock.current = true; setBusy(true); setPending(attempt);
    try {
      const currentSession = (await supabase.auth.getSession()).data.session;
      if (!currentSession || currentSession.user.id !== attempt.buyerId) { setSession(null); setError("Inicia sesión para reintentar el mismo registro."); return; }
      const requestBody: ConfirmRegistrationRequest = { eventId: id, ticketTypeId: attempt.ticketTypeId, name: attempt.name, email: attempt.email, idempotencyKey: attempt.key };
      const response = await fetch("/api/registros/confirmar", { method: "POST", headers: { Authorization: `Bearer ${currentSession.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      if (account.current !== attempt.buyerId) return;
      if (!response.ok) {
        const failure = await response.json() as ApiError;
        if (failure.error === "sessionRequired") { setSession(null); setError("Tu sesión caducó. Inicia sesión para reintentar el mismo registro."); }
        else if (failure.error === "eventUnavailable") { setPending(null); setEvent(null); setError("Este evento ya no está disponible para registro."); }
        else if (failure.error === "ticketTypeSoldOut") { setPending(null); setTicketTypeId(""); setError("Este tipo de entrada ya no tiene cupos. Elige otra opción."); }
        else if (failure.error === "invalidTicketType") { setPending(null); setTicketTypeId(""); setError("La entrada seleccionada ya no está disponible. Elige otra opción."); }
        else if (failure.error === "invalidData" || failure.error === "payloadTooLarge") { setPending(null); setError("Revisa el nombre y correo del titular e inténtalo de nuevo."); }
        else setError("No pudimos confirmar el resultado. Reintenta el mismo registro para comprobarlo sin duplicar tu boleto.");
        if (["eventUnavailable", "ticketTypeSoldOut", "invalidTicketType"].includes(failure.error)) await load();
        return;
      }
      const result = await response.json() as ConfirmRegistrationSuccess;
      setSuccess({ ...attempt, registrationId: result.registrationId, ticket: result.ticket }); setPending(null); setTicketsVersion((value) => value + 1); setName(""); setEmail(""); setTicketTypeId("");
      await load();
    } catch { if (account.current === attempt.buyerId) setError("No pudimos confirmar el resultado. Reintenta el mismo registro para comprobarlo sin duplicar tu boleto."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="mx-auto min-h-svh max-w-5xl px-5 pb-16 sm:px-10"><header className="flex items-center border-b border-white/15 py-7"><Link href="/" className="text-2xl font-extrabold">doorlist<span className="text-accent">.</span></Link></header><main className="py-12">
    <p className="text-xs font-bold uppercase tracking-widest text-accent">Registro de boletos</p>
    {status === "loading" && <p role="status" className="mt-6">Cargando evento y cupos…</p>}
    {status === "error" && <div role="alert" className="mt-6 space-y-4"><p>No pudimos consultar la disponibilidad. Inténtalo de nuevo.</p><button className={button} onClick={() => void load()}>Reintentar consulta</button></div>}
    {success && <section role="status" className="mt-6 space-y-3 rounded-2xl border border-accent/40 bg-accent/10 p-6"><h1 className="text-2xl font-bold">Registro confirmado</h1><p>{success.eventTitle}</p><p>{success.name} · {success.email}</p><p>Entrada: {success.ticketTypeName}</p><p className="break-all">Folio: {success.registrationId}</p>{success.ticket && <TicketStatus status={success.ticket.status} />}<TicketEmailDelivery key={success.registrationId} registrationId={success.registrationId} buyerId={success.buyerId} available={success.ticket?.status === "valid"} /><div className="flex flex-wrap gap-3">{successHref && <Link href={successHref} prefetch={false} className={button}>Ver entrada y QR</Link>}<button className={button} onClick={() => { setSuccess(null); setError(""); void load(); }}>Registrar otra persona</button></div></section>}
    {status === "ready" && !available && !success && !pending && <section className="mt-6"><h1 className="text-3xl font-bold">Evento no disponible</h1><p className="mt-3 text-white/70">Este evento ya no está disponible para registro.</p></section>}
    {event && (available || pending) && !success && <div className="mt-8 grid gap-8 md:grid-cols-2"><section><h1 className="text-4xl font-extrabold tracking-tight">{event.title}</h1><p className="mt-4 text-accent"><time dateTime={event.date}>{formatEventDate(event.date)}</time></p><p className="mt-2 text-white/70">{event.location}</p><p className="mt-5 whitespace-pre-wrap text-white/75">{event.description}</p><h2 className="mt-8 text-xl font-bold">Tipos de entrada</h2><ul className="mt-4 space-y-3">{event.ticketTypes.map((ticketType) => <li key={ticketType.id} className="flex justify-between gap-4 rounded-xl border border-white/15 p-4"><span>{ticketType.name}</span><span className="text-accent">{ticketType.available > 0 ? `${ticketType.available} cupos` : "Agotado"}</span></li>)}</ul></section>
      <section className="rounded-2xl border border-white/15 bg-white/5 p-6">{!supabase ? <p role="alert">El registro no está configurado.</p> : checking ? <p role="status">Comprobando sesión…</p> : !session ? <AccountForm returnTo={`/eventos/${id}/registro`} onAuthenticated={() => { void load(); }} /> : <><h2 className="text-2xl font-bold">Datos del titular</h2><p className="mt-2 break-all text-sm text-white/60">Comprador: {session.user.email}</p><form onSubmit={confirm} className="mt-5 space-y-5"><fieldset disabled={busy || !!pending} className="space-y-4"><legend className="mb-3 text-sm text-white/70">Ingresa el nombre y correo de quien usará este boleto.</legend><label className="block">Nombre completo<input className={field} autoComplete="off" required maxLength={200} pattern=".*\S.*" value={name} onChange={(changeEvent) => setName(changeEvent.target.value)} /></label><label className="block">Correo del titular<input className={field} type="email" autoComplete="off" required maxLength={254} value={email} onChange={(changeEvent) => setEmail(changeEvent.target.value)} /></label><label className="block">Tipo de entrada<select className={field} required value={ticketTypeId} onChange={(changeEvent) => setTicketTypeId(changeEvent.target.value)}><option value="">Selecciona una entrada</option>{event.ticketTypes.map((ticketType) => <option key={ticketType.id} value={ticketType.id} disabled={ticketType.available <= 0}>{ticketType.name} — {ticketType.available > 0 ? `${ticketType.available} cupos` : "Agotado"}</option>)}</select></label></fieldset>{(selected || pending) && <div className="space-y-2 rounded-xl bg-white/5 p-4 text-sm"><p className="font-bold">Resumen del registro</p><p>{event.title}</p><p>{pending?.ticketTypeName ?? selected?.name}</p><p>{pending?.name ?? name} · {pending?.email ?? email}</p><p className="text-white/60">La disponibilidad se validará al confirmar.</p></div>}<button className={button} disabled={busy || (!pending && (!available || status !== "ready" || !selected || selected.available <= 0))}>{busy ? "Confirmando…" : pending ? "Reintentar el mismo registro" : "Confirmar registro"}</button>{pending && !busy && <p className="text-sm text-white/65">Hay una operación pendiente de comprobar. Reinténtala antes de registrar otro boleto.</p>}</form></>}{busy && <p role="status" className="mt-4">Validando disponibilidad y creando tu boleto…</p>}{error && <p role="alert" className="mt-4 text-red-200">{error}</p>}</section>
    </div>}
    {session && isUuid(id) && <BuyerTickets key={`${session.user.id}:${id}`} buyerId={session.user.id} eventId={id} refreshKey={String(ticketsVersion)} />}
  </main></div>;
}
