"use client";

import { useEffect, useState } from "react";
import { Building2, Mail, Phone, RefreshCw, Workflow } from "lucide-react";
import { Button, Card } from "@onepws/ui";
import { formatDate } from "@onepws/utils";
import { AdminShell } from "../../../components/admin-shell";
import { api } from "../../../lib/api";

type LeadPayload = {
  lead?: Record<string, unknown>;
  messages?: Array<{ senderType: string; content: string; createdAt?: string }>;
  emails?: Array<{ type: string; status: string; createdAt?: string }>;
  jobs?: Array<{ jobType: string; status: string; createdAt?: string }>;
};

export default function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const [data, setData] = useState<LeadPayload>({});
  const [timeline, setTimeline] = useState<Array<{ type: string; label: string; createdAt?: string; meta?: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void params.then(async ({ leadId }) => {
      const [detailResponse, timelineResponse] = await Promise.all([
        api.get(`/api/admin/leads/${leadId}`),
        api.get(`/api/admin/leads/${leadId}/timeline`),
      ]);
      setData(detailResponse.data);
      setTimeline(timelineResponse.data.timeline ?? []);
    });
  }, [params]);

  async function rerouteLead() {
    setLoading(true);
    try {
      const { leadId } = await params;
      await api.post(`/api/admin/leads/${leadId}/reroute`);
      const timelineResponse = await api.get(`/api/admin/leads/${leadId}/timeline`);
      setTimeline(timelineResponse.data.timeline ?? []);
    } finally {
      setLoading(false);
    }
  }

  const lead = data.lead ?? {};

  return (
    <AdminShell title="Lead Detail">
      <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Lead Record</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">{String(lead.fullName ?? "Unnamed lead")}</h3>
              <p className="mt-2 text-sm text-slate-500">{String(lead.company ?? "No company")} · {String(lead.solutionCategory ?? "unknown")}</p>
            </div>
            <Button className="rounded-2xl bg-[#EA2D2D] hover:opacity-95" onClick={() => void rerouteLead()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {loading ? "Rerouting..." : "Reroute"}
            </Button>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Status</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{String(lead.status ?? "draft")}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Lead Score</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{String(lead.leadScore ?? 0)}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Assigned Department</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{String(lead.assignedDepartment ?? "Unassigned")}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Assigned Person</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{String(lead.assignedPerson ?? "Not mapped")}</p>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <Mail className="h-4 w-4 text-[#EA2D2D]" />
              <span>{String(lead.email ?? "No email")}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <Phone className="h-4 w-4 text-[#EA2D2D]" />
              <span>{String(lead.phone ?? "No phone")}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <Building2 className="h-4 w-4 text-[#EA2D2D]" />
              <span>{String(lead.projectLocation ?? lead.city ?? "No location")}</span>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Requirement Summary</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{String(lead.requirementSummary ?? "No requirement summary")}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Internal Summary</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{String(lead.summary ?? "No summary generated")}</p>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-3">
              <Workflow className="h-5 w-5 text-[#EA2D2D]" />
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Activity Timeline</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Lead lifecycle and follow-up actions</h3>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {timeline.map((item, index) => (
                <div key={`${item.type}-${index}`} className="flex gap-4">
                  <div className="mt-1 h-3 w-3 rounded-full bg-[#EA2D2D]" />
                  <div className="flex-1 rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{formatDate(item.createdAt)}</p>
                    </div>
                    {item.meta ? <p className="mt-2 text-sm text-slate-600">{item.meta}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Conversation</p>
              <div className="mt-4 space-y-3">
                {(data.messages ?? []).map((message, index) => (
                  <div key={index} className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{message.senderType}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{message.content}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Operational Logs</p>
              <div className="mt-4 space-y-3">
                {(data.emails ?? []).map((item, index) => (
                  <div key={`email-${index}`} className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{item.type}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.status}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{formatDate(item.createdAt)}</p>
                  </div>
                ))}
                {(data.jobs ?? []).map((item, index) => (
                  <div key={`job-${index}`} className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{item.jobType}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.status}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{formatDate(item.createdAt)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
