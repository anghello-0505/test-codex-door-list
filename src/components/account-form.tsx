"use client";

import { useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";

const field = "mt-2 w-full rounded-xl border border-white/20 bg-[#211b2e] px-4 py-3 text-white outline-none focus:border-accent disabled:opacity-60";

export default function AccountForm({ returnTo, onAuthenticated }: { returnTo: string; onAuthenticated?: () => void }) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);

  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || lock.current) return;
    lock.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      // Destinations are supplied by the app, and must always remain same-origin.
      const destination = new URL(returnTo, window.location.origin);
      if (destination.origin !== window.location.origin) throw new Error("Invalid destination");
      const result = signup
        ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: destination.href } })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) {
        setError(signup ? "No pudimos crear la cuenta. Revisa los datos o intenta iniciar sesión si ya tienes cuenta." : "No pudimos iniciar sesión. Revisa tus credenciales y verifica tu correo si corresponde.");
      } else {
        setPassword("");
        if (signup && !result.data.session) setMessage("Revisa tu correo para verificar la cuenta. Después podrás volver a esta página e iniciar sesión.");
        onAuthenticated?.();
      }
    } catch { setError("No pudimos conectar. Inténtalo de nuevo."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <>
    <h2 className="text-2xl font-bold">{signup ? "Crear cuenta" : "Iniciar sesión"}</h2>
    <p className="mt-3 text-sm text-white/70">Accede a tu cuenta para consultar o adquirir boletos para ti o para otra persona.</p>
    <form onSubmit={authenticate} className="mt-5 space-y-4">
      <label className="block">Correo de tu cuenta<input className={field} type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="block">Contraseña<input className={field} type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 8 : undefined} value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} /></label>
      <button className="rounded-full bg-accent px-5 py-3 font-bold text-[#171321] hover:bg-accent/90 disabled:opacity-50" disabled={busy}>{busy ? "Procesando…" : signup ? "Crear cuenta" : "Entrar"}</button>
    </form>
    <button className="mt-5 text-sm text-accent" disabled={busy} onClick={() => { setSignup(!signup); setError(""); setMessage(""); }}>{signup ? "Ya tengo una cuenta" : "Crear una cuenta nueva"}</button>
    {error && <p role="alert" className="mt-4 text-red-200">{error}</p>}
    {message && <p role="status" className="mt-4 text-accent">{message}</p>}
  </>;
}
