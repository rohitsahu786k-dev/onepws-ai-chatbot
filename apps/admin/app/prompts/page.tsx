import { AdminShell } from "../../components/admin-shell";
import { ResourceTable } from "../../components/resource-table";

export default function PromptsPage() {
  return (
    <AdminShell title="Prompt Manager">
      <ResourceTable endpoint="/api/admin/prompts" titleField="name" />
    </AdminShell>
  );
}
