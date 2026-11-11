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
  revocation?: { reason: string; emailStatus: TicketDeliveryStatus };
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
export type OrganizerEvent = Event & { status: EventStatus; capacity: number; ticketTypes: TicketType[]; accessGraceMinutes?: number };
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
  | "registrationsUnavailable"
  | "ticketRevocationConflict"
  | "ticketRevocationUnavailable"
  | "ticketRevocationDenied"
  | "staffAccessDenied"
  | "staffUnavailable"
  | "staffUsernameTaken"
  | "staffConflict"
  | "staffInvalidEvents"
  | "staffNotConfigured"
  | "staffCreationPending"
  | "staffPasswordRejected"
  | "staffPasswordUnconfirmed"
  | AccessErrorCode;
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

// Staff are access-control personnel, never ticket holders or registrations.
export type StaffMember = {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
  provisioningStatus: "pending" | "ready";
  eventIds: string[];
  createdAt: string;
};
export type StaffEventAssignment = { staffMemberId: string; eventId: string };
export type StaffEvent = Pick<OrganizerEvent, "id" | "title" | "date" | "status">;
export type CreateStaffMemberRequest = {
  name: string; username: string; password: string; eventIds: string[]; idempotencyKey: string;
};
export type UpdateStaffMemberRequest = { name: string; username: string } | { isActive: boolean };
export type StaffMembersResponse = { staffMembers: StaffMember[]; page: number; pageSize: number; total: number };
export type StaffMemberResponse = { staffMember: StaffMember };
export type StaffEventsResponse = { events: StaffEvent[] };

export type AccessErrorCode = "accessCredentialsInvalid" | "accessSessionExpired" | "accessRateLimited" |
  "accessOperationConflict" | "accessCodeInvalid" | "accessTicketNotFound" | "accessTicketUsed" |
  "accessTicketRevoked" | "accessEventUnavailable" | "accessOutsideWindow" | "accessUnavailable";
export type AccessSession = { staffMemberId: string; organizerId: string; name: string; expiresAt: string; serverTime: string };
export type AccessEvent = Pick<Event, "id" | "title" | "date" | "location"> & {
  status: EventStatus; available: boolean; opensAt: string; closesAt: string;
};
export type AccessEventsResponse = { events: AccessEvent[]; serverTime: string };
export type ValidateTicketRequest = { eventId: string; code: string; operationId: string; source: "camera" | "manual" };
export type AccessResult = { operationId: string; result: "accepted"; holderName: string; ticketTypeName: string;
  validatedAt: string; replayed: boolean };
export type PendingValidation = { staffMemberId: string; eventId: string; operationId: string; fingerprint: string };
export type ValidationHistoryEntry = { id: string; eventId: string; eventTitle: string | null; eventDeleted: boolean;
  staffName: string; ticketReference: string | null; result: "accepted" | "rejected"; reason: string | null;
  createdAt: string; source: "camera" | "manual" };
export type ValidationHistoryResponse = { entries: ValidationHistoryEntry[]; nextCursor: string | null };
export type ValidationHistoryEvent = { id: string; title: string; deleted: boolean };
