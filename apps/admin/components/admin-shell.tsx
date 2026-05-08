"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@onepws/ui";
import { cn } from "@onepws/utils";
import { AuthGuard } from "./auth-guard";

const links = [
  ["Dashboard", "/dashboard"],
  ["Leads", "/leads"],
  ["Sessions", "/sessions"],
  ["Transcript Search", "/transcripts"],
  ["Analytics", "/analytics"],
  ["Routing Rules", "/routing-rules"],
  ["Departments", "/departments"],
  ["People", "/people"],
  ["Prompts", "/prompts"],
  ["Email Logs", "/email-logs"],
  ["Job Logs", "/job-logs"],
  ["Settings", "/settings"],
  ["Audit Logs", "/audit-logs"],
] as const;

export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <AuthGuard>
      <div className="grid min-h-screen grid-cols-[260px_1fr]">
        <aside className="border-r border-black/8 bg-[linear-gradient(180deg,#101418_0%,#141d28_56%,#1a1012_100%)] p-6 text-white">
          <div className="rounded-2xl bg-white/6 p-3">
            <Image src="/onepws-logo.webp" alt="OnePWS" width={144} height={36} className="h-auto w-[144px]" priority />
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-white/50">OnePWS</p>
          <h1 className="mt-3 text-2xl font-semibold">Admin console</h1>
          <nav className="mt-8 space-y-1">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className={cn("block rounded-2xl px-4 py-3 text-sm text-white/70 transition hover:bg-white/8 hover:text-white", pathname === href && "bg-white/12 text-white")}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Button
            variant="outline"
            className="mt-8 w-full border-white/15 text-white hover:bg-white/8"
            onClick={() => {
              window.localStorage.removeItem("onepws-admin-token");
              router.push("/login");
            }}
          >
            Logout
          </Button>
        </aside>
        <main className="bg-[linear-gradient(180deg,#fffdfd_0%,#f6f7fb_100%)] p-8">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-black/40">Operations</p>
              <h2 className="mt-2 text-3xl font-semibold">{title}</h2>
            </div>
            <div className="rounded-2xl border border-[#ea2d2d]/12 bg-white px-4 py-3 text-right shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">System</p>
              <p className="mt-1 text-sm font-medium text-slate-700">OnePWS Admin Workspace</p>
            </div>
          </div>
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
