import { AdminShell } from "../../components/admin-shell";
import { ResourceTable } from "../../components/resource-table";

export default function SessionsPage() {
  return (
    <AdminShell title="Sessions">
      <ResourceTable endpoint="/api/admin/sessions" titleField="sessionId" linkPrefix="/sessions" linkField="sessionId" />
    </AdminShell>
  );
}
