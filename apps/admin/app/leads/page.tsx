import { AdminShell } from "../../components/admin-shell";
import { ResourceTable } from "../../components/resource-table";

export default function LeadsPage() {
  return (
    <AdminShell title="Leads">
      <ResourceTable endpoint="/api/admin/leads" titleField="leadId" linkPrefix="/leads" linkField="leadId" enableSearch exportUrl="/api/admin/leads/export.csv" />
    </AdminShell>
  );
}
