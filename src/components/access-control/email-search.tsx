"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { accessField, accessSecondary } from "@/lib/access-control";
import type { AccessEmailSearchResponse } from "@/lib/access-email";
import TicketStatus from "@/components/ticket-status";

export default function EmailSearch({ disabled, onSearch, onValidate }: {
  disabled: boolean;
  onSearch: (email: string) => Promise<AccessEmailSearchResponse>;
  onValidate: (code: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [response, setResponse] = useState<AccessEmailSearchResponse | null>(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (disabled || searching) return;
    const current = ++revision.current;
    setSearching(true); setResponse(null); setError("");
    try {
      const data = await onSearch(email);
      if (revision.current === current) setResponse(data);
    } catch (failure) {
      if (revision.current === current) setError(failure instanceof Error ? failure.message : "No pudimos buscar. Inténtalo nuevamente.");
    } finally { if (revision.current === current) setSearching(false); }
  }

  return <section className="border-t border-white/15 pt-5" aria-labelledby="email-search-title">
    <h2 id="email-search-title" className="text-xl font-bold">Buscar por email</h2>
    <p id="email-search-help" className="mt-2 text-sm text-white/70">Si el QR no se puede leer, escribe el email completo del titular de la entrada.</p>
    <form onSubmit={search} className="mt-4">
      <label className="block font-semibold">Email del titular<input className={accessField} type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={254} required aria-describedby="email-search-help" value={email} disabled={disabled || searching} onChange={(event) => { setEmail(event.target.value); setResponse(null); setError(""); }} /></label>
      <button className={`${accessSecondary} mt-4 w-full`} disabled={disabled || searching || !email.trim()}>{searching ? "Buscando…" : "Buscar asistente"}</button>
    </form>
    {searching && <p role="status" className="mt-4">Buscando entradas en este evento…</p>}
    {error && <p role="alert" className="mt-4 text-red-200">{error}</p>}
    {response && <div className="mt-4" aria-live="polite">
      {!response.tickets.length ? <p>No encontramos entradas con ese email en este evento. Revisa el email del titular.</p> : <>
        <p className="text-sm text-white/70">Comprueba el nombre antes de autorizar el ingreso. La búsqueda no valida la entrada.</p>
        <ul className="mt-3 divide-y divide-white/15">{response.tickets.map((ticket) => <li key={ticket.ticketId} className="space-y-3 py-4">
          <p className="break-words font-bold">{ticket.holderName}</p><p className="break-words text-sm text-white/70">{ticket.ticketTypeName}</p>
          <TicketStatus status={ticket.status} />
          {ticket.status === "valid" && <button className={`${accessSecondary} block w-full`} disabled={disabled || searching} onClick={() => { setResponse(null); onValidate(ticket.code); }}>Validar ingreso de {ticket.holderName}</button>}
          {ticket.status !== "valid" && <p className="text-sm text-white/70">Esta entrada no permite un nuevo ingreso.</p>}
        </li>)}</ul>
        {response.truncated && <p className="mt-3 text-amber-200">Se muestran las primeras 20 entradas. Si no aparece la entrada, pide el código del boleto o consulta con la organizadora.</p>}
      </>}
    </div>}
  </section>;
}
