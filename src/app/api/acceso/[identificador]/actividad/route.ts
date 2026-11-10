import { accessRoute } from "@/lib/access-server";
export async function POST(request: Request, context: { params: Promise<{ identificador: string }> }) {
  return accessRoute(request, (await context.params).identificador, "activity");
}
