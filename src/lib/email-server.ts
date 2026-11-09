import "server-only";
import { buildTicketMessage, type EmailMessage } from "@/lib/ticket-email";
import { deliveryResultToPersistence, mapTicketDeliveryTask } from "@/lib/persistence-mappers";
import { sendWithResend } from "@/lib/resend-delivery";
import { adminClient } from "@/lib/supabase/server";

export function deliveryConfigured() {
  return !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export async function deliverTicket(registrationId: string, buyerId: string) {
  if (!deliveryConfigured()) return;
  const admin = adminClient();
  const prepared = await admin.rpc("preparar_envios_entrada", { p_registro: registrationId, p_comprador: buyerId });
  if (prepared.error) return;
  const { data: ticket } = await admin.from("tickets").select("id,registrations!inner(comprador_id)").eq("registro_id", registrationId).eq("registrations.comprador_id", buyerId).maybeSingle();
  if (!ticket) return;
  const { data: jobs } = await admin.from("ticket_deliveries").select("id").eq("ticket_id", ticket.id).eq("comprador_id", buyerId).neq("estado", "aceptado");
  for (const job of jobs ?? []) {
    const { data: rawTask, error } = await admin.rpc("reclamar_envio_entrada", { p_id: job.id, p_comprador: buyerId });
    if (error || !rawTask) continue;
    const task = mapTicketDeliveryTask(rawTask);
    let started = false;
    try {
      const message = task.message as EmailMessage | null ?? await buildTicketMessage(task.emailData, task.recipient, process.env.RESEND_FROM_EMAIL!);
      const marked = await admin.rpc("iniciar_envio_entrada", { p_id: task.id, p_bloqueo: task.lockId, p_mensaje: message });
      if (marked.error || marked.data !== true) continue;
      started = true;
      const result = await sendWithResend(message, task.id, process.env.RESEND_API_KEY!);
      await admin.rpc("finalizar_envio_entrada", {
        p_id: task.id,
        p_bloqueo: task.lockId,
        ...deliveryResultToPersistence(result.status, result.status === "accepted" ? false : result.uncertain || task.uncertain, result.resendId),
      });
    } catch {
      await admin.rpc("finalizar_envio_entrada", {
        p_id: task.id,
        p_bloqueo: task.lockId,
        ...deliveryResultToPersistence("failed", started || task.uncertain),
      });
    }
  }
}
