import type { ApiErrorCode } from "@/lib/domain";

export const accessField = "mt-2 min-h-11 w-full rounded-xl border border-white/20 bg-[#211b2e] px-4 py-3 text-white outline-none focus:border-accent disabled:opacity-60";
export const accessPrimary = "min-h-11 rounded-full bg-accent px-5 py-3 font-bold text-[#171321] hover:bg-accent/90 disabled:opacity-50";
export const accessSecondary = "min-h-11 rounded-full border border-white/25 px-4 py-2 font-semibold hover:border-accent hover:text-accent disabled:opacity-50";
const messages: Partial<Record<ApiErrorCode, string>> = {
  accessCredentialsInvalid: "No pudimos iniciar sesión. Revisa el enlace, usuario y contraseña.",
  accessSessionExpired: "Tu sesión terminó por inactividad. Inicia sesión nuevamente.",
  sessionRequired: "Inicia sesión para continuar.", staffAccessDenied: "Tu cuenta no tiene acceso vigente. Consulta con la organizadora.",
  eventUnavailable: "No tienes acceso a este evento.", accessEventUnavailable: "El evento no está habilitado para recibir asistentes.",
  accessOutsideWindow: "El ingreso está fuera del día y margen autorizados.", accessCodeInvalid: "El código no tiene el formato de una entrada de Doorlist.",
  accessTicketNotFound: "No encontramos una entrada válida para este evento con ese código.",
  accessTicketUsed: "Esta entrada ya fue utilizada. No permite un nuevo ingreso.",
  accessTicketRevoked: "Esta entrada fue revocada. No permite el ingreso.",
  accessOperationConflict: "La operación pendiente corresponde a otra entrada. Recupera su resultado antes de continuar.",
  accessRateLimited: "Hay demasiadas solicitudes. Espera un minuto antes de volver a intentar.",
  invalidData: "Revisa los datos e inténtalo de nuevo.", payloadTooLarge: "El código excede el tamaño permitido.",
};
export function accessMessage(code: string) {
  return messages[code as ApiErrorCode] ?? "No pudimos conectar con el servicio. Vuelve a intentarlo.";
}
export function validAccessLink(value: string) { return /^[0-9a-f]{64}$/.test(value); }
export function validAccessGrace(value: number) { return Number.isInteger(value) && value >= 0 && value <= 720 && value % 30 === 0; }
export async function codeFingerprint(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// A lost/aborted response is an uncertain operation, never a ticket rejection.
export async function fetchAccess(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}
