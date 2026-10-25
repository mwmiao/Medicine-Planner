"use client";

import Link from "next/link";
import type { ComponentProps, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "success" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white active:bg-blue-800",
  secondary: "bg-white text-primary border-2 border-primary active:bg-primary-soft",
  success: "bg-taken text-white active:bg-green-800",
  danger: "bg-white text-danger border-2 border-danger active:bg-danger-soft",
  ghost: "bg-transparent text-primary underline underline-offset-4",
};

const base =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-lg font-semibold transition-colors disabled:opacity-50 select-none";

export function Button({
  variant = "primary",
  block,
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; block?: boolean }) {
  return <button type="button" className={`${base} ${variants[variant]} ${block ? "w-full" : ""} ${className}`} {...props} />;
}

export function LinkButton({
  href,
  variant = "primary",
  block,
  children,
  className = "",
}: {
  href: string;
  variant?: Variant;
  block?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${block ? "w-full" : ""} ${className}`}>
      {children}
    </Link>
  );
}

export function ExternalLink({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: Variant }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${base} ${variants[variant]} w-full`}>
      {children} <span aria-hidden>↗</span>
    </a>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-line ${className}`}>{children}</section>;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-lg font-semibold">
        {label}
        {hint ? <span className="ml-2 text-base font-normal text-muted">({hint})</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-base font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputBase =
  "min-h-14 w-full rounded-xl border-2 bg-white px-4 py-3 text-lg text-ink placeholder:text-gray-400 focus:border-primary focus:outline-none";

export function TextInput({ invalid, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={`${inputBase} ${invalid ? "border-danger" : "border-line"} ${className}`} aria-invalid={invalid || undefined} {...props} />;
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputBase} border-line ${className}`} rows={3} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${inputBase} border-line ${className}`} {...props} />;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const tones = {
    info: "bg-primary-soft text-blue-950",
    warn: "bg-overdue-soft text-amber-950",
    error: "bg-danger-soft text-red-950",
    success: "bg-taken-soft text-green-950",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-2xl px-4 py-3 text-lg ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-3xl font-bold">{children}</h1>
      {sub ? <p className="mt-1 text-lg text-muted">{sub}</p> : null}
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <p className="py-10 text-center text-lg text-muted" role="status">
      {label}
    </p>
  );
}

export function ColorDot({ color, size = "h-6 w-6" }: { color?: string; size?: string }) {
  if (!color) return null;
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ring-2 ring-white ${size}`} style={{ background: color }} />;
}
