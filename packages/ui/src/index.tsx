"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, TextareaHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@onepws/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-[var(--accent)] text-white hover:opacity-90",
        secondary: "bg-white/10 text-[var(--foreground)] hover:bg-white/20",
        outline: "border border-white/15 bg-transparent text-[var(--foreground)] hover:bg-white/6",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  }
);

export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}

export function Card({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("rounded-3xl border border-black/8 bg-white p-5 shadow-sm", className)}>{children}</div>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none ring-0 placeholder:text-black/40 focus:border-[var(--accent)]",
        props.className
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none ring-0 placeholder:text-black/40 focus:border-[var(--accent)]",
        props.className
      )}
    />
  );
}

export function Badge({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <span className={cn("inline-flex rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/70", className)}>{children}</span>;
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold text-black">{title}</h2>
      {subtitle ? <p className="text-sm text-black/60">{subtitle}</p> : null}
    </div>
  );
}
