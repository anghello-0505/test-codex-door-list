"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

function formatUpdatedAt(date: Date) {
  return date.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
}

export default function TicketRefreshControl() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const refresh = useCallback(() => {
    if (pending) return;
    startTransition(() => {
      router.refresh();
      setUpdatedAt(new Date());
    });
  }, [pending, router]);

  useEffect(() => {
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <button type="button" className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-50" disabled={pending} onClick={refresh}>
        {pending ? "Actualizando estado…" : "Actualizar estado"}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-white/70">
        {pending ? "Actualizando el estado de tu entrada…" : `Estado consultado a las ${formatUpdatedAt(updatedAt)}`}
      </p>
    </div>
  );
}
