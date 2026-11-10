import { deleteStaff, staffRoute, updateStaff } from "@/lib/staff-members-server";

type Context = { params: Promise<{ id: string }> };
export const PATCH = (request: Request, context: Context) => staffRoute(request, async (auth) => updateStaff(request, auth, (await context.params).id));
export const DELETE = (request: Request, context: Context) => staffRoute(request, async (auth) => deleteStaff(auth, (await context.params).id));
