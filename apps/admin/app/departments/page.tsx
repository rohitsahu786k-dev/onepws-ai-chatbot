import { AdminShell } from "../../components/admin-shell";
import { ResourceTable } from "../../components/resource-table";

export default function DepartmentsPage() {
  return (
    <AdminShell title="Departments">
      <ResourceTable endpoint="/api/admin/departments" titleField="name" />
    </AdminShell>
  );
}
