import { accessRoute, loginAccess } from "@/lib/access-server";
type Context = { params: Promise<{ identificador: string }> };
export async function POST(request: Request, context: Context) { return loginAccess(request, (await context.params).identificador); }
export async function GET(request: Request, context: Context) { return accessRoute(request, (await context.params).identificador, "session"); }
export async function DELETE(request: Request, context: Context) { return accessRoute(request, (await context.params).identificador, "logout"); }
