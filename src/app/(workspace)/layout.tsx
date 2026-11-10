import AdminNavigation from "@/components/admin-navigation";

export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    <AdminNavigation />
    {children}
  </>;
}
