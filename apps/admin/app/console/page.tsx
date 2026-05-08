"use client";

import Link from "next/link";
import { Card } from "@onepws/ui";
import { AdminShell } from "../components/admin-shell";

const consoleProducts = [
  {
    id: "xlat-de",
    title: "XLAT DE",
    category: "Control Room Consoles",
    shortDescription: "Versatile control room console with adaptable operator interface",
  },
];

export default function ConsolesPage() {
  return (
    <AdminShell title="Console Products">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {consoleProducts.map((product) => (
          <Link key={product.id} href={`/console/${product.id}`}>
            <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)] cursor-pointer hover:shadow-[0_30px_60px_rgba(15,23,42,0.12)] transition-shadow">
              <div className="aspect-video w-full rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mb-4">
                <div className="text-center">
                  <div className="text-5xl font-bold text-slate-400">{product.title.slice(0, 2)}</div>
                </div>
              </div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{product.category}</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">{product.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{product.shortDescription}</p>
            </Card>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
