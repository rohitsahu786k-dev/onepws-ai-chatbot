import { AdminShell } from "../../components/admin-shell";
import { ResourceTable } from "../../components/resource-table";

export default function EmailLogsPage() {
  return (
    <AdminShell title="Email Logs">
      <ResourceTable endpoint="/api/admin/email-logs" titleField="type" />
    </AdminShell>
  );
}
