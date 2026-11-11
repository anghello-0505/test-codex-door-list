import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { validAccessLink } from "@/lib/access-control";
import AccessWorkspace from "@/components/access-control/access-workspace";

export const metadata: Metadata = { title: "Control de ingreso | Doorlist", robots: { index: false, follow: false }, referrer: "no-referrer" };
async function AccessPage({ params }: { params: Promise<{ identificador: string }> }) {
  const { identificador } = await params;
  if (!validAccessLink(identificador)) notFound();
  return <AccessWorkspace link={identificador} />;
}
export default function Page(props: { params: Promise<{ identificador: string }> }) {
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-8 sm:px-8"><Suspense fallback={<p role="status">Preparando control de ingreso…</p>}><AccessPage {...props} /></Suspense></main>;
}
