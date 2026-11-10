"use client";

import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { OrganizerEvent } from "@/lib/domain";
import { formatEventDate, guatemalaDateTimeLocalToIso, toGuatemalaDateTimeLocal } from "@/lib/date";
import { eventStatusToPersistence, eventValuesToPersistence, mapOrganizerEvents, ticketTypeValuesToPersistence } from "@/lib/persistence-mappers";


type EventForm = { title: string; description: string; date: string; location: string; capacity: string };
const emptyEvent: EventForm = { title: "", description: "", date: "", location: "", capacity: "" };
const field = "mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:border-accent";
const button = "rounded-full bg-accent px-5 py-3 font-bold text-[#171321] hover:bg-accent/90 disabled:opacity-50";
const secondary = "rounded-full border border-white/25 px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-50";

function DeleteEventDialog({ event, busy, error, onCancel, onDelete }: {
  event: OrganizerEvent; busy: boolean; error: string; onCancel: () => void; onDelete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog ref={dialog} aria-labelledby="delete-title" aria-describedby="delete-description" onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }} className="m-auto max-h-[90vh] w-[min(94vw,36rem)] overflow-y-auto rounded-2xl border border-white/20 bg-[#211b2e] p-6 text-white shadow-2xl backdrop:bg-black/75 sm:p-8">
    <h2 id="delete-title" className="text-2xl font-bold">Eliminar evento</h2>
    <p id="delete-description" className="mt-3 text-sm text-white/70">Se eliminarán el evento y todos sus tipos de entrada. Esta acción no se puede deshacer.</p>
    <dl className="mt-5 space-y-3 rounded-xl border border-white/15 p-4 text-sm">
      <div><dt className="text-white/55">Nombre</dt><dd className="break-words font-bold">{event.title}</dd></div>
      <div><dt className="text-white/55">Descripción</dt><dd className="whitespace-pre-wrap break-words">{event.description || "Sin descripción"}</dd></div>
      <div><dt className="text-white/55">Fecha y hora</dt><dd>{formatEventDate(event.date)}</dd></div>
      <div><dt className="text-white/55">Lugar</dt><dd className="break-words">{event.location}</dd></div>
      <div><dt className="text-white/55">Estado</dt><dd>{event.status}</dd></div>
      <div><dt className="text-white/55">Aforo del evento</dt><dd>{event.capacity}</dd></div>
      <div><dt className="text-white/55">Tipos de entrada y aforo</dt><dd>{event.ticketTypes.length ? <ul>{event.ticketTypes.map((ticket) => <li key={ticket.id} className="break-words">{ticket.name}: {ticket.capacity}</li>)}</ul> : "Sin tipos de entrada"}</dd></div>
    </dl>
    <form className="mt-5" onSubmit={(e) => { e.preventDefault(); if (!busy && confirmation === event.title) onDelete(); }}>
      <label htmlFor="delete-confirmation" className="block text-sm font-semibold">Escribe el nombre exacto del evento para confirmar</label>
      <input id="delete-confirmation" className={field} autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={busy} />
      {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={secondary} disabled={busy} onClick={onCancel}>Cancelar</button><button type="submit" className="rounded-full bg-red-500 px-5 py-3 font-bold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || confirmation !== event.title}>Eliminar evento</button></div>
    </form>
  </dialog>;
}

