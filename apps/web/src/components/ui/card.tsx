import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { TermoGlossario } from "@/lib/glossario";
import { cn } from "@/lib/utils";
import { Ajuda } from "@/components/ajuda";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitulo({
  icone: Icone,
  titulo,
  descricao,
  acao,
  ajuda,
}: {
  icone?: LucideIcon;
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
  /** Termo do glossário explicado num "?" ao lado do título. */
  ajuda?: TermoGlossario;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
      {Icone && (
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <Icone className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {titulo}
          {ajuda && <Ajuda termo={ajuda} />}
        </h2>
        {descricao && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

/** Indicador (stat tile): rótulo, valor e detalhe opcional. */
export function Stat({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  alerta,
  ajuda,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  alerta?: boolean;
  /** Termo do glossário explicado num "?" ao lado do rótulo. */
  ajuda?: TermoGlossario;
}) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3.5">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg",
          alerta
            ? "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
            : "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
        )}
      >
        <Icone className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl leading-tight font-semibold text-slate-900 dark:text-slate-100">{valor}</div>
        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate">
            {rotulo}
            {detalhe && <span className="text-slate-400 dark:text-slate-500"> · {detalhe}</span>}
          </span>
          {ajuda && <Ajuda termo={ajuda} />}
        </div>
      </div>
    </Card>
  );
}
