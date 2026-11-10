"use client";

import { useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function RefreshTicket() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refresh = useCallback(() => {
    if (!pending) startTransition(() => router.refresh());
  }, [pending, router]);

  useEffect(() => {
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [refresh]);

  return <button type="button" className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-50" disabled={pending} aria-live="polite" onClick={refresh}>{pending ? "Actualizando estado…" : "Actualizar estado"}</button>;
}
