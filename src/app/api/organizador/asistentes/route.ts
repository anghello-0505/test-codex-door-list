import { createStaff, listStaff, staffRoute } from "@/lib/staff-members-server";

export const GET = (request: Request) => staffRoute(request, (auth) => listStaff(request, auth));
export const POST = (request: Request) => staffRoute(request, (auth) => createStaff(request, auth));
