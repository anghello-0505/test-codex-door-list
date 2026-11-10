import type { EmailMessage } from "./ticket-email.ts";

export type DeliveryResult = { status: "accepted" | "failed" | "review"; uncertain: boolean; resendId?: string };

// An unknown outcome must reuse both the payload and key; never invent a new key.
export async function sendWithResend(message: EmailMessage, taskId: string, apiKey: string, request: typeof fetch = fetch): Promise<DeliveryResult> {
  try {
    const response = await request("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `ticket-email/${taskId}` },
      body: JSON.stringify(message), signal: AbortSignal.timeout(10000), cache: "no-store",
    });
    if (response.ok) {
      const body = await response.json();
      if (typeof body.id !== "string") return { status: "failed", uncertain: true };
      return { status: "accepted", uncertain: false, resendId: body.id };
    }
    // 409 can represent an in-progress request or a payload mismatch; review it.
    if (response.status === 409) return { status: "review", uncertain: true };
    return { status: "failed", uncertain: response.status >= 500 };
  } catch { return { status: "failed", uncertain: true }; }
}
