"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { Button, Card, Input } from "@onepws/ui";
import { formatDate } from "@onepws/utils";
import { api } from "../lib/api";

function valueToContent(value: unknown) {
  if (typeof value === "string" && value.includes("T") && value.includes(":")) return formatDate(value);
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "-");
}

function badgeTone(column: string, value: unknown) {
  const normalized = String(value ?? "").toLowerCase();
  if (column === "leadTemperature") {
    if (normalized === "hot") return "bg-red-50 text-red-700";
    if (normalized === "warm") return "bg-amber-50 text-amber-700";
    return "bg-slate-100 text-slate-700";
  }
  if (column === "status") {
    if (["qualified", "submitted", "routed", "sent", "completed"].includes(normalized)) return "bg-emerald-50 text-emerald-700";
    if (["failed", "duplicate"].includes(normalized)) return "bg-red-50 text-red-700";
    return "bg-slate-100 text-slate-700";
  }
  return "";
}

export function ResourceTable({
  endpoint,
  titleField = "name",
  linkPrefix,
  linkField,
  enableSearch = false,
  exportUrl,
}: {
  endpoint: string;
  titleField?: string;
  linkPrefix?: string;
  linkField?: string;
  enableSearch?: boolean;
  exportUrl?: string;
}) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  async function downloadExport() {
    if (!exportUrl) return;
    const response = await api.get(exportUrl, { responseType: "blob" });
    const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = "onepws-leads.csv";
    anchor.click();
    window.URL.revokeObjectURL(blobUrl);
  }

  useEffect(() => {
    setLoading(true);
    void api
      .get(endpoint, {
        params: enableSearch ? { q, page, limit: 12 } : undefined,
      })
      .then((response) => {
        const payload = response.data;
        if (Array.isArray(payload)) {
          setItems(payload);
          setTotalPages(1);
        } else {
          setItems(payload.items ?? []);
          setTotalPages(payload.totalPages ?? 1);
        }
      })
      .finally(() => setLoading(false));
  }, [endpoint, enableSearch, page, q]);

  const columns = useMemo(
    () => (items[0] ? Object.keys(items[0]).filter((key) => !["_id", "__v", "html", "text", "passwordHash", "assignedEmails", "solutionCategories"].includes(key)).slice(0, 7) : []),
    [items]
  );

  return (
    <Card className="overflow-hidden border-black/6 bg-white/90 p-0 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-3 border-b border-black/6 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-3">
          {enableSearch ? (
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10" placeholder="Search leads, company, email, phone..." value={q} onChange={(event) => { setPage(1); setQ(event.target.value); }} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">{items.length} records loaded</p>
          )}
        </div>
        {exportUrl ? (
          <div className="inline-flex">
            <Button variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white text-slate-700" onClick={() => void downloadExport()}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        ) : null}
      </div>

      {loading ? <div className="px-5 py-8 text-sm text-slate-500">Loading records...</div> : null}
      {!loading && items.length === 0 ? <div className="px-5 py-8 text-sm text-slate-500">No records found.</div> : null}
      {!loading && items.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="px-4 py-3 font-medium text-slate-500">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={String(item._id ?? index)} className="border-t border-black/6 transition hover:bg-slate-50/80">
                    {columns.map((column) => {
                      const value = item[column];
                      const content = valueToContent(value);
                      const href = linkPrefix && linkField ? `${linkPrefix}/${String(item[linkField] ?? "")}` : undefined;
                      const isTitle = column === titleField && href;
                      const tone = badgeTone(column, value);

                      return (
                        <td key={column} className="px-4 py-3 align-top text-slate-700">
                          {tone ? (
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{content}</span>
                          ) : isTitle ? (
                            <Link href={href} className="font-semibold text-[var(--accent)]">
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-black/6 px-5 py-4">
              <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" className="rounded-2xl border-slate-200 bg-white text-slate-700" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                  Previous
                </Button>
                <Button variant="outline" className="rounded-2xl border-slate-200 bg-white text-slate-700" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
