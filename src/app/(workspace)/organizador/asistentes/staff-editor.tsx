"use client";

import { useRef, useState, type FormEvent } from "react";
import type { StaffEvent, StaffMember } from "@/lib/domain";
import { formatEventDate } from "@/lib/date";
import { normalizeStaffUsername, validStaffName, validStaffPassword, validStaffUsername } from "@/lib/staff-member-validation";

export type EditorMode = "create" | "edit" | "events" | "password" | "complete";
export const primaryButton = "rounded-full bg-accent px-5 py-3 font-bold text-[#171321] hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton = "rounded-full border border-white/25 px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";
const field = "mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:border-accent disabled:opacity-60";

function EventSelector({ events, selected, disabled, onChange }: {
  events: StaffEvent[]; selected: string[]; disabled: boolean; onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const visible = events.filter((event) => event.title.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es")));
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="text-lg font-bold">Eventos asignados <span className="text-sm font-normal text-white/70">({selected.length})</span></legend>
    <p className="mt-2 text-sm text-white/70">Puedes guardar sin eventos y asignarlos después.</p>
    {events.length > 0 && <label className="mt-4 block text-sm font-semibold">Buscar evento<input type="search" className={field} value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
    <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-white/15">
      {!events.length && <p className="p-4 text-sm text-white/70">Aún no tienes eventos para asignar.</p>}
      {events.length > 0 && !visible.length && <p className="p-4 text-sm text-white/70">No hay eventos que coincidan con la búsqueda.</p>}
      {visible.map((event) => <label key={event.id} className="flex cursor-pointer items-start gap-3 border-b border-white/15 p-4 last:border-b-0 hover:bg-white/5">
        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-accent" checked={selected.includes(event.id)} onChange={(input) => onChange(input.target.checked ? [...selected, event.id] : selected.filter((id) => id !== event.id))} />
        <span className="min-w-0"><span className="block break-words font-semibold">{event.title}</span><span className="mt-1 block text-sm text-white/70">{event.status === "draft" ? "Borrador" : "Publicado"} · {formatEventDate(event.date)}</span></span>
      </label>)}
    </div>
  </fieldset>;
}

export default function StaffEditor({ mode, member, events, busy, error, onCancel, onSave }: {
  mode: EditorMode; member: StaffMember | null; events: StaffEvent[]; busy: boolean; error: string;
  onCancel: () => void; onSave: (values: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [username, setUsername] = useState(member?.username ?? "");
  const [eventIds, setEventIds] = useState(member?.eventIds ?? []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [validation, setValidation] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const needsPassword = ["create", "password", "complete"].includes(mode);
  const titles: Record<EditorMode, string> = { create: "Agregar asistente", edit: "Editar asistente", events: "Asignar eventos", password: "Cambiar contraseña", complete: "Completar creación" };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setValidation("");
    if ((mode === "create" || mode === "edit") && (!validStaffName(name) || !validStaffUsername(username))) {
      setValidation("Escribe un nombre de hasta 200 caracteres y un usuario válido de 3 a 32 caracteres."); return;
    }
    if (needsPassword && (!validStaffPassword(password) || password !== confirmation)) {
      setValidation(password !== confirmation ? "Las contraseñas no coinciden." : "La contraseña debe tener al menos 8 caracteres y no superar 72 bytes. Las letras con tilde pueden ocupar más de un byte."); return;
    }
    const values = mode === "create" ? { name: name.trim(), username: normalizeStaffUsername(username), password, eventIds }
      : mode === "edit" ? { name: name.trim(), username: normalizeStaffUsername(username) }
        : mode === "events" ? { eventIds } : { password };
    const saved = await onSave(values);
    // Never keep credentials in the editor after an attempted network operation.
    if (needsPassword) { setPassword(""); setConfirmation(""); }
    if (!saved) heading.current?.focus();
  }

  return <section aria-labelledby="staff-editor-title" className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-6 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 id="staff-editor-title" tabIndex={-1} ref={heading} className="text-2xl font-bold">{titles[mode]}</h2>{member && <p className="mt-2 break-words text-white/70">{member.name} · {member.username}</p>}</div>
      <button type="button" className={secondaryButton} disabled={busy} onClick={onCancel}>Cerrar formulario</button>
    </div>
    <form className="mt-6 space-y-6" onSubmit={(event) => void submit(event)} aria-busy={busy}>
      {(mode === "create" || mode === "edit") && <div className="grid gap-5 sm:grid-cols-2">
        <label className="block font-semibold">Nombre<input className={field} required maxLength={200} autoComplete="off" value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        <label className="block font-semibold">Nombre de usuario<input className={field} required minLength={3} maxLength={32} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} aria-describedby="staff-username-help" value={username} disabled={busy} onChange={(event) => setUsername(event.target.value)} onBlur={() => setUsername(normalizeStaffUsername(username))} /><span id="staff-username-help" className="mt-2 block text-sm font-normal text-white/70">De 3 a 32 caracteres: letras sin tildes, números, punto, guion y guion bajo. Se guardará en minúsculas.</span></label>
      </div>}
      {needsPassword && <div>
        {mode === "complete" && <p className="mb-5 max-w-prose text-sm text-white/70">Retoma la creación sin duplicar la cuenta. Si la contraseña ya se había establecido, se conservará; después podrás cambiarla.</p>}
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block font-semibold">{mode === "create" ? "Contraseña inicial" : "Nueva contraseña"}<input type="password" autoComplete="new-password" className={field} required minLength={8} maxLength={72} value={password} disabled={busy} aria-describedby="staff-password-help" onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="block font-semibold">Confirmar contraseña<input type="password" autoComplete="new-password" className={field} required minLength={8} maxLength={72} value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} /></label>
        </div>
        <p id="staff-password-help" className="mt-3 max-w-prose text-sm text-white/70">Al menos 8 caracteres y un máximo de 72 bytes. No podrás consultarla después de establecerla. El servicio puede exigir mayor seguridad.</p>
        {mode === "password" && <label className="mt-5 flex items-start gap-3 text-sm"><input className="mt-1 size-4 shrink-0 accent-accent" type="checkbox" required disabled={busy} /><span>Confirmo que quiero reemplazar la contraseña de {member?.name}.</span></label>}
      </div>}
      {(mode === "create" || mode === "events") && <EventSelector events={events} selected={eventIds} disabled={busy} onChange={setEventIds} />}
      {(validation || error) && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-4 text-red-200">{validation || error}</p>}
      <div className="flex flex-wrap gap-3"><button className={primaryButton} disabled={busy}>{busy ? "Guardando…" : mode === "create" ? "Crear asistente" : mode === "password" ? "Establecer contraseña" : mode === "complete" ? "Completar creación" : "Guardar cambios"}</button><button type="button" className={secondaryButton} disabled={busy} onClick={onCancel}>Cancelar</button></div>
    </form>
  </section>;
}
