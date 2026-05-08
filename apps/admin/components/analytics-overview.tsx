"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Flame, Globe2, MailCheck, Radar, Search, Sparkles, Target } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card } from "@onepws/ui";
import { formatDate } from "@onepws/utils";
import { api } from "../lib/api";

type CountItem = { _id: string; count: number };
type RecentLead = { leadId: string; fullName?: string; company?: string; solutionCategory?: string; leadScore?: number; assignedDepartment?: string; createdAt?: string };
type ActivityItem = { type: string; label: string; meta?: string; createdAt?: string };
type Analytics = {
  totalLeads: number;
  totalSessions: number;
  totalQualifiedLeads: number;
  totalRoutedLeads: number;
  leadCaptureRate: number;
  leadsByDay: CountItem[];
  leadsBySolutionCategory: CountItem[];
  leadTemperatureDistribution: CountItem[];
  leadsByDepartment: CountItem[];
  languageDistribution: CountItem[];
  topLandingPages: CountItem[];
  topSources: CountItem[];
  emailSuccessRate: CountItem[];
  recentHotLeads: RecentLead[];
  recentActivity: ActivityItem[];
};

const tempColors = ["#EA2D2D", "#F59E0B", "#CBD5E1"];

function metricCard(icon: React.ReactNode, label: string, value: string | number, note: string) {
  return (
    <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-2 text-sm text-slate-500">{note}</p>
        </div>
        <div className="rounded-2xl bg-[#ea2d2d]/8 p-3 text-[#EA2D2D]">{icon}</div>
      </div>
    </Card>
  );
}

