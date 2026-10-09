import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 shadow-xs",
        "focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-600/15",
        "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
        className,
      )}
      {...props}
    />
  );
}
