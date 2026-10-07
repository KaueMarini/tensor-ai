import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-xs",
        "placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-600/15",
        "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500",
        className,
      )}
      {...props}
    />
  );
}
