"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { StaffEvent, StaffEventsResponse, StaffMember, StaffMembersResponse } from "@/lib/domain";
import { useBuyerSession } from "@/hooks/use-buyer-session";
import { supabase } from "@/lib/supabase/client";
import { staffErrorMessage } from "@/lib/staff-member-validation";
import StaffEditor, { primaryButton, secondaryButton, type EditorMode } from "./staff-editor";

type SensitiveAction = { member: StaffMember; action: "delete" | "deactivate" };

function StaffConfirmation({ value, busy, error, onCancel, onConfirm }: {
  value: SensitiveAction; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const deleting = value.action === "delete";
  return <dialog ref={dialog} aria-labelledby="staff-confirm-title" aria-describedby="staff-confirm-description" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }} className="m-auto max-h-[90vh] w-[min(94vw,36rem)] overflow-y-auto rounded-2xl bg-[#211b2e] p-6 text-white shadow-2xl backdrop:bg-black/75 sm:p-8">
    <h2 id="staff-confirm-title" className="text-2xl font-bold">{deleting ? "Eliminar asistente" : "Desactivar asistente"}</h2>
    <p id="staff-confirm-description" className="mt-4 break-words text-white/70">{deleting ? `Se eliminará la cuenta de ${value.member.name} de tu personal disponible. Se conservarán sus registros históricos y no podrás restaurarla desde este panel.` : `La cuenta de ${value.member.name} quedará desactivada. Conservará sus eventos y podrás reactivarla después.`}</p>
    <form className="mt-6" onSubmit={(event) => { event.preventDefault(); if (!busy && (!deleting || confirmation === value.member.username)) onConfirm(); }}>
      {deleting && <label className="block text-sm font-semibold">Escribe el usuario «{value.member.username}» para confirmar<input className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 outline-none focus:border-accent" autoComplete="off" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} /></label>}
      {error && <p role="alert" className="mt-4 text-red-200">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-3"><button type="button" autoFocus className={secondaryButton} disabled={busy} onClick={onCancel}>Cancelar</button><button type="submit" className={deleting ? "rounded-full bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50" : primaryButton} disabled={busy || (deleting && confirmation !== value.member.username)}>{busy ? "Guardando…" : deleting ? "Eliminar asistente" : "Desactivar cuenta"}</button></div>
    </form>
  </dialog>;
}

class StaffResponseError extends Error {
  constructor(public code: string) { super(staffErrorMessage(code)); }
}

function StaffWorkspace({ session }: { session: Session }) {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [events, setEvents] = useState<StaffEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [mode, setMode] = useState<EditorMode | null>(null);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [sensitive, setSensitive] = useState<SensitiveAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const creationKey = useRef("");
  const mutation = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setStatus("loading");
      try {
        const headers = { Authorization: `Bearer ${session.access_token}` };
        const responses = await Promise.all([
          fetch(`/api/organizador/asistentes?page=${page}`, { headers, signal: controller.signal, cache: "no-store" }),
          fetch("/api/organizador/asistentes/eventos", { headers, signal: controller.signal, cache: "no-store" }),
        ]);
        for (const response of responses) {
          if (!response.ok) {
            const failure = await response.json().catch(() => ({}));
            throw new StaffResponseError(failure.error ?? "staffUnavailable");
          }
        }
        const [list, ownEvents] = await Promise.all([responses[0].json() as Promise<StaffMembersResponse>, responses[1].json() as Promise<StaffEventsResponse>]);
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));
        if (page > lastPage) { setPage(lastPage); return; }
        setMembers(list.staffMembers); setTotal(list.total); setEvents(ownEvents.events); setStatus("ready");
      } catch (failure) {
        if (!controller.signal.aborted) { setError(failure instanceof StaffResponseError ? failure.message : "No pudimos cargar el personal. Vuelve a intentarlo."); setStatus("error"); }
      }
    }
    void load();
    const onFocus = () => setRefresh((value) => value + 1);
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.removeEventListener("focus", onFocus); };
  }, [session.access_token, page, refresh]);

  useEffect(() => {
    if (mode) { editor.current?.scrollIntoView({ block: "start", behavior: "instant" }); editor.current?.querySelector<HTMLElement>("h2")?.focus(); }
  }, [mode, selected]);

  function closeEditor() { setMode(null); setSelected(null); setError(""); heading.current?.focus(); }
  function openEditor(next: EditorMode, member: StaffMember | null = null) {
    if (busy) return;
    if (next === "create") creationKey.current = crypto.randomUUID();
    setError(""); setNotice(""); setSelected(member); setMode(next);
  }

  async function change(path: string, method: string, values?: Record<string, unknown>) {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    const controller = new AbortController(); mutation.current = controller;
    try {
      const response = await fetch(path, {
        method, signal: controller.signal, cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        ...(values ? { body: JSON.stringify(values) } : {}),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new StaffResponseError(failure.error ?? "staffUnavailable");
      }
      if (controller.signal.aborted) return false;
      setNotice("Cambios guardados."); setMode(null); setSelected(null); setSensitive(null);
      setRefresh((value) => value + 1); heading.current?.focus();
      return true;
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof StaffResponseError ? failure.message : "No pudimos confirmar la operación. Actualiza la lista antes de volver a intentarlo.");
        // Always reconcile an interrupted creation with the same reserved row.
        if (method === "POST" && path === "/api/organizador/asistentes") setRefresh((value) => value + 1);
      }
      return false;
    } finally {
      locked.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function save(values: Record<string, unknown>) {
    const root = "/api/organizador/asistentes";
    if (mode === "create") return change(root, "POST", { ...values, idempotencyKey: creationKey.current });
    if (!selected) return false;
    if (mode === "edit") return change(`${root}/${selected.id}`, "PATCH", values);
    if (mode === "events") return change(`${root}/${selected.id}/eventos`, "PUT", values);
    return change(`${root}/${selected.id}/${mode === "complete" ? "completar" : "contrasena"}`, "POST", values);
  }

  return <>
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div><h1 tabIndex={-1} ref={heading} className="text-4xl font-extrabold tracking-tight sm:text-5xl">Personal de acceso<span className="text-accent">.</span></h1><p className="mt-4 max-w-prose text-white/70">Administra asistentes y sus eventos. El inicio de sesión del personal se habilitará en una próxima etapa.</p></div>
      <button className={primaryButton} disabled={busy || status !== "ready"} onClick={() => openEditor("create")}>Agregar asistente</button>
    </div>
    {notice && <p role="status" className="mt-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-accent">{notice}</p>}
    {mode && <div ref={editor} className="scroll-mt-6"><StaffEditor key={`${mode}-${selected?.id ?? "new"}`} mode={mode} member={selected} events={events} busy={busy} error={error} onCancel={closeEditor} onSave={save} /></div>}
    {error && !mode && !sensitive && <p role="alert" className="mt-6 rounded-xl border border-red-400/40 bg-red-400/10 p-4 text-red-200">{error}</p>}
    {status === "error" && <button className={`${secondaryButton} mt-4`} onClick={() => { setError(""); setRefresh((value) => value + 1); }}>Volver a intentar</button>}
    <section aria-label="Lista de personal de acceso" aria-busy={status === "loading"} className="mt-8">
      {status === "loading" && <p role="status" className="mb-3 text-sm text-white/70">Cargando asistentes…</p>}
      <div className="overflow-x-auto rounded-2xl border border-white/15 bg-white/5" role="region" aria-label="Tabla de asistentes; desplázate horizontalmente para ver todas las acciones" tabIndex={0}>
        <table className="w-full min-w-[800px] text-left text-sm">
          <caption className="sr-only">Personal de tu cuenta, estado y eventos asignados</caption>
          <thead className="border-b border-white/15 text-xs uppercase tracking-wide text-white/70"><tr>{["Nombre", "Usuario", "Estado", "Eventos", "Acciones"].map((title) => <th key={title} scope="col" className="p-4 font-semibold">{title}</th>)}</tr></thead>
          <tbody>
            {status === "loading" && [0, 1, 2].map((row) => <tr key={row} aria-hidden="true" className="border-b border-white/15 last:border-b-0">{[0, 1, 2, 3, 4].map((column) => <td key={column} className="p-4"><div className="h-3 w-24 rounded bg-white/15 motion-safe:animate-pulse" /></td>)}</tr>)}
            {status === "ready" && members.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-white/70">Aún no tienes asistentes. Usa «Agregar asistente» para crear el primero.</td></tr>}
            {status === "error" && <tr><td colSpan={5} className="p-8 text-center text-white/70">No pudimos cargar el personal.</td></tr>}
            {status === "ready" && members.map((member) => <tr key={member.id} className="border-b border-white/15 align-top last:border-b-0">
              <th scope="row" className="max-w-56 break-words p-4 font-semibold">{member.name}</th><td className="p-4">{member.username}</td>
              <td className="p-4"><span className={member.provisioningStatus === "pending" ? "text-amber-200" : member.isActive ? "text-accent" : "text-white/70"}>{member.provisioningStatus === "pending" ? "Creación pendiente" : member.isActive ? "Activa" : "Desactivada"}</span></td>
              <td className="max-w-64 p-4 text-white/70">{member.eventIds.length ? <ul className="space-y-2">{member.eventIds.map((id) => <li className="break-words" key={id}>{events.find((event) => event.id === id)?.title ?? "Evento no disponible"}</li>)}</ul> : "Sin eventos"}</td>
              <td className="w-72 p-4"><div className="flex flex-wrap gap-2">
                {member.provisioningStatus === "pending" ? <button className={secondaryButton} disabled={busy} onClick={() => openEditor("complete", member)}>Completar creación</button> : <>
                  <button className={secondaryButton} disabled={busy} onClick={() => openEditor("edit", member)}>Editar</button>
                  <button className={secondaryButton} disabled={busy} onClick={() => openEditor("events", member)}>Eventos</button>
                  <button className={secondaryButton} disabled={busy} onClick={() => openEditor("password", member)}>Contraseña</button>
                  <button className={secondaryButton} disabled={busy} onClick={() => { setError(""); if (member.isActive) setSensitive({ member, action: "deactivate" }); else void change(`/api/organizador/asistentes/${member.id}`, "PATCH", { isActive: true }); }}>{member.isActive ? "Desactivar" : "Reactivar"}</button>
                </>}
                <button className={secondaryButton} disabled={busy} onClick={() => { setError(""); setSensitive({ member, action: "delete" }); }}>Eliminar</button>
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {status === "ready" && total > 0 && <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-sm text-white/70"><p>{total} {total === 1 ? "asistente" : "asistentes"} · Página {page} de {Math.max(1, Math.ceil(total / 50))}</p><nav aria-label="Páginas de personal" className="flex gap-3"><button className={secondaryButton} disabled={busy || page === 1} onClick={() => { closeEditor(); setPage(page - 1); }}>Anterior</button><button className={secondaryButton} disabled={busy || page * 50 >= total} onClick={() => { closeEditor(); setPage(page + 1); }}>Siguiente</button></nav></div>}
    </section>
    {sensitive && <StaffConfirmation value={sensitive} busy={busy} error={error} onCancel={() => { setSensitive(null); setError(""); }} onConfirm={() => void change(`/api/organizador/asistentes/${sensitive.member.id}`, sensitive.action === "delete" ? "DELETE" : "PATCH", sensitive.action === "deactivate" ? { isActive: false } : undefined)} />}
  </>;
}

export default function StaffManager() {
  const { session, checking } = useBuyerSession();
  if (checking) return <p role="status" className="text-white/70">Comprobando sesión…</p>;
  if (!supabase || !session) return <><h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Personal de acceso<span className="text-accent">.</span></h1><p className="mt-5 text-white/70">{supabase ? "Inicia sesión para administrar tu personal de acceso." : "El acceso al panel no está configurado."}</p>{supabase && <Link href="/organizador" className={`${primaryButton} mt-6 inline-block`}>Iniciar sesión</Link>}</>;
  if (session.user.app_metadata?.account_type === "access_staff") return <p role="alert" className="text-white/70">Esta cuenta no puede administrar personal de acceso.</p>;
  return <StaffWorkspace key={session.user.id} session={session} />;
}
