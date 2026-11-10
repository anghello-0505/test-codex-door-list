import { accessRoute } from "@/lib/access-server";
export async function GET(request: Request, context: { params: Promise<{ identificador: string; operationId: string }> }) {
  const params = await context.params;
  return accessRoute(request, params.identificador, "recover", params.operationId);
}
