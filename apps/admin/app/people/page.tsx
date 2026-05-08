import { AdminShell } from "../../components/admin-shell";
import { ResourceTable } from "../../components/resource-table";

export default function PeoplePage() {
  return (
    <AdminShell title="People Mappings">
      <ResourceTable endpoint="/api/admin/people" titleField="fullName" />
    </AdminShell>
  );
}
