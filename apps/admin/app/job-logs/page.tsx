import { AdminShell } from "../../components/admin-shell";
import { ResourceTable } from "../../components/resource-table";

export default function JobLogsPage() {
  return (
    <AdminShell title="Job Logs">
      <ResourceTable endpoint="/api/admin/job-logs" titleField="jobType" />
    </AdminShell>
  );
}
