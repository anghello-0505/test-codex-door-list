import type { ApiErrorCode } from "@/lib/domain";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export function jsonResponse<T>(body: T, status = 200) {
  return Response.json(body, { status, headers });
}

export function errorResponse(error: ApiErrorCode, status: number) {
  return jsonResponse({ error }, status);
}