export function AnalyticsOverview() {
  const [data, setData] = useState<Analytics | null>(null);
  const [searchResults, setSearchResults] = useState<Array<{ sessionId: string; senderType: string; content: string; createdAt: string }>>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    void api.get("/api/admin/analytics/overview").then((response) => setData(response.data));
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void api.get("/api/admin/transcripts/search", { params: { q: searchQuery } }).then((response) => setSearchResults(response.data));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const emailSuccessSummary = useMemo(() => {
    const sent = data?.emailSuccessRate.find((item) => item._id === "sent")?.count ?? 0;
    const total = data?.emailSuccessRate.reduce((sum, item) => sum + item.count, 0) ?? 0;
    return total === 0 ? 0 : Math.round((sent / total) * 100);
  }, [data]);

  if (!data) {
    return <Card className="rounded-[28px]">Loading analytics...</Card>;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="rounded-[32px] border-0 bg-[linear-gradient(135deg,#101418_0%,#18212c_46%,#ea2d2d_130%)] p-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Operations Snapshot</p>
              <h3 className="mt-3 text-4xl leading-tight font-semibold">A sharper view of enquiries, routing, and follow-up velocity across OnePWS.</h3>
              <p className="mt-4 text-base leading-7 text-white/72">
                Monitor the full funnel from chat starts to qualified and routed leads, inspect live transcript activity, and act on high-intent enterprise opportunities faster.
              </p>
            </div>
            <Link href="/leads">
              <Button className="rounded-2xl bg-white text-slate-950 hover:opacity-95">
                Review lead pipeline
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-white/12 bg-white/6 p-5">
              <p className="text-sm text-white/62">Lead capture rate</p>
              <p className="mt-2 text-3xl font-semibold">{data.leadCaptureRate}%</p>
            </div>
            <div className="rounded-3xl border border-white/12 bg-white/6 p-5">
              <p className="text-sm text-white/62">Qualified leads</p>
              <p className="mt-2 text-3xl font-semibold">{data.totalQualifiedLeads}</p>
            </div>
            <div className="rounded-3xl border border-white/12 bg-white/6 p-5">
              <p className="text-sm text-white/62">Email success</p>
              <p className="mt-2 text-3xl font-semibold">{emailSuccessSummary}%</p>
            </div>
          </div>
        </Card>

        <Card className="rounded-[32px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Transcript Search</p>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none"
              placeholder="Search messages, needs, locations, names..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div className="mt-5 space-y-3">
            {searchResults.length === 0 ? <p className="text-sm text-slate-500">Search transcripts to jump into specific project conversations.</p> : null}
            {searchResults.slice(0, 5).map((item, index) => (
              <div key={`${item.sessionId}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{item.senderType} · {formatDate(item.createdAt)}</p>
                <p className="mt-2 line-clamp-2 text-sm text-slate-700">{item.content}</p>
                <Link href={`/sessions/${item.sessionId}`} className="mt-3 inline-flex text-sm font-medium text-[var(--accent)]">
                  Open transcript
                </Link>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metricCard(<Radar className="h-5 w-5" />, "Total leads", data.totalLeads, "All captured lead records")}
        {metricCard(<Activity className="h-5 w-5" />, "Total sessions", data.totalSessions, "All widget chat sessions")}
        {metricCard(<Target className="h-5 w-5" />, "Qualified", data.totalQualifiedLeads, "Ready for follow-up")}
        {metricCard(<MailCheck className="h-5 w-5" />, "Routed", data.totalRoutedLeads, "Assigned to departments")}
        {metricCard(<Globe2 className="h-5 w-5" />, "Languages", data.languageDistribution.length, "Distinct active language buckets")}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="h-[360px] rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Lead Momentum</p>
            <h4 className="mt-2 text-xl font-semibold text-slate-950">New leads over the last 14 days</h4>
          </div>
          <ResponsiveContainer width="100%" height="84%">
            <AreaChart data={data.leadsByDay}>
              <defs>
                <linearGradient id="leadArea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#EA2D2D" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#EA2D2D" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="_id" tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="count" stroke="#EA2D2D" fill="url(#leadArea)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="h-[360px] rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Solution Split</p>
            <h4 className="mt-2 text-xl font-semibold text-slate-950">Lead mix by solution category</h4>
          </div>
          <ResponsiveContainer width="100%" height="84%">
            <BarChart data={data.leadsBySolutionCategory.slice(0, 6)} layout="vertical" margin={{ left: 32 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis dataKey="_id" type="category" tick={{ fill: "#64748b", fontSize: 12 }} width={130} />
              <Tooltip />
              <Bar dataKey="count" fill="#EA2D2D" radius={[0, 12, 12, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr_0.8fr]">
        <Card className="h-[360px] rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Lead Temperature</p>
          <h4 className="mt-2 text-xl font-semibold text-slate-950">Hot, warm, cold distribution</h4>
          <ResponsiveContainer width="100%" height="82%">
            <PieChart>
              <Pie data={data.leadTemperatureDistribution} dataKey="count" nameKey="_id" innerRadius={72} outerRadius={110}>
                {data.leadTemperatureDistribution.map((_, index) => (
                  <Cell key={index} fill={tempColors[index] ?? "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Priority Queue</p>
              <h4 className="mt-2 text-xl font-semibold text-slate-950">Recent hot leads</h4>
            </div>
            <Flame className="h-5 w-5 text-[#EA2D2D]" />
          </div>
          <div className="mt-5 space-y-3">
            {data.recentHotLeads.map((lead) => (
              <Link key={lead.leadId} href={`/leads/${lead.leadId}`} className="block rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-[#EA2D2D]/30 hover:bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{lead.fullName || "Unnamed lead"}</p>
                    <p className="mt-1 text-sm text-slate-500">{lead.company || "No company"} · {lead.solutionCategory || "unknown"}</p>
                  </div>
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">{lead.leadScore ?? 0}</span>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-400">{lead.assignedDepartment || "Unassigned"} · {formatDate(lead.createdAt)}</p>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Activity Feed</p>
              <h4 className="mt-2 text-xl font-semibold text-slate-950">Latest operations events</h4>
            </div>
            <Sparkles className="h-5 w-5 text-[#EA2D2D]" />
          </div>
          <div className="mt-5 space-y-4">
            {data.recentActivity.map((item, index) => (
              <div key={`${item.type}-${index}`} className="flex gap-3">
                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[#EA2D2D]" />
                <div>
                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.meta || item.type}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{formatDate(item.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Top Pages</p>
          <div className="mt-4 space-y-3">
            {data.topLandingPages.slice(0, 5).map((item) => (
              <div key={item._id || "unknown"} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <p className="max-w-[75%] truncate text-sm text-slate-700">{item._id || "Unknown page"}</p>
                <span className="text-sm font-semibold text-slate-900">{item.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Source Distribution</p>
          <div className="mt-4 space-y-3">
            {data.topSources.slice(0, 5).map((item) => (
              <div key={item._id || "direct"} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-700">{item._id || "Direct / Unknown"}</p>
                <span className="text-sm font-semibold text-slate-900">{item.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Department Load</p>
          <div className="mt-4 space-y-3">
            {data.leadsByDepartment.slice(0, 5).map((item) => (
              <div key={item._id || "unassigned"} className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-700">{item._id || "Unassigned"}</p>
                  <span className="text-sm font-semibold text-slate-900">{item.count}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-200">
                  <div className="h-2 rounded-full bg-[#EA2D2D]" style={{ width: `${Math.min(100, item.count * 10)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
