import { type ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Modal acessível: role="dialog", fecha com Esc e clique no fundo, foco vai para dentro ao abrir. */
export function Dialog({
  titulo,
  descricao,
  onClose,
  children,
  className,
}: {
  titulo: string;
  descricao?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const tituloId = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef(onClose);
  fechar.current = onClose;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    caixa.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-fechar])")?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar.current();
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", esc);
      anterior?.focus();
    };
  }, []);

  return (
    <div
      className="anim-fade fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "anim-pop w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 id={tituloId} className="font-semibold text-slate-900 dark:text-slate-100">
              {titulo}
            </h2>
            {descricao && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{descricao}</p>}
          </div>
          <button
            data-fechar
            onClick={onClose}
            aria-label="Fechar"
            className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
