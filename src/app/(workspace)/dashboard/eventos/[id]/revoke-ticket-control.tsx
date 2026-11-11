"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Registration, TicketDeliveryStatus } from "@/lib/domain";
import { validRevocationReason, type TicketRevocationResponse } from "@/lib/ticket-revocation";
import { ticketStatusLabels } from "@/lib/ticket-code";

const emailLabels: Partial<Record<TicketDeliveryStatus, string>> = {
  pending: "El aviso está pendiente. Puedes reintentar su envío.",
  sending: "El aviso se está procesando. Espera un minuto antes de comprobarlo.",
  accepted: "El proveedor aceptó el aviso para el titular.",
  failed: "El envío del aviso no se confirmó. Puedes reintentarlo después de un minuto.",
  review: "El aviso requiere revisión de la organización; no se reenvía automáticamente para evitar duplicados.",
};

export default function RevokeTicketControl({ registration, eventId, token }: { registration: Registration; eventId: string; token: string }) {
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(registration.revocation?.reason ?? "");
  const [revocation, setRevocation] = useState(registration.revocation);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const status = revocation ? "revoked" : registration.ticket?.status;
  if (!status) return <span>Estado no disponible</span>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validRevocationReason(reason)) return;
    setPending(true); setError("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch(`/api/organizador/eventos/${encodeURIComponent(eventId)}/entradas/${encodeURIComponent(registration.id)}/revocar`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }), signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 401) setError("Tu sesión venció. Inicia sesión de nuevo y actualiza el evento.");
        else if (response.status === 409) setError("La entrada ya no está válida o tiene otro motivo registrado. Actualiza el evento para comprobar su estado.");
        else if (response.status === 404) setError("No tienes acceso a esta entrada. Actualiza el evento.");
        else { setUncertain(true); setError("No pudimos confirmar la operación o el servicio de correo. Comprueba y reintenta con el mismo motivo."); }
        return;
      }
      const result = await response.json() as TicketRevocationResponse;
      if (abort.signal.aborted) return;
      if (result.ticketStatus !== "revoked" || !emailLabels[result.emailStatus]) throw new Error("Invalid response");
      setRevocation({ reason: result.reason, emailStatus: result.emailStatus });
      setReason(result.reason); setUncertain(false); setEditing(false);
    } catch {
      if (!abort.signal.aborted) { setUncertain(true); setError("No pudimos confirmar la operación. Comprueba y reintenta con el mismo motivo."); }
    } finally { if (!abort.signal.aborted) setPending(false); }
  }

  const canRetry = revocation && ["pending", "sending", "failed"].includes(revocation.emailStatus);
  return <div className="min-w-52 max-w-sm space-y-3">
    <p className="font-semibold text-white">{ticketStatusLabels[status]}</p>
    {revocation && <div role="status" className="space-y-2 text-sm text-white/70"><p className="whitespace-pre-wrap break-words">Motivo: {revocation.reason}</p><p>{emailLabels[revocation.emailStatus]}</p></div>}
    {status === "valid" && !editing && !uncertain && <button type="button" onClick={() => setEditing(true)} className="min-h-11 rounded-full border border-red-300/50 px-4 py-2 text-sm font-semibold text-red-200 hover:border-red-200">Revocar entrada</button>}
    {(editing || uncertain || canRetry) && <form onSubmit={submit} className="space-y-3">
      {!revocation && <><label htmlFor={inputId} className="block text-sm font-semibold text-white">Motivo para el titular</label><textarea id={inputId} value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={1000} rows={3} disabled={pending || uncertain} aria-describedby={`${inputId}-help`} className="w-full rounded-xl border border-white/20 bg-[#211b2e] px-4 py-3 text-white focus:border-accent disabled:opacity-60" /><p id={`${inputId}-help`} className="text-sm text-white/70">Se enviará al titular por correo. La revocación es definitiva y no libera el cupo.</p></>}
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={pending || !validRevocationReason(reason)} className="min-h-11 rounded-full border border-red-300/50 px-4 py-2 text-sm font-semibold text-red-200 hover:border-red-200 disabled:opacity-50">{pending ? "Procesando…" : revocation ? "Comprobar y reintentar aviso" : uncertain ? "Comprobar y reintentar" : "Confirmar revocación"}</button>{editing && !uncertain && !pending && <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold hover:border-accent">Cancelar</button>}</div>
    </form>}
    {pending && <p role="status" className="text-sm text-white/70">Comprobando la entrada y el aviso…</p>}
    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
  </div>;
}
