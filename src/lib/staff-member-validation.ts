import { isUuid } from "@/lib/validation";

export const staffPageSize = 50;
export const maxStaffEvents = 1000;
export const staffBodyLimit = 65536;

export function normalizeStaffUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validStaffName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 &&
    Array.from(value.trim()).length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
}

export function validStaffUsername(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9._-]{3,32}$/.test(normalizeStaffUsername(value));
}

export function validStaffPassword(value: unknown): value is string {
  return typeof value === "string" && Array.from(value).length >= 8 &&
    new TextEncoder().encode(value).length <= 72 && !value.includes("\u0000");
}

export function validStaffEventIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= maxStaffEvents && value.every(isUuid) &&
    new Set(value.map((id: string) => id.toLowerCase())).size === value.length;
}

export function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function staffErrorMessage(code: string) {
  const messages: Record<string, string> = {
    sessionRequired: "Tu sesión terminó. Inicia sesión nuevamente.",
    staffAccessDenied: "Esta cuenta no puede administrar personal de acceso.",
    invalidData: "Revisa el nombre, el usuario y los campos obligatorios.",
    payloadTooLarge: "La solicitud es demasiado grande. Reduce la cantidad de eventos.",
    staffUsernameTaken: "Ya tienes un asistente con ese usuario, incluso si está desactivado.",
    staffConflict: "Los datos cambiaron o esta operación ya no está disponible. Actualiza la lista.",
    staffInvalidEvents: "Alguno de los eventos ya no está disponible para tu cuenta. Actualiza la lista.",
    staffNotConfigured: "La administración de personal aún no está disponible. Contacta al administrador.",
    staffCreationPending: "No pudimos confirmar la creación. Actualiza la lista y usa «Completar creación» si aparece pendiente. No crees otra cuenta.",
    staffPasswordRejected: "La contraseña no cumple los requisitos de seguridad. Usa al menos 8 caracteres y un máximo de 72 bytes; el proveedor puede exigir más.",
    staffPasswordUnconfirmed: "No pudimos confirmar el cambio de contraseña. Vuelve a establecerla antes de compartirla.",
  };
  return messages[code] ?? "No pudimos completar la operación. Vuelve a intentarlo.";
}
