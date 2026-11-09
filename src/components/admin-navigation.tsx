"use client";

import Link from "next/link";
import { useState } from "react";
import { useBuyerSession } from "@/hooks/use-buyer-session";
import { supabase } from "@/lib/supabase/client";

export default function AdminNavigation() {
  const { session, checking } = useBuyerSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (checking || !session) return null;

  async function signOut() {
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) setError("No pudimos cerrar la sesión. Inténtalo de nuevo.");
    } catch {
      setError("No pudimos cerrar la sesión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="border-b border-white/15 bg-white/[0.03]">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-10">
      <Link href="/" className="mr-2 text-xl font-extrabold tracking-tight">doorlist<span className="text-accent">.</span></Link>
      <nav aria-label="Navegación de cuenta" className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
        <Link href="/dashboard" className="text-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Mis eventos</Link>
        <Link href="/mis-boletos" className="text-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Mis boletos</Link>
        <Link href="/organizador" className="text-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Administrar eventos</Link>
      </nav>
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-full border border-white/20 px-4 py-2 text-sm font-semibold hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Cuenta<span className="ml-2 text-accent" aria-hidden="true">⌄</span>
        </summary>
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-white/15 bg-[#211b2e] p-4 shadow-xl">
          <p className="break-all text-sm text-white/70">{session.user.email}</p>
          <button type="button" className="mt-4 w-full rounded-full border border-white/20 px-4 py-2 text-left text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-50" disabled={busy} onClick={() => void signOut()}>
            {busy ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
          {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
        </div>
      </details>
    </div>
  </div>;
}
