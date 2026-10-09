import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function Popover({
  gatilho,
  rotulo,
  children,
  alinhar = "direita",
  className,
  painelClassName,
}: {
  gatilho: (aberto: boolean) => ReactNode;
  rotulo: string;
  children: ReactNode | ((fechar: () => void) => ReactNode);
  alinhar?: "direita" | "esquerda";
  className?: string;
  painelClassName?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const fechar = () => setAberto(false);

  return (
    <div ref={caixa} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={() => setAberto((v) => !v)}
        className="cursor-pointer"
      >
        {gatilho(aberto)}
      </button>
      {aberto && (
        <div
          id={id}
          role="dialog"
          aria-label={rotulo}
          className={cn(
            "anim-pop absolute z-40 mt-1.5 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900",
            alinhar === "direita" ? "right-0" : "left-0",
            painelClassName,
          )}
        >
          {typeof children === "function" ? children(fechar) : children}
        </div>
      )}
    </div>
  );
}