export default function Organizer() {
  const [now, setNow] = useState(0);
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  useEffect(() => {
    let timer: number | undefined;
    function updateForNextEvent() {
      const currentTime = Date.now();
      setNow(currentTime);
      const nextEventTime = events.reduce<number | null>((nextTime, event) => {
        if (event.status !== "published") return nextTime;
        const eventTime = new Date(event.date).getTime();
        return eventTime > currentTime && (nextTime === null || eventTime < nextTime) ? eventTime : nextTime;
      }, null);
      if (nextEventTime !== null) {
        timer = window.setTimeout(updateForNextEvent, nextEventTime - currentTime + 1);
      }
    }
    updateForNextEvent();
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [events]);
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [form, setForm] = useState<EventForm>(emptyEvent);
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticketName, setTicketName] = useState("");
  const [ticketCapacity, setTicketCapacity] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<OrganizerEvent | null>(null);

  const load = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.from("events").select("id,titulo,descripcion,fecha,lugar,estado,aforo_maximo,tipos_entrada:ticket_types(id,evento_id,nombre,aforo_maximo)").eq("propietario_id", userId).order("fecha");
    if (error) setError("No pudimos cargar tus eventos. Inténtalo de nuevo."); else setEvents(mapOrganizerEvents(data));
  }, [setEvents]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setChecking(false);
      if (next) setTimeout(() => void load(next.user.id), 0);
      if (!next) { setEvents([]); setSelected(null); setEditing(null); setDeleting(null); setForm(emptyEvent); }
    });
    return () => subscription.unsubscribe();
  }, [load]);

  const current = events.find((event) => event.id === selected);
  const assigned = current?.ticketTypes.reduce((sum, ticket) => sum + ticket.capacity, 0) ?? 0;

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>, success: string, refresh = true, failure = "No se pudo completar la operación. Revisa los datos e inténtalo de nuevo.") {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await action();
      if (result.error) { setError(failure); return false; }
      setNotice(success);
      if (session && refresh) await load(session.user.id);
      return true;
    } catch { setError("No se pudo completar la operación. Comprueba tu conexión e inténtalo de nuevo."); return false; }
    finally { setBusy(false); }
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    await run(() => supabase!.auth.signInWithPassword({ email, password }), "Sesión iniciada.", true, "No pudimos iniciar sesión. Revisa tus credenciales.");
    setPassword("");
  }
  async function saveEvent(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !session) return;
    const capacity = Number(form.capacity);
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 2147483647 || !form.title.trim() || !form.location.trim() || !form.date || Number.isNaN(new Date(form.date).getTime())) { setError("Completa los campos obligatorios y usa un aforo entero válido."); return; }
    const values = eventValuesToPersistence({ title: form.title.trim(), description: form.description.trim(), location: form.location.trim(), date: guatemalaDateTimeLocalToIso(form.date), capacity });
    const ok = await run(() => editing ? supabase!.from("events").update(values).eq("id", editing).eq("propietario_id", session.user.id).select().single() : supabase!.from("events").insert({ ...values, propietario_id: session.user.id }).select().single(), editing ? "Evento actualizado." : "Evento creado como borrador.");
    if (ok) { setForm(emptyEvent); setEditing(null); }
  }
  async function saveTicket(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !current) return;
    const capacity = Number(ticketCapacity);
    const previous = current.ticketTypes.find((ticket) => ticket.id === ticketId)?.capacity ?? 0;
    if (!ticketName.trim() || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 2147483647) { setError("Indica un nombre y un aforo entero válido."); return; }
    if (assigned - previous + capacity > current.capacity) { setError("La suma de los aforos de los tipos de entrada supera el aforo del evento."); return; }
    const values = ticketTypeValuesToPersistence({ name: ticketName.trim(), capacity });
    const ok = await run(() => ticketId ? supabase!.from("ticket_types").update(values).eq("id", ticketId).eq("evento_id", current.id).select().single() : supabase!.from("ticket_types").insert({ ...values, evento_id: current.id }).select().single(), ticketId ? "Tipo de entrada actualizado." : "Tipo de entrada creado.");
    if (ok) { setTicketId(null); setTicketName(""); setTicketCapacity(""); }
  }

  async function deleteEvent() {
    if (!supabase || !session || !deleting || busy) return;
    const event = deleting;
    const ok = await run(() => supabase!.from("events").delete().eq("id", event.id).eq("propietario_id", session.user.id).eq("titulo", event.title).select().single(), "Evento eliminado.");
    if (ok) {
      setDeleting(null);
      if (selected === event.id) setSelected(null);
      if (editing === event.id) { setEditing(null); setForm(emptyEvent); }
    }
  }

  return <div className="mx-auto min-h-screen max-w-6xl px-5 pb-16 sm:px-10">
    {deleting && <DeleteEventDialog event={deleting} busy={busy} error={error} onCancel={() => { setDeleting(null); setError(""); }} onDelete={() => void deleteEvent()} />}
    <main className="pt-12">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Panel de organizador</p>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Tus eventos<span className="text-accent">.</span></h1>
      {error && <p role="alert" className="mt-6 rounded-xl border border-red-400/40 bg-red-400/10 p-4 text-red-200">{error}</p>}
      {notice && <p role="status" className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-4 text-accent">{notice}</p>}
      {!supabase ? <p className="mt-8 text-white/70">Configura las variables públicas de Supabase para acceder al panel.</p> : checking ? <p className="mt-8 text-white/70">Comprobando sesión…</p> : !session ? <form onSubmit={signIn} className="mt-8 max-w-md space-y-5 rounded-2xl border border-white/15 bg-white/5 p-6"><p className="text-white/70">Inicia sesión con tu cuenta de organizador.</p><label className="block text-sm font-semibold">Correo<input className={field} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="block text-sm font-semibold">Contraseña<input className={field} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className={button} disabled={busy}>Entrar</button></form> : <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-5"><div><h2 className="text-2xl font-bold">Mis eventos</h2><p className="mt-1 text-sm text-white/55">{session.user.email}</p></div>{events.length === 0 && <p className="rounded-2xl border border-white/15 p-6 text-white/60">Aún no tienes eventos. Crea el primero desde el formulario.</p>}{events.map((event) => <article key={event.id} className="rounded-2xl border border-white/15 bg-white/5 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-accent">{event.status}</p><h3 className="mt-2 text-xl font-bold">{event.title}</h3><p className="mt-1 text-sm text-white/60">{formatEventDate(event.date)} · {event.location}</p><p className="mt-2 text-sm text-white/60">Aforo asignado: {event.ticketTypes.reduce((n, t) => n + t.capacity, 0)} / {event.capacity}</p></div></div><div className="mt-5 flex flex-wrap gap-2">{event.status === "published" && now > 0 && new Date(event.date).getTime() > now && <Link className={secondary} href={`/eventos/${event.id}/registro`}>Registrarme</Link>}<button className={secondary} onClick={() => { setSelected(event.id); setTicketId(null); setTicketName(""); setTicketCapacity(""); }}>Entradas</button><button className={secondary} onClick={() => { setEditing(event.id); setForm({ title: event.title, description: event.description, location: event.location, date: toGuatemalaDateTimeLocal(event.date), capacity: String(event.capacity) }); }}>Editar</button><button className={secondary} disabled={busy} onClick={() => void run(() => supabase!.from("events").update(eventStatusToPersistence(event.status === "published" ? "draft" : "published")).eq("id", event.id).eq("propietario_id", session.user.id).select().single(), "Estado actualizado.")}>{event.status === "published" ? "Pasar a borrador" : "Publicar"}</button><button className={secondary} disabled={busy} onClick={() => { setError(""); setDeleting(event); }}>Eliminar</button></div></article>)}</section>
        <div className="space-y-8"><section className="rounded-2xl border border-white/15 bg-white/5 p-6"><h2 className="text-2xl font-bold">{editing ? "Editar evento" : "Crear evento"}</h2><form onSubmit={saveEvent} className="mt-5 space-y-4"><label className="block text-sm font-semibold">Título<input className={field} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label className="block text-sm font-semibold">Descripción<textarea className={field} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label className="block text-sm font-semibold">Fecha y hora<input className={field} type="datetime-local" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label className="block text-sm font-semibold">Lugar<input className={field} required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label><label className="block text-sm font-semibold">Aforo del evento<input className={field} type="number" min="1" max="2147483647" step="1" required value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label><div className="flex gap-3"><button className={button} disabled={busy}>{editing ? "Guardar cambios" : "Crear evento"}</button>{editing && <button type="button" className={secondary} onClick={() => { setEditing(null); setForm(emptyEvent); }}>Cancelar</button>}</div></form></section>
        {current && <section className="rounded-2xl border border-white/15 bg-white/5 p-6"><h2 className="text-2xl font-bold">Tipos de entrada</h2><p className="mt-2 text-sm text-white/60">{current.title} · {assigned} de {current.capacity} lugares asignados</p><div className="mt-5 space-y-3">{current.ticketTypes.length === 0 && <p className="text-sm text-white/55">Agrega al menos un tipo de entrada para publicar.</p>}{current.ticketTypes.map((ticket) => <div key={ticket.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><div><p className="font-bold">{ticket.name}</p><p className="text-sm text-white/60">{ticket.capacity} lugares</p></div><div className="flex gap-2"><button className={secondary} onClick={() => { setTicketId(ticket.id); setTicketName(ticket.name); setTicketCapacity(String(ticket.capacity)); }}>Editar</button><button className={secondary} disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar el tipo “${ticket.name}”?`)) void run(() => supabase!.from("ticket_types").delete().eq("id", ticket.id).eq("evento_id", current.id).select().single(), "Tipo de entrada eliminado.").then((ok) => { if (ok && ticketId === ticket.id) { setTicketId(null); setTicketName(""); setTicketCapacity(""); } }); }}>Eliminar</button></div></div>)}</div><form onSubmit={saveTicket} className="mt-6 space-y-4"><h3 className="font-bold">{ticketId ? "Editar tipo" : "Agregar tipo"}</h3><label className="block text-sm font-semibold">Nombre<input className={field} required value={ticketName} onChange={(e) => setTicketName(e.target.value)} /></label><label className="block text-sm font-semibold">Aforo<input className={field} type="number" min="1" max="2147483647" step="1" required value={ticketCapacity} onChange={(e) => setTicketCapacity(e.target.value)} /></label><div className="flex gap-3"><button className={button} disabled={busy}>{ticketId ? "Guardar tipo" : "Agregar tipo"}</button>{ticketId && <button type="button" className={secondary} onClick={() => { setTicketId(null); setTicketName(""); setTicketCapacity(""); }}>Cancelar</button>}</div></form></section>}</div>
      </div>}
    </main>
  </div>;
}
