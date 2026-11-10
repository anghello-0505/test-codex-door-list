import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffMember } from "@/lib/domain";
import { isUuid } from "@/lib/validation";

export const staffMemberColumns = "id,display_name,username,is_active,provisioning_status,created_at";

export function mapStaffMember(value: unknown, eventIds: string[]): StaffMember {
  const row = value as Record<string, unknown> | null;
  if (!row || !isUuid(row.id) || typeof row.display_name !== "string" || typeof row.username !== "string" ||
    typeof row.is_active !== "boolean" || !["pending", "ready"].includes(String(row.provisioning_status)) ||
    typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at)) || !eventIds.every(isUuid)) {
    throw new Error("Invalid staff record");
  }
  return {
    id: row.id, name: row.display_name, username: row.username, isActive: row.is_active,
    provisioningStatus: row.provisioning_status as StaffMember["provisioningStatus"],
    createdAt: row.created_at, eventIds,
  };
}

export async function findStaffMember(client: SupabaseClient, id: string, organizerId: string) {
  const row = await client.from("staff_members").select(staffMemberColumns)
    .eq("id", id).eq("organizer_id", organizerId).is("deleted_at", null).maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) return null;
  const eventIds: string[] = [];
  let after: string | null = null;
  while (true) {
    let query = client.from("staff_event_assignments").select("event_id")
      .eq("staff_member_id", id).eq("organizer_id", organizerId).order("event_id").limit(500);
    if (after) query = query.gt("event_id", after);
    const batch = await query;
    if (batch.error) throw batch.error;
    if (batch.data === null) throw new Error("Missing assignments");
    if (!batch.data.length) break;
    eventIds.push(...batch.data.map((item) => item.event_id));
    after = batch.data[batch.data.length - 1].event_id;
  }
  return mapStaffMember(row.data, eventIds);
}
