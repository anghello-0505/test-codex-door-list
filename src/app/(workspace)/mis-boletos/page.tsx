"use client";

import AccountForm from "@/components/account-form";
import BuyerTickets from "@/components/buyer-tickets";
import { useBuyerSession } from "@/hooks/use-buyer-session";
import { supabase } from "@/lib/supabase/client";

export default function MyTickets() {
  const { session, checking } = useBuyerSession();

  return <div className="mx-auto min-h-svh max-w-6xl px-5 pb-16 sm:px-10">
    <main className="py-12"><p className="text-xs font-bold uppercase tracking-widest text-accent">Panel del comprador</p><h1 className="mt-3 text-4xl font-extrabold tracking-tight">Mis boletos<span className="text-accent">.</span></h1><p className="mt-4 text-white/70">Consulta los boletos que adquiriste y los datos de cada titular.</p>
      {!supabase ? <p role="alert" className="mt-8">El acceso a tus boletos no está configurado.</p> : checking ? <p role="status" className="mt-8">Comprobando sesión…</p> : !session ? <section className="mt-8 max-w-md rounded-2xl border border-white/15 bg-white/5 p-6"><AccountForm returnTo="/mis-boletos" /></section> : <>
        <p className="mt-5 break-all text-sm text-white/60">Cuenta: {session.user.email}</p>
        <BuyerTickets key={session.user.id} buyerId={session.user.id} />
      </>}
    </main>
  </div>;
}
