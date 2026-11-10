export function ticketAvailability(capacity: number, registered: number) {
  if (!Number.isSafeInteger(capacity) || capacity <= 0 ||
      !Number.isSafeInteger(registered) || registered < 0) {
    throw new Error("Invalid availability data");
  }
  return {
    registered,
    available: Math.max(0, capacity - registered),
    occupancyPercentage: registered / capacity * 100,
  };
}
