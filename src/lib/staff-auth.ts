import "server-only";
import type { StaffMember } from "@/lib/domain";
import { adminClient } from "@/lib/supabase/server";

// This phase deliberately NEVER unbans staff, including active staff.
export const staffBanDuration = "876000h";
export const staffTechnicalEmail = (id: string) => `${id}@staff.invalid`;
export const staffAuthConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

type Identity = { id: string; email?: string; banned_until?: string; app_metadata: Record<string, unknown> };

export function matchesStaffIdentity(user: Identity | null, memberId: string, organizerId: string) {
  return Boolean(user && user.id === memberId && user.email === staffTechnicalEmail(memberId) &&
    user.app_metadata.account_type === "access_staff" && user.app_metadata.staff_member_id === memberId &&
    user.app_metadata.organizer_id === organizerId && Date.parse(user.banned_until ?? "") > Date.now());
}

// Only these narrow operations can use the privileged Auth client. Callers must
// first resolve ownership through the authenticated database client.
export async function provisionStaffIdentity(member: StaffMember, organizerId: string, password: string) {
  const admin = adminClient().auth.admin;
  const existing = await admin.getUserById(member.id);
  if (existing.data.user) {
    if (!matchesStaffIdentity(existing.data.user, member.id, organizerId)) throw new Error("Staff identity mismatch");
    return; // A creation retry must never reset a password that was already set.
  }
  if (existing.error?.status !== 404) throw new Error("Staff identity lookup unavailable");
  const created = await admin.createUser({
    id: member.id, email: staffTechnicalEmail(member.id), password, email_confirm: true,
    ban_duration: staffBanDuration,
    app_metadata: { account_type: "access_staff", staff_member_id: member.id, organizer_id: organizerId },
  });
  if (created.error) {
    if (created.error.code === "weak_password" || created.error.code === "validation_failed") return "passwordRejected" as const;
    // A concurrent retry may have won the same fixed UUID. Never adopt by email.
    const retry = await admin.getUserById(member.id);
    if (!matchesStaffIdentity(retry.data.user, member.id, organizerId)) throw new Error("Staff creation unconfirmed");
  } else if (!matchesStaffIdentity(created.data.user, member.id, organizerId)) {
    throw new Error("Staff creation unconfirmed");
  }
}

export async function resetStaffIdentityPassword(memberId: string, organizerId: string, password: string) {
  const admin = adminClient().auth.admin;
  const existing = await admin.getUserById(memberId);
  if (existing.error || !matchesStaffIdentity(existing.data.user, memberId, organizerId)) throw new Error("Staff identity unavailable");
  const result = await admin.updateUserById(memberId, { password, ban_duration: staffBanDuration });
  if (result.error) {
    if (result.error.code === "weak_password" || result.error.code === "validation_failed") return "passwordRejected" as const;
    throw new Error("Staff password unconfirmed");
  }
  if (!matchesStaffIdentity(result.data.user, memberId, organizerId)) throw new Error("Staff password unconfirmed");
}
