import { AdminShell } from "../../components/admin-shell";
import { AnalyticsOverview } from "../../components/analytics-overview";

export default function AnalyticsPage() {
  return (
    <AdminShell title="Analytics">
      <AnalyticsOverview />
    </AdminShell>
  );
}
