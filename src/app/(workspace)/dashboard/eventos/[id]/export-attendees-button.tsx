"use client";

import { useEffect, useRef, useState } from "react";
import { downloadCsv } from "@/lib/csv";

export default function ExportAttendeesButton({ eventId, token }: { eventId: string; token: string }) {
  const pending = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => () => { pending.current?.abort(); }, [eventId, token]);

  async function download() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setStatus("loading");
    try {
      const response = await fetch(`/api/organizador/eventos/${encodeURIComponent(eventId)}/asistentes/exportar`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      downloadCsv(blob, `asistentes-${eventId}.csv`);
      setStatus("success");
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  return <div className="mt-5">
    <button type="button" onClick={() => void download()} disabled={status === "loading"} aria-describedby="export-description" className="rounded-full bg-accent px-5 py-3 font-bold text-[#171321] hover:bg-accent/90 disabled:cursor-wait disabled:opacity-50">
      {status === "loading" ? "Preparando CSV…" : "Descargar asistentes CSV"}
    </button>
    <p id="export-description" className="mt-3 max-w-2xl text-sm text-white/70">Incluye todas las entradas válidas, sin usar ni revocar. Fechas en hora de Guatemala. Sin entradas válidas, el CSV contendrá solo los encabezados.</p>
    <p role="status" className="mt-2 text-sm text-white/70">{status === "loading" ? "Preparando la lista de asistentes…" : status === "success" ? "Archivo preparado para descargar." : ""}</p>
    {status === "error" && <p role="alert" className="mt-3 rounded-2xl border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-200">No pudimos descargar los asistentes. Vuelve a intentarlo con el botón de descarga.</p>}
  </div>;
}
