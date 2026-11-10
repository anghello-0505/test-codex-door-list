export type EventStatus = "draft" | "published";
export type TicketStatus = "valid" | "used" | "revoked";
export type TicketDeliveryStatus = "pending" | "sending" | "accepted" | "failed" | "review" | "blocked";

export type Event = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
};

export type TicketType = {
  id: string;
  eventId: string;
  name: string;
  capacity: number;
};

export type Ticket = {
  code: string;
  status: TicketStatus;
};

export type Registration = {
  id: string;
  holderName: string;
  holderEmail: string;
  ticketTypeName: string;
  createdAt: string;
  ticket?: Ticket;
};

export type TicketDelivery = {
  id: string;
  recipient: string;
  status: TicketDeliveryStatus;
  lastAttempt: string | null;
  lockUntil: string | null;
};

export type AvailableTicketType = TicketType & { available: number };
export type AvailableEvent = Event & { isOpen: boolean; ticketTypes: AvailableTicketType[] };
export type OrganizerEvent = Event & { status: EventStatus; capacity: number; ticketTypes: TicketType[] };
export type OrganizerTicketType = TicketType & { registered: number; available: number; occupancyPercentage: number };
export type AttendeeExportEntry = {
  id: string;
  holderName: string;
  holderEmail: string;
  ticketTypeName: string;
  status: "valid";
  createdAt: string;
};
export type OrganizerEventDetailResponse = {
  event: OrganizerEvent;
  ticketTypes: OrganizerTicketType[];
  registrations: Registration[];
  registrationCount: number;
  page: number;
  pageSize: number;
};
export type BuyerEvent = Pick<Event, "id" | "title" | "date" | "location"> & {
  status: EventStatus;
  registrations: Registration[];
};
export type PublicTicket = Pick<Ticket, "status"> & {
  holderName: string;
  holderEmail: string;
  ticketTypeName: string;
  event: Pick<Event, "title" | "date" | "location"> & { published: boolean; past: boolean };
};

export type ConfirmRegistrationRequest = {
  eventId: string;
  ticketTypeId: string;
  name: string;
  email: string;
  idempotencyKey: string;
};

export type ConfirmRegistrationSuccess = {
  registrationId: string;
  ticket?: Ticket;
  emailConfigured: boolean;
};

export type TicketDeliveriesResponse = { deliveries: TicketDelivery[]; configured: boolean };
export type ApiErrorCode =
  | "sessionRequired"
  | "invalidData"
  | "payloadTooLarge"
  | "eventUnavailable"
  | "ticketTypeSoldOut"
  | "invalidTicketType"
  | "unknownResult"
  | "invalidRegistration"
  | "ticketUnavailable"
  | "deliveryNotConfigured"
  | "deliveryUnavailable"
  | "registrationsUnavailable";
export type ApiError = { error: ApiErrorCode };

export type TicketEmailData = {
  code: string;
  holderName: string;
  holderEmail: string;
  ticketTypeName: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
};


export type RegistrationHistoryResponse = { publishedAt: string | null; estimated: boolean; days: { date: string; count: number }[] };
