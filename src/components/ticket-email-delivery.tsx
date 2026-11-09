"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiError, TicketDeliveriesResponse, TicketDelivery, TicketDeliveryStatus } from "@/lib/domain";
import { supabase } from "@/lib/supabase/client";

const labels: Record<TicketDeliveryStatus, string> = {
  pending: "Pendiente",
  sending: "Enviando",
  accepted: "Aceptado por Resend",
  failed: "No se pudo confirmar el envío",
  review: "Requiere revisión antes de reintentar",
  blocked: "Envío no disponible para esta entrada",
};

export default function TicketEmailDelivery({ registrationId, buyerId, available = true }: { registrationId: string; buyerId: string; available?: boolean }) {
  const [deliveries, setDeliveries] = useState<TicketDelivery[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const lock = useRef(false);

  useEffect(() => {
    const requests = generation;
    let mounted = true;
    let authorized = true;
    const current = ++requests.current;
    const subscription = supabase?.auth.onAuthStateChange((_event, next) => {
      authorized = next?.user.id === buyerId;
      if (!authorized && mounted) { requests.current++; setDeliveries(null); setError(""); }
    }).data.subscription;
    async function load() {
      try {
        const session = (await supabase?.auth.getSession())?.data.session;
        if (!session || session.user.id !== buyerId) return;
        const response = await fetch(`/api/entradas/correo?registro=${encodeURIComponent(registrationId)}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        if (!mounted || !authorized || current !== requests.current) return;
        if (!response.ok) {
          const failure = await response.json() as ApiError;
          throw new Error(failure.error);
        }
        const result = await response.json() as TicketDeliveriesResponse;
        setDeliveries(result.deliveries); setConfigured(result.configured); setError(""); setNow(Date.now());
      } catch { if (mounted && authorized && current === requests.current) setError("No pudimos consultar el correo. Tu entrada sigue confirmada."); }
    }
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 5000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const focus = () => { void load(); };
    window.addEventListener("focus", focus);
    return () => { mounted = false; requests.current++; subscription?.unsubscribe(); window.clearTimeout(initial); window.clearInterval(interval); window.clearInterval(tick); window.removeEventListener("focus", focus); };
  }, [registrationId, buyerId, refresh]);

  async function retry() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const current = generation.current;
    try {
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!session || session.user.id !== buyerId) throw new Error("session");
      const response = await fetch("/api/entradas/correo", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ registrationId }) });
      if (current !== generation.current) return;
      if (!response.ok) {
        const failure = await response.json() as ApiError;
        if (failure.error === "deliveryNotConfigured") setConfigured(false);
        throw new Error(failure.error);
      }
      const result = await response.json() as TicketDeliveriesResponse;
      setDeliveries(result.deliveries); setConfigured(result.configured); setNow(Date.now());
    } catch { if (current === generation.current) setError("No pudimos completar el envío. Tu entrada sigue confirmada. Puedes consultar el estado e intentarlo de nuevo."); }
    finally { lock.current = false; if (current === generation.current) setBusy(false); }
  }

  const retryable = deliveries?.some((delivery) => ["pending", "failed", "sending"].includes(delivery.status) &&
    (!delivery.lastAttempt || now >= new Date(delivery.lastAttempt).getTime() + 60000) &&
    (!delivery.lockUntil || now >= new Date(delivery.lockUntil).getTime()));
  return <div className="mt-4 space-y-2 border-t border-white/10 pt-3 text-sm" aria-label="Envío de entrada por correo">
    <p className="font-semibold">Entrada por correo y PDF</p>
    {!deliveries && !error && <p role="status" className="text-white/60">Consultando envío…</p>}
    {!configured && <p className="text-amber-200">El envío aún no está configurado. Tu entrada está confirmada y puedes ver su QR.</p>}
    {deliveries?.map((delivery) => <p key={delivery.id} className="break-all text-white/75">{delivery.recipient}: <span role="status">{labels[delivery.status]}</span></p>)}
    {deliveries?.some((delivery) => delivery.status === "accepted") && <p className="text-xs text-white/60">Aceptado para envío; revisa también la carpeta de spam. La entrega al buzón no está verificada.</p>}
    {available && configured && (retryable || deliveries?.length === 0) && <button type="button" disabled={busy} onClick={() => void retry()} className="rounded-full border border-white/25 px-4 py-2 font-semibold text-accent disabled:opacity-50">{busy ? "Enviando entrada…" : deliveries?.length === 0 ? "Enviar entrada por correo" : "Reintentar envío pendiente"}</button>}
    {available && deliveries?.some((delivery) => delivery.status === "failed" || delivery.status === "sending") && !retryable && <p className="text-xs text-white/60">Espera a que termine el intento actual antes de reintentar.</p>}
    {error && <div role="alert"><p className="text-amber-200">{error}</p><button type="button" className="mt-2 underline" onClick={() => setRefresh((value) => value + 1)}>Actualizar estado del correo</button></div>}
  </div>;
}
