"use client";

import Link from "next/link";
import { useBuyerSession } from "@/hooks/use-buyer-session";

export default function HomeNavigation() {
  const { session, checking } = useBuyerSession();
  return (
    <nav aria-label="Navegación principal" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
      <Link href="/organizador" className="inline-flex min-h-11 items-center text-white/75 hover:text-accent">
        {session ? "Administrar eventos" : "Organizar evento"}
      </Link>
      {checking ? (
        <span role="status" className="inline-flex min-h-11 items-center text-white/70">Comprobando sesión…</span>
      ) : (
        <Link href="/mis-boletos" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 py-3 font-bold text-background hover:bg-accent/90">
          {session ? "Mis boletos" : "Iniciar sesión"}
        </Link>
      )}
    </nav>
  );
}
