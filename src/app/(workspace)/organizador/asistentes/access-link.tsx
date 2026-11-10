"use client";

import { useState } from "react";
import { useBuyerSession } from "@/hooks/use-buyer-session";
import { accessPrimary, accessSecondary } from "@/lib/access-control";

export default function AccessLink() {
  const { session } = useBuyerSession();
  return session ? <AccessLinkContent key={session.user.id} token={session.access_token} /> : null;
}

function AccessLinkContent({ token }: { token: string }) {
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [copied, setCopied] = useState(false);
  async function load() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/organizador/acceso", { method: "POST", cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("lookup");
      const result = await response.json();
      if (typeof result.path !== "string" || !/^\/acceso\/[0-9a-f]{64}$/.test(result.path)) throw new Error("Invalid link");
      setUrl(new URL(result.path, window.location.origin).href);
    } catch { setError("No pudimos consultar el enlace. Comprueba que la etapa de acceso esté configurada y vuelve a intentar."); }
    finally { setBusy(false); }
  }
  return <section className="mb-8 rounded-2xl border border-white/15 bg-white/5 p-6" aria-labelledby="access-link-heading">
    <h2 id="access-link-heading" className="text-2xl font-bold">Enlace del personal</h2>
    <p className="mt-3 text-sm text-white/70">Comparte este enlace fijo con tu equipo. Cada persona necesitará su usuario, contraseña y una asignación vigente.</p>
    {!url ? <button className={`${accessSecondary} mt-4`} disabled={busy} onClick={() => void load()}>{busy ? "Consultando…" : "Consultar enlace fijo"}</button> : <div className="mt-4 space-y-3"><label className="block text-sm font-semibold">Enlace de acceso<input readOnly value={url} onFocus={(event) => event.target.select()} className="mt-2 w-full rounded-xl border border-white/20 bg-[#211b2e] px-4 py-3 text-sm" /></label><button className={accessPrimary} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setError(""); } catch { setError("Selecciona el enlace y cópialo manualmente."); } }}>Copiar enlace</button>{copied && <p role="status" className="text-sm text-accent">Enlace copiado.</p>}</div>}
    {error && <p role="alert" className="mt-4 text-red-200">{error}</p>}
  </section>;
}
