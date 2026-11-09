import Link from "next/link";

export default function NotFound() {
  return <main className="mx-auto max-w-xl space-y-5 px-6 py-16"><h1 className="text-3xl font-bold">Entrada no disponible</h1><p className="text-white/70">El enlace no es válido o la entrada ya no está disponible. Comprueba el enlace completo con el comprador.</p><Link href="/" className="inline-block text-accent">Ver eventos</Link></main>;
}
