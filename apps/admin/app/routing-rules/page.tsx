import { AdminShell } from "../../components/admin-shell";
import { ResourceTable } from "../../components/resource-table";

export default function RoutingRulesPage() {
  return (
    <AdminShell title="Routing Rules">
      <ResourceTable endpoint="/api/admin/routing-rules" titleField="targetDepartmentSlug" />
    </AdminShell>
  );
}
