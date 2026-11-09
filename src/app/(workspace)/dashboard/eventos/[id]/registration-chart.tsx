import { useEffect, useState } from "react";
import { formatCalendarDate, formatCalendarDay } from "@/lib/date";
import type { RegistrationHistoryResponse } from "@/lib/domain";

export default function RegistrationChart({ eventId, token }: { eventId: string; token: string }) {
  const [data, setData] = useState<RegistrationHistoryResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setStatus("loading");
      try {
        const response = await fetch(`/api/organizador/eventos/${encodeURIComponent(eventId)}/registros-por-dia`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("Request failed");
        const result = await response.json() as RegistrationHistoryResponse;
        if (!controller.signal.aborted) { setData(result); setStatus("ready"); }
      } catch { if (!controller.signal.aborted) setStatus("error"); }
    }
    void load();
    return () => controller.abort();
  }, [eventId, token, retry]);

  const max = Math.max(1, ...(data?.days.map((day) => day.count) ?? []));
  return <section aria-labelledby="registration-history-title" className="mt-12 border-t border-white/15 pt-8">
    <h2 id="registration-history-title" className="text-2xl font-bold">Registros por d&#237;a</h2>
    <div className="mt-5 rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-6">
      {status === "loading" && <p role="status" className="text-sm text-white/70">Cargando gr&#225;fica&#8230;</p>}
      {status === "error" && <div role="alert" className="text-sm text-red-200">No pudimos cargar la gr&#225;fica. <button type="button" className="font-bold underline" onClick={() => setRetry((value) => value + 1)}>Volver a intentar</button></div>}
      {status === "ready" && data && (!data.publishedAt ? <p className="text-sm text-white/70">La gr&#225;fica estar&#225; disponible cuando publiques el evento.</p> : <>
        <p className="text-sm text-white/60">Registros diarios &#183; hora de Guatemala</p>
        {data.estimated && <p className="mt-2 text-sm text-white/60">La fecha de publicaci&#243;n no est&#225; disponible; se muestran los datos desde la creaci&#243;n del evento.</p>}
        {data.days.length === 0 ? <p className="mt-5 text-sm text-white/60">A&#250;n no hay datos diarios para mostrar.</p> : <div className="mt-5 overflow-x-auto" tabIndex={0} aria-label="Gr&#225;fica de registros por d&#237;a, desplazable horizontalmente">
          <div className="flex h-60 items-stretch gap-3 border-b border-white/20 px-1" style={{ width: `${Math.max(100, data.days.length * 56)}px` }}>
            {data.days.map((day) => <div key={day.date} className="flex h-full w-11 shrink-0 flex-col items-center" title={`${formatCalendarDate(day.date)}: ${day.count} registros`}>
              <div className="flex w-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-xs text-white/70">{day.count.toLocaleString("es-GT")}</span>
                <div className="w-7 rounded-t-md bg-accent" style={{ height: `${day.count / max * 75}%`, minHeight: day.count ? "4px" : "0" }} />
              </div>
              <time dateTime={day.date} className="mt-2 h-8 whitespace-nowrap text-[10px] text-white/60">{formatCalendarDay(day.date)}</time>
              <span className="sr-only">{formatCalendarDate(day.date)}: {day.count} registros</span>
            </div>)}
          </div>
        </div>}
      </>)}
    </div>
  </section>;
}

