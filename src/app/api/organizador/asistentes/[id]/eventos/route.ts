import { assignStaffEvents, staffRoute } from "@/lib/staff-members-server";

export const PUT = (request: Request, context: { params: Promise<{ id: string }> }) =>
  staffRoute(request, async (auth) => assignStaffEvents(request, auth, (await context.params).id));
