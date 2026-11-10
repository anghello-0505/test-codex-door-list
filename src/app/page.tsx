import Link from "next/link";
import EventsCatalog from "./events-catalog";
import HomeNavigation from "./home-navigation";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-5 sm:px-10">
      <a href="#main-content" className="sr-only rounded-full bg-accent px-5 py-3 font-bold text-background focus:not-sr-only focus:fixed focus:left-5 focus:top-4 focus:z-50">Saltar a los eventos</a>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-white/15 py-5">
        <Link href="/" aria-label="Doorlist, inicio" className="inline-flex min-h-11 items-center text-2xl font-extrabold tracking-tight">doorlist<span className="text-accent">.</span></Link>
        <HomeNavigation />
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 py-10 sm:py-14">
        <h1 className="max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">La agenda se abre cuando decides salir<span className="text-accent">.</span></h1>
        <p className="mt-5 max-w-prose text-lg leading-relaxed text-white/75">Eventos publicados, entradas claras y un lugar para volver cuando llegue el momento.</p>
        <EventsCatalog />
        <section aria-label="Opciones de Doorlist" className="mt-16 grid border-t border-white/15 pt-8 sm:grid-cols-2 sm:divide-x sm:divide-white/15 sm:pt-10">
          <div className="pb-10 sm:pr-10 sm:pb-0">
            <h2 className="max-w-sm text-2xl font-bold tracking-tight">Tu entrada sigue contigo.</h2>
            <p className="mt-3 max-w-prose leading-relaxed text-white/70">Después de confirmar un registro, vuelve a tus boletos para consultar tu entrada y su código QR.</p>
            <Link href="/mis-boletos" className="mt-5 inline-flex min-h-11 items-center font-semibold text-accent hover:underline">Abrir mis boletos</Link>
          </div>
          <div className="border-t border-white/15 pt-10 sm:border-t-0 sm:pl-10 sm:pt-0">
            <h2 className="max-w-sm text-2xl font-bold tracking-tight">¿Tienes algo que convocar?</h2>
            <p className="mt-3 max-w-prose leading-relaxed text-white/70">Crea un evento, define sus tipos de entrada y consulta la información de los asistentes desde tu cuenta.</p>
            <Link href="/organizador" className="mt-5 inline-flex min-h-11 items-center font-semibold text-accent hover:underline">Administrar eventos</Link>
          </div>
        </section>
      </main>
      <footer className="flex flex-wrap justify-between gap-3 border-t border-white/15 py-6 text-sm text-white/70">
        <span>Doorlist</span><span>Encuentra tu lugar.</span>
      </footer>
    </div>
  );
}
