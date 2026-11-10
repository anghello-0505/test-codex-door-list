import StaffManager from "./staff-manager";
import AccessLink from "./access-link";

export default function StaffMembersPage() {
  return <main className="mx-auto min-h-screen max-w-6xl px-5 pb-16 pt-12 sm:px-10">
    <AccessLink /><StaffManager />
  </main>;
}
