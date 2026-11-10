import ValidationHistory from "./validation-history";
import { Suspense } from "react";
export default function Page() {
  return <main className="mx-auto min-h-screen max-w-6xl px-5 pb-16 pt-12 sm:px-10"><h1 className="text-4xl font-extrabold">Historial de ingreso</h1><p className="mt-3 text-white/70">Ingresos y rechazos de tu personal. Los registros permanecen aunque elimines un evento.</p><Suspense fallback={<p role="status">Preparando historial…</p>}><ValidationHistory /></Suspense></main>;
}
