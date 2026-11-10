"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { accessClient } from "@/lib/supabase/access-client";
import { accessField as field, accessPrimary as primary, accessSecondary as secondary, accessMessage, codeFingerprint, fetchAccess } from "@/lib/access-control";
import { formatEventDate } from "@/lib/date";
import type { AccessSession, AccessEvent, AccessEventsResponse, AccessResult, PendingValidation } from "@/lib/domain";
import CameraScanner from "./camera-scanner";
import Link from "next/link";

class AccessFailure extends Error {
  constructor(public code: string, public status: number, public confirmed = false) { super(accessMessage(code)); }
}

export default function AccessWorkspace({ link }: { link: string }) {
  const [session, setSession] = useState<AccessSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [eventClock, setEventClock] = useState<{ serverTime: string; receivedAt: number } | null>(null);
  const [eventsState, setEventsState] = useState<"loading" | "ready" | "error">("loading");
  const [eventId, setEventId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false); const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [result, setResult] = useState<AccessResult | null>(null);
  const [rejected, setRejected] = useState(""); const [cameraError, setCameraError] = useState("");
  const [pending, setPending] = useState<PendingValidation | null>(null);
  const locked = useRef(false); const mounted = useRef(true);
  const authEpoch = useRef(0);
  const sessionRef = useRef(session);
  const pendingRef = useRef(pending);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  const base = `/api/acceso/${link}`;
  const pendingKey = useCallback((member: string) => `doorlist-pending:${link}:${member}`, [link]);

  const request = useCallback(async (path: string, method = "GET", body?: unknown) => {
    const client = accessClient();
    const auth = await client?.auth.getSession();
    const token = auth?.data.session?.access_token;
    if (!token) throw new AccessFailure("sessionRequired", 401);
    const response = await fetchAccess(`${base}/${path}`, { method, cache: "no-store", headers: {
      Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new AccessFailure(failure.error ?? "accessUnavailable", response.status, response.headers.get("X-Access-Operation-Confirmed") === "true");
    }
    return { status: response.status, data: await response.json() };
  }, [base]);

  const clearSession = useCallback(async (message: string) => {
    authEpoch.current++; sessionRef.current = null; pendingRef.current = null; setPending(null);
    setScanning(false); setSession(null); setEvents([]); setEventId(null); setResult(null); setRejected("");
    setError(message);
    await accessClient()?.auth.signOut({ scope: "local" }).catch(() => undefined);
  }, []);

  const restorePending = useCallback((current: AccessSession) => {
    pendingRef.current = null; setPending(null);
    try {
      const saved = sessionStorage.getItem(pendingKey(current.staffMemberId));
      if (saved) {
        const value = JSON.parse(saved) as PendingValidation;
        if (value.staffMemberId === current.staffMemberId && /^[0-9a-f-]{36}$/.test(value.eventId) && /^[0-9a-f-]{36}$/.test(value.operationId) && /^[0-9a-f]{64}$/.test(value.fingerprint)) {
          pendingRef.current = value; setPending(value); setEventId(value.eventId);
        }
      } else setPending(null);
    } catch { setError("No pudimos recuperar la operación local. No confirmes otro ingreso sin revisar el historial con la organizadora."); }
  }, [pendingKey]);

  useEffect(() => {
    mounted.current = true; let cancelled = false;
    async function restore() {
      try {
        const auth = await accessClient()?.auth.getSession();
        if (!auth?.data.session) return;
        const response = await request("sesion");
        if (!cancelled) { sessionRef.current = response.data; setSession(response.data); restorePending(response.data); }
      } catch (failure) {
        if (!cancelled) {
          if (failure instanceof AccessFailure && [401, 403].includes(failure.status)) await clearSession(failure.message);
          else setError("No pudimos comprobar la sesión. Intenta iniciar sesión nuevamente.");
        }
      } finally { if (!cancelled) setChecking(false); }
    }
    void restore();
    return () => { cancelled = true; mounted.current = false; };
  }, [request, restorePending, clearSession]);

  const loadEvents = useCallback(async () => {
    if (!sessionRef.current) return;
    const epoch = authEpoch.current;
    setEventsState("loading");
    try {
      const response = await request("eventos");
      if (!mounted.current || authEpoch.current !== epoch) return;
      setEvents((response.data as AccessEventsResponse).events);
      setEventClock({ serverTime: response.data.serverTime, receivedAt: performance.now() }); setEventsState("ready");
    } catch (failure) {
      if (!mounted.current || authEpoch.current !== epoch) return;
      setEventsState("error"); setError(failure instanceof Error ? failure.message : accessMessage("accessUnavailable"));
      if (failure instanceof AccessFailure && [401, 403].includes(failure.status)) await clearSession(failure.message);
    }
  }, [request, clearSession]);
  const memberId = session?.staffMemberId;
  useEffect(() => {
    if (!memberId) return;
    const initial = window.setTimeout(() => void loadEvents(), 0);
    const interval = window.setInterval(() => void loadEvents(), 60000);
    const visible = () => { setScanning(false); if (!document.hidden) void loadEvents(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearTimeout(initial); clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [memberId, loadEvents]);
  useEffect(() => {
    if (!eventClock || !memberId) return;
    const serverNow = Date.parse(eventClock.serverTime) + performance.now() - eventClock.receivedAt;
    const nextBoundary = events.flatMap((event) => [Date.parse(event.opensAt), Date.parse(event.closesAt)]).filter((time) => time > serverNow).sort((a, b) => a - b)[0];
    if (!nextBoundary) return;
    const timer = window.setTimeout(() => { setScanning(false); void loadEvents(); }, Math.min(nextBoundary - serverNow + 5, 2147483647));
    return () => clearTimeout(timer);
  }, [events, eventClock, memberId, loadEvents]);

  useEffect(() => {
    if (!session) return;
    const remaining = Date.parse(session.expiresAt) - Date.parse(session.serverTime);
    const timer = window.setTimeout(() => { void request("sesion", "DELETE").catch(() => undefined); void clearSession(accessMessage("accessSessionExpired")); }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [session, request, clearSession]);
  useEffect(() => {
    if (!memberId) return;
    let last = 0; let running = false;
    const activity = async (event: globalThis.Event) => {
      if (!event.isTrusted || document.hidden || running || performance.now() - last < 1000) return;
      running = true; last = performance.now();
      const epoch = authEpoch.current;
      try {
        const response = await request("actividad", "POST");
        if (mounted.current && authEpoch.current === epoch) setSession((value) => value ? { ...value, ...response.data } : value);
      } catch (failure) {
        if (authEpoch.current === epoch && failure instanceof AccessFailure && [401, 403].includes(failure.status)) await clearSession(failure.message);
      } finally { running = false; }
    };
    window.addEventListener("pointerdown", activity); window.addEventListener("keydown", activity);
    return () => { window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); };
  }, [memberId, request, clearSession]);

  async function login(event: FormEvent) {
    event.preventDefault(); if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    const epoch = ++authEpoch.current;
    try {
      const client = accessClient(); if (!client) throw new Error("El acceso no está configurado.");
      const response = await fetchAccess(`${base}/sesion`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      if (!response.ok) { const data = await response.json(); throw new AccessFailure(data.error, response.status); }
      const data = await response.json();
      const saved = await client.auth.setSession({ access_token: data.tokens.accessToken, refresh_token: data.tokens.refreshToken });
      if (saved.error) throw new Error("No pudimos guardar la sesión. Inténtalo de nuevo.");
      if (mounted.current && authEpoch.current === epoch) { sessionRef.current = data.session; setSession(data.session); restorePending(data.session); }
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : accessMessage("accessUnavailable")); }
    finally { locked.current = false; if (mounted.current) { setBusy(false); setPassword(""); } }
  }
  const finishPending = useCallback(() => {
    const current = sessionRef.current;
    if (current) sessionStorage.removeItem(pendingKey(current.staffMemberId));
    setPending(null); pendingRef.current = null;
  }, [pendingKey]);
  const validate = useCallback(async (input: string, source: "camera" | "manual") => {
    const current = sessionRef.current;
    if (!current || !eventId || locked.current) return;
    const epoch = authEpoch.current;
    locked.current = true; setBusy(true); setScanning(false); setError(""); setResult(null); setRejected("");
    try {
      const value = source === "manual" ? input.trim() : input;
      const fingerprint = await codeFingerprint(value);
      const previous = pendingRef.current;
      if (previous && (previous.fingerprint !== fingerprint || previous.eventId !== eventId)) throw new AccessFailure("accessOperationConflict", 409);
      const operation: PendingValidation = previous ?? { staffMemberId: current.staffMemberId, eventId, fingerprint, operationId: crypto.randomUUID() };
      // Persist only the operation reference and digest, before any network mutation.
      sessionStorage.setItem(pendingKey(current.staffMemberId), JSON.stringify(operation));
      pendingRef.current = operation; setPending(operation);
      const response = await request("validaciones", "POST", { eventId, code: value, source, operationId: operation.operationId });
      if (!mounted.current || authEpoch.current !== epoch) return;
      setResult(response.data); finishPending(); setCode("");
    } catch (failure) {
      if (!mounted.current || authEpoch.current !== epoch) return;
      if (failure instanceof AccessFailure && failure.status < 500 && failure.code !== "accessOperationConflict" &&
          (failure.confirmed || ![401, 403, 429].includes(failure.status))) {
        setRejected(failure.message); finishPending();
      } else {
        setError(failure instanceof AccessFailure && failure.status < 500 ? failure.message : "No pudimos confirmar el resultado. Comprueba esta operación antes de continuar.");
        if (failure instanceof AccessFailure && [401, 403].includes(failure.status)) await clearSession(failure.message);
      }
    } finally {
      locked.current = false;
      if (mounted.current) {
        setBusy(false);
        // Read the expiry updated by the validation; this query is not activity.
        if (authEpoch.current === epoch) void request("sesion").then(({ data }) => { if (mounted.current && authEpoch.current === epoch && sessionRef.current) setSession(data); }).catch(() => undefined);
      }
    }
  }, [eventId, pendingKey, request, clearSession, finishPending]);
  const onRead = useCallback((value: string) => { void validate(value, "camera"); }, [validate]);
  const onCameraError = useCallback((message: string) => { setScanning(false); setCameraError(message); }, []);

  async function recover() {
    const operation = pendingRef.current; if (!operation || locked.current) return;
    locked.current = true; setBusy(true); setError("");
    const epoch = authEpoch.current;
    try {
      const response = await request(`validaciones/${operation.operationId}?eventId=${operation.eventId}`);
      if (!mounted.current || authEpoch.current !== epoch) return;
      if (response.status === 202) setError("Todavía no hay un resultado confirmado. Vuelve a comprobar o lee la misma entrada para reintentar la misma operación.");
      else { setResult(response.data); finishPending(); }
    } catch (failure) {
      if (!mounted.current || authEpoch.current !== epoch) return;
      if (failure instanceof AccessFailure && failure.confirmed) { setRejected(failure.message); finishPending(); }
      else {
        setError(failure instanceof Error ? failure.message : accessMessage("accessUnavailable"));
        if (failure instanceof AccessFailure && [401, 403].includes(failure.status)) await clearSession(failure.message);
      }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  const selected = events.find((event) => event.id === eventId);
  const canValidate = Boolean(selected?.available && eventsState === "ready");
  if (checking) return <p role="status">Comprobando sesión…</p>;
  if (!session) return <>
    <Link href="/" className="text-xl font-extrabold">doorlist<span className="text-accent">.</span></Link>
    <h1 className="mt-8 text-4xl font-extrabold">Personal de acceso</h1>
    <p className="mt-3 text-white/70">Usa el usuario y la contraseña que te entregó tu organizadora.</p>
    <form onSubmit={login} className="mt-8 space-y-5">
      <label className="block font-semibold">Usuario<input className={field} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} disabled={busy} /></label>
      <label className="block font-semibold">Contraseña<input className={field} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
      <button className={`${primary} w-full`} disabled={busy}>{busy ? "Iniciando sesión…" : "Entrar"}</button>
    </form>{error && <p role="alert" className="mt-5 text-red-200">{error}</p>}
    <p className="mt-8 text-sm text-white/70">La sesión termina después de 30 minutos sin actividad.</p>
  </>;
  return <>
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/15 pb-5"><p className="min-w-0 break-words font-bold">{session.name}</p><button className={secondary} disabled={busy} onClick={async () => { try { await request("sesion", "DELETE"); await clearSession(""); } catch { setError("No pudimos confirmar el cierre. Inténtalo nuevamente."); } }}>Cerrar sesión</button></header>
    {error && <p role="alert" className={`mt-5 rounded-xl border p-4 ${pending ? "border-amber-300/30 bg-amber-300/10 text-amber-200" : "border-red-400/40 bg-red-400/10 text-red-200"}`}>{error}</p>}
    {!eventId ? <section className="mt-8"><h1 className="text-3xl font-extrabold">Tus eventos</h1>
      {eventsState === "loading" && <p role="status" className="mt-5">Comprobando eventos asignados…</p>}
      {eventsState === "error" && <button className={`${secondary} mt-5`} onClick={() => void loadEvents()}>Volver a intentar</button>}
      {eventsState === "ready" && !events.length && <p className="mt-5 text-white/70">Aún no tienes eventos asignados. Pide a tu organizadora que te asigne uno.</p>}
      <ul className="mt-6 divide-y divide-white/15">{events.map((event) => <li key={event.id} className="py-5"><h2 className="break-words text-xl font-bold">{event.title}</h2><p className="mt-2 text-sm text-white/70">{formatEventDate(event.date)} · {event.location}</p><p className="mt-2 text-sm text-white/70">{event.available ? "Ingreso disponible" : event.status === "draft" ? "Evento no publicado" : `Ingreso: ${formatEventDate(event.opensAt)} a ${formatEventDate(event.closesAt)}`}</p><button className={`${primary} mt-4`} disabled={!event.available || eventsState !== "ready"} onClick={() => { setEventId(event.id); setError(""); }}>Abrir control de ingreso</button></li>)}</ul>
    </section> : <section className="mt-6 space-y-5">
      <button className={secondary} disabled={busy || !!pending} onClick={() => { setEventId(null); setScanning(false); setResult(null); setRejected(""); setError(""); }}>Volver a eventos</button>
      <h1 className="break-words text-2xl font-bold">{selected?.title ?? "Control de ingreso"}</h1>
      {!canValidate && <p role="status" className="text-amber-200">El ingreso no está disponible. La cuenta, asignación y horario se comprueban en cada solicitud.</p>}
      {busy && <p role="status">Comprobando con el servidor…</p>}
      {result && <div role="status" className="rounded-2xl border border-accent/40 bg-accent/10 p-6"><h2 className="text-2xl font-bold text-accent">{result.replayed ? "Ingreso confirmado previamente" : "Ingreso autorizado"}</h2><p className="mt-3 break-words text-xl font-bold">{result.holderName}</p><p className="mt-2 break-words">{result.ticketTypeName}</p><p className="mt-3 text-sm text-white/70">{formatEventDate(result.validatedAt)}{result.replayed ? " · No se registró un segundo ingreso." : ""}</p></div>}
      {rejected && <div role="alert" className="rounded-2xl border border-red-400/40 bg-red-400/10 p-6 text-red-200"><h2 className="text-2xl font-bold">Ingreso rechazado</h2><p className="mt-3">{rejected}</p></div>}
      {pending && <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5"><h2 className="font-bold text-amber-200">Operación pendiente de confirmar</h2><p className="mt-2 text-sm">No autorices otro ingreso hasta recuperar este resultado. Para reenviar, utiliza la misma entrada.</p><button className={`${secondary} mt-4`} disabled={busy} onClick={() => void recover()}>Comprobar resultado</button></div>}
      {scanning && canValidate && <CameraScanner onRead={onRead} onError={onCameraError} />}
      {cameraError && <p role="alert" className="text-amber-200">{cameraError}</p>}
      {!scanning && <button className={`${primary} w-full`} disabled={busy || !canValidate} onClick={() => { setResult(null); setRejected(""); setError(""); setCameraError(""); setScanning(true); }}>{result || rejected ? "Escanear siguiente" : pending ? "Leer la misma entrada" : "Activar cámara"}</button>}
      {scanning && <button className={secondary} onClick={() => setScanning(false)}>Detener cámara</button>}
      <form className="border-t border-white/15 pt-5" onSubmit={(event) => { event.preventDefault(); void validate(code, "manual"); }}><label className="block font-semibold">Código de la entrada<input className={field} value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={1024} required disabled={busy || !canValidate} /></label><p className="mt-2 text-sm text-white/70">Copia los 64 caracteres que aparecen en el boleto.</p><button className={`${secondary} mt-4 w-full`} disabled={busy || !canValidate || !code.trim()}>Validar código</button></form>
    </section>}
  </>;
}
