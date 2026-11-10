const eventDateFormatter = new Intl.DateTimeFormat("es-GT", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Guatemala",
});

const localInputFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Guatemala",
});

export function formatEventDate(value: string): string {
  return eventDateFormatter.format(new Date(value));
}

export function toGuatemalaDateTimeLocal(value: string): string {
  const parts = Object.fromEntries(localInputFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function guatemalaDateTimeLocalToIso(value: string): string {
  return new Date(`${value}:00-06:00`).toISOString();
}


const dayFormatter = new Intl.DateTimeFormat("es-GT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export function formatCalendarDate(value: string): string {
  return dayFormatter.format(new Date(`${value}T00:00:00Z`));
}

const compactDayFormatter = new Intl.DateTimeFormat("es-GT", { day: "numeric", month: "short", timeZone: "UTC" });
export function formatCalendarDay(value: string): string {
  return compactDayFormatter.format(new Date(`${value}T00:00:00Z`)).replace(".", "");
}
