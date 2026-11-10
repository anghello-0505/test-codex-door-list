import { setStaffPassword, staffRoute } from "@/lib/staff-members-server";

export const POST = (request: Request, context: { params: Promise<{ id: string }> }) =>
  staffRoute(request, async (auth) => setStaffPassword(request, auth, (await context.params).id, true));
