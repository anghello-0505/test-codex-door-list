import type {
  AttendeeExportEntry,
  AvailableEvent,
  BuyerEvent,
  EventStatus,
  OrganizerEvent,
  PublicTicket,
  Registration,
  Ticket,
  TicketDelivery,
  TicketDeliveryStatus,
  TicketEmailData,
  TicketStatus,
  TicketType,
} from "@/lib/domain";

type UnknownRecord = Record<string, unknown>;

export function mapAttendeeExportEntries(value: unknown, ticketTypes: TicketType[]): AttendeeExportEntry[] {
  const names = new Map(ticketTypes.map((type) => [type.id, type.name]));
  return records(value).map((entry) => {
    const registration = record(entry.registration);
    const ticketTypeName = names.get(text(registration.tipo_entrada_id));
    if (entry.estado !== "valid" || !text(entry.id) || !ticketTypeName ||
        !text(registration.created_at) || !Number.isFinite(Date.parse(text(registration.created_at)))) {
      throw new Error("Invalid export data");
    }
    return {
      id: text(entry.id),
      holderName: text(registration.nombre_titular),
      holderEmail: text(registration.correo_titular),
      ticketTypeName,
      status: "valid",
      createdAt: text(registration.created_at),
    };
  });
}

const eventStatuses: Record<string, EventStatus> = { borrador: "draft", publicado: "published" };
const deliveryStatuses: Record<string, TicketDeliveryStatus> = {
  pendiente: "pending",
  enviando: "sending",
  aceptado: "accepted",
  fallido: "failed",
  revision: "review",
  bloqueado: "blocked",
};

