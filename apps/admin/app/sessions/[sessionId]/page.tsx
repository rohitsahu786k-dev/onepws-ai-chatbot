"use client";

import { useEffect, useState } from "react";
import { Card } from "@onepws/ui";
import { AdminShell } from "../../../components/admin-shell";
import { api } from "../../../lib/api";

export default function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const [messages, setMessages] = useState<Array<{ senderType: string; content: string }>>([]);

  useEffect(() => {
    void params.then(({ sessionId }) => api.get(`/api/admin/sessions/${sessionId}/messages`).then((response) => setMessages(response.data)));
  }, [params]);

  return (
    <AdminShell title="Transcript Viewer">
      <Card className="space-y-3">
        {messages.map((message, index) => (
          <div key={index} className="rounded-2xl bg-black/4 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-black/40">{message.senderType}</p>
            <p className="mt-2 text-sm text-black/70">{message.content}</p>
          </div>
        ))}
      </Card>
    </AdminShell>
  );
}
