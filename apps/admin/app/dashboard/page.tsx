import { AdminShell } from "../../components/admin-shell";
import { AnalyticsOverview } from "../../components/analytics-overview";

export default function DashboardPage() {
  return (
    <AdminShell title="Dashboard Overview">
      <AnalyticsOverview />
    </AdminShell>
  );
}
