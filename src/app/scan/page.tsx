import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { accessField, accessPrimary, validAccessLink } from "@/lib/access-control";
import AccessWorkspace from "@/components/access-control/access-workspace";

export const metadata: Metadata = { title: "Control de ingreso | Doorlist", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function ScanPage({ searchParams }: { searchParams: Promise<{ enlace?: string }> }) {
  const { enlace } = await searchParams;
  const value = typeof enlace === "string" ? enlace.trim() : "";
  const identifier = value.match(/(?:^|\/acceso\/)([0-9a-f]{64})\/?$/)?.[1];
  if (identifier && validAccessLink(identifier)) return <AccessWorkspace link={identifier} />;
  return <>
    <Link href="/" className="text-xl font-extrabold">doorlist<span className="text-accent">.</span></Link>
    <h1 className="mt-8 text-3xl font-extrabold">Control de ingreso</h1>
    <p className="mt-3 text-white/70">Introduce el enlace fijo que te compartió tu organizadora. Después inicia sesión con tu cuenta de personal.</p>
    <form action="/scan" className="mt-6 space-y-4">
      <label className="block font-semibold">Enlace del equipo<input name="enlace" className={accessField} autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={2048} required defaultValue={value} /></label>
      {value && <p role="alert" className="text-red-200">Revisa el enlace de acceso de tu equipo e inténtalo nuevamente.</p>}
      <button className={`${accessPrimary} w-full`}>Continuar al ingreso</button>
    </form>
  </>;
}

export default function Page(props: { searchParams: Promise<{ enlace?: string }> }) {
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-8 sm:px-8"><Suspense fallback={<p role="status">Preparando control de ingreso…</p>}><ScanPage {...props} /></Suspense></main>;
}
