import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "slate" | "teal" | "blue" | "amber" | "green" | "red" | "violet";

const tones: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  teal: "bg-brand-50 text-brand-700 ring-brand-100",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
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
