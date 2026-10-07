import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "slate" | "teal" | "blue" | "amber" | "green" | "red" | "violet";

const tones: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  teal: "bg-brand-50 text-brand-700 ring-brand-100 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-800",
  blue: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900",
  amber: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900",
  red: "bg-red-50 text-red-700 ring-red-100 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900",
  violet: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-900",
};

export function Badge({ className, tone = "slate", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
