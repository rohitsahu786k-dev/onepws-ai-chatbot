import { AdminShell } from "../../components/admin-shell";
import { ResourceTable } from "../../components/resource-table";

export default function AuditLogsPage() {
  return (
    <AdminShell title="Audit Logs">
      <ResourceTable endpoint="/api/admin/audit-logs" titleField="action" />
    </AdminShell>
  );
}