function record(value: unknown): UnknownRecord {
  return (value && typeof value === "object" ? value : {}) as UnknownRecord;
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function ticketStatus(value: unknown): TicketStatus {
  return value === "used" || value === "revoked" ? value : "valid";
}

function eventStatus(value: unknown): EventStatus {
  return eventStatuses[text(value)] ?? "draft";
}

export function mapAvailableEventsPayload(value: unknown): { serverTime: string; events: AvailableEvent[] } {
  const payload = record(value);
  return {
    serverTime: text(payload.ahora),
    events: records(payload.eventos).map((event) => ({
      id: text(event.id),
      title: text(event.titulo),
      description: text(event.descripcion),
      date: text(event.fecha),
      location: text(event.lugar),
      isOpen: event.abierto === true,
      ticketTypes: records(event.tipos_entrada).map((ticketType) => ({
        id: text(ticketType.id),
        eventId: text(event.id),
        name: text(ticketType.nombre),
        capacity: number(ticketType.aforo_maximo),
        available: number(ticketType.disponibles),
      })),
    })),
  };
}

export function mapOrganizerEvents(value: unknown): OrganizerEvent[] {
  return records(value).map((event) => ({
    id: text(event.id),
    title: text(event.titulo),
    description: text(event.descripcion),
    date: text(event.fecha),
    location: text(event.lugar),
    status: eventStatus(event.estado),
    capacity: number(event.aforo_maximo),
    ticketTypes: records(event.tipos_entrada).map((ticketType) => ({
      id: text(ticketType.id),
      eventId: text(ticketType.evento_id),
      name: text(ticketType.nombre),
      capacity: number(ticketType.aforo_maximo),
    })),
  }));
}

export function mapOrganizerRegistrations(value: unknown, ticketTypes: TicketType[]): Registration[] {
  const names = new Map(ticketTypes.map((ticketType) => [ticketType.id, ticketType.name]));
  return records(value).map((registration) => ({
    id: text(registration.id),
    holderName: text(registration.nombre_titular),
    holderEmail: text(registration.correo_titular),
    ticketTypeName: names.get(text(registration.tipo_entrada_id)) ?? "Tipo de entrada no disponible",
    createdAt: text(registration.created_at),
  }));
}

export function eventValuesToPersistence(value: { title: string; description: string; location: string; date: string; capacity: number }) {
  return { titulo: value.title, descripcion: value.description, lugar: value.location, fecha: value.date, aforo_maximo: value.capacity };
}

export function eventStatusToPersistence(status: EventStatus) {
  return { estado: status === "published" ? "publicado" : "borrador" };
}

export function ticketTypeValuesToPersistence(value: { name: string; capacity: number }) {
  return { nombre: value.name, aforo_maximo: value.capacity };
}

export function mapBuyerEventsPayload(value: unknown): { buyerId: string; serverTime: string; events: BuyerEvent[] } {
  const payload = record(value);
  return {
    buyerId: text(payload.comprador_id),
    serverTime: text(payload.ahora),
    events: records(payload.eventos).map((event) => ({
      id: text(event.id),
      title: text(event.titulo),
      date: text(event.fecha),
      location: text(event.lugar),
      status: eventStatus(event.estado),
      registrations: records(event.boletos).map((registration) => {
        const rawTicket = record(registration.ticket);
        const ticket = rawTicket.codigo ? { code: text(rawTicket.codigo), status: ticketStatus(rawTicket.estado) } : undefined;
        return {
          id: text(registration.id),
          holderName: text(registration.nombre_titular),
          holderEmail: text(registration.correo_titular),
          ticketTypeName: text(registration.tipo_entrada),
          createdAt: text(registration.created_at),
          ticket,
        };
      }),
    })),
  };
}

export function mapPublicTicket(value: unknown): PublicTicket | null {
  if (!value) return null;
  const ticket = record(value);
  const event = record(ticket.evento);
  return {
    status: ticketStatus(ticket.estado),
    holderName: text(ticket.nombre_titular),
    holderEmail: text(ticket.correo_titular),
    ticketTypeName: text(ticket.tipo_entrada),
    event: {
      title: text(event.titulo),
      date: text(event.fecha),
      location: text(event.lugar),
      published: event.publicado === true,
      past: event.pasado === true,
    },
  };
}

export function mapTicket(value: unknown): Ticket | undefined {
  const raw = record(value);
  return raw.codigo ? { code: text(raw.codigo), status: ticketStatus(raw.estado) } : undefined;
}

export function mapTicketDeliveries(value: unknown): TicketDelivery[] {
  return records(value).map((delivery) => ({
    id: text(delivery.id),
    recipient: text(delivery.destinatario),
    status: deliveryStatuses[text(delivery.estado)] ?? "failed",
    lastAttempt: delivery.ultimo_intento === null ? null : text(delivery.ultimo_intento),
    lockUntil: delivery.bloqueo_hasta === null ? null : text(delivery.bloqueo_hasta),
  }));
}

export function mapTicketEmailData(value: unknown): TicketEmailData {
  const data = record(value);
  return {
    code: text(data.codigo),
    holderName: text(data.nombre),
    holderEmail: text(data.correo),
    ticketTypeName: text(data.tipo),
    eventTitle: text(data.titulo),
    eventDate: text(data.fecha),
    eventLocation: text(data.lugar),
  };
}

export function mapTicketDeliveryTask(value: unknown) {
  const task = record(value);
  return {
    id: text(task.id),
    lockId: text(task.bloqueo),
    message: task.mensaje,
    uncertain: task.incierto === true,
    emailData: mapTicketEmailData(task.datos),
    recipient: text(task.destinatario),
  };
}

export function deliveryResultToPersistence(status: "accepted" | "failed" | "review", uncertain: boolean, resendId?: string) {
  const statuses = { accepted: "aceptado", failed: "fallido", review: "revision" } as const;
  return { p_estado: statuses[status], p_incierto: uncertain, p_resend_id: resendId ?? null };
}

export type RegistrationResultStatus = "confirmed" | "sessionRequired" | "invalidData" | "eventUnavailable" | "ticketTypeSoldOut" | "invalidTicketType" | "unknownResult";

export function mapRegistrationResult(value: unknown) {
  const result = record(value);
  const statuses: Record<string, RegistrationResultStatus> = {
    confirmado: "confirmed",
    sesion_requerida: "sessionRequired",
    datos_invalidos: "invalidData",
    evento_no_disponible: "eventUnavailable",
    entrada_agotada: "ticketTypeSoldOut",
    entrada_invalida: "invalidTicketType",
    resultado_desconocido: "unknownResult",
  };
  return {
    status: statuses[text(result.estado)] ?? "unknownResult",
    registrationId: text(result.folio),
    ticket: mapTicket(result.ticket),
    emailConfigured: result.correo_configurado === true,
  };
}

