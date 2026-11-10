import { listStaffEvents, staffRoute } from "@/lib/staff-members-server";

export const GET = (request: Request) => staffRoute(request, listStaffEvents);
