import { Suspense } from "react";
import Registration from "./registro";

type Props = { params: Promise<{ id: string }> };

async function EventRegistration({ params }: Props) {
  const { id } = await params;
  return <Registration key={id} id={id} />;
}

export default function Page({ params }: Props) {
  return <Suspense fallback={<p role="status" className="p-8">Cargando evento…</p>}><EventRegistration params={params} /></Suspense>;
}
