"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card } from "@onepws/ui";
import { formatDate } from "@onepws/utils";
import { AdminShell } from "../../components/admin-shell";
import { api } from "../../lib/api";

export default function TranscriptSearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ sessionId: string; senderType: string; content: string; createdAt?: string }>>([]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void api.get("/api/admin/transcripts/search", { params: { q } }).then((response) => setResults(response.data));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <AdminShell title="Transcript Search">
      <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none"
            placeholder="Search every stored message across sessions"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <div className="mt-6 space-y-3">
          {!q.trim() ? <p className="text-sm text-slate-500">Start typing to search transcripts.</p> : null}
          {results.map((item, index) => (
            <div key={`${item.sessionId}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.senderType}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{item.content}</p>
                </div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{formatDate(item.createdAt)}</p>
              </div>
              <Link href={`/sessions/${item.sessionId}`} className="mt-3 inline-flex text-sm font-semibold text-[var(--accent)]">
                Open session
              </Link>
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
