import { revokeTicket } from "@/lib/ticket-revocation-server";

export const maxDuration = 30;

export async function POST(request: Request, context: { params: Promise<{ id: string; registrationId: string }> }) {
  const { id, registrationId } = await context.params;
  return revokeTicket(request, id, registrationId);
}
