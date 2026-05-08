"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import axios from "axios";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { Button, Input } from "@onepws/ui";
import { api } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@onepws.com");
  const [password, setPassword] = useState("OnepwsAdmin@123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    try {
      setLoading(true);
      setError("");
      const { data } = await api.post("/api/admin/auth/login", { email: email.trim().toLowerCase(), password });
      window.localStorage.setItem("onepws-admin-token", data.accessToken);
      router.push("/dashboard");
    } catch (error) {
      if (axios.isAxiosError(error) && (!error.response || error.response.status >= 500)) {
        setError("Sign-in service is not reachable. Check the deployment API and database settings.");
      } else {
        setError("Unable to sign in. Check your email and password.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-5 md:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl overflow-hidden rounded-[36px] border border-[#ea2d2d]/12 bg-white shadow-[0_30px_80px_rgba(17,24,39,0.14)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#7f1d1d_0%,#ea2d2d_55%,#ff8e8e_100%)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(0,0,0,0.18),transparent_28%)]" />
          <div className="relative">
            <div className="inline-flex rounded-3xl bg-white/10 p-4 backdrop-blur-md">
              <Image src="/onepws-logo.webp" alt="OnePWS" width={220} height={56} className="h-auto w-[220px]" priority />
            </div>
            <p className="mt-10 text-xs uppercase tracking-[0.32em] text-white/70">Admin Access</p>
            <h1 className="mt-4 max-w-md text-5xl leading-[1.05] font-semibold">Manage leads, routing, prompts, and internal follow-up.</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/84">
              A dedicated operations console for the OnePWS AI chatbot across enterprise enquiries, project conversations, and department routing.
            </p>
          </div>
          <div className="relative grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/16 bg-white/10 p-5 backdrop-blur-md">
              <p className="text-sm font-medium">Lead intelligence</p>
              <p className="mt-2 text-sm text-white/72">View qualified conversations, summaries, and department ownership in one place.</p>
            </div>
            <div className="rounded-3xl border border-white/16 bg-white/10 p-5 backdrop-blur-md">
              <p className="text-sm font-medium">Routing control</p>
              <p className="mt-2 text-sm text-white/72">Adjust rules, people mappings, prompts, and visibility from a single panel.</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-white p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <Image src="/onepws-logo.webp" alt="OnePWS" width={180} height={46} className="h-auto w-[180px]" priority />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ea2d2d]">Secure Sign In</p>
            <h2 className="mt-3 text-4xl leading-tight font-semibold text-slate-950">Welcome back to the OnePWS admin console.</h2>
            <p className="mt-4 text-sm leading-6 text-slate-500">Use your admin credentials to access leads, sessions, analytics, and routing workflows.</p>

            <div className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Mail className="h-4 w-4 text-[#ea2d2d]" />
                  Email
                </span>
                <Input
                  placeholder="admin@onepws.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50"
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <LockKeyhole className="h-4 w-4 text-[#ea2d2d]" />
                  Password
                </span>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50"
                />
              </label>

              {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

              <Button className="h-12 w-full rounded-2xl bg-[#ea2d2d] text-base font-semibold hover:opacity-95" onClick={() => void onSubmit()} disabled={loading}>
                {loading ? "Signing in..." : "Enter Dashboard"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Seed Access</p>
              <p className="mt-3 text-sm text-slate-700">Email: <span className="font-medium">admin@onepws.com</span></p>
              <p className="mt-1 text-sm text-slate-700">Password: <span className="font-medium">OnepwsAdmin@123</span></p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
