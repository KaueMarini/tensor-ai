// Visual da carga de uma pessoa (saída do motor). Status sempre com ícone + texto,
// nunca só cor; o texto usa tinta neutra, a cor fica no ícone e na barra.

import { AlertTriangle, CalendarOff, CircleCheck, OctagonAlert, type LucideIcon } from "lucide-react";
import type { Celula, StatusCarga } from "@shared/capacidade/motor";
import type { OrigemCapacidade } from "@shared/capacidade/regras";
import { cn, formatHoras } from "@/lib/utils";

export const STATUS_CARGA: Record<StatusCarga, { rotulo: string; icone: LucideIcon; cor: string }> = {
  ok: { rotulo: "Com folga", icone: CircleCheck, cor: "var(--status-ok)" },
  limite: { rotulo: "No limite", icone: AlertTriangle, cor: "var(--status-atencao)" },
  sobrecarga: { rotulo: "Sobrecarregado", icone: OctagonAlert, cor: "var(--status-critico)" },
  "sem-capacidade": { rotulo: "Sem capacidade", icone: CalendarOff, cor: "var(--status-critico)" },
};

/** De onde veio a capacidade (o gestor sabe onde mexer). */
export const ORIGEM_CAPACIDADE: Record<OrigemCapacidade, { rotulo: string; detalhe: string }> = {
  gestor: { rotulo: "Gestor", detalhe: "definida pelo gestor (Regras de capacidade ou aba Equipe do projeto)" },
  devops: { rotulo: "DevOps", detalhe: "Capacity configurada no Azure DevOps" },
  padrao: { rotulo: "Padrão", detalhe: "regra geral (padrão de mercado se ninguém mudou)" },
};

export const pct = (u: number | null) => (u === null ? "—" : `${Math.round(u * 100)}%`);

export function StatusCargaTag({ status, className }: { status: StatusCarga; className?: string }) {
  const s = STATUS_CARGA[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-200", className)}>
      <s.icone className="size-3.5" style={{ color: s.cor }} /> {s.rotulo}
    </span>
  );
}

/** Medidor: carga sobre capacidade. Passa de 100% marca o excesso. */
export function MedidorCarga({ celula, compacto }: { celula: Celula; compacto?: boolean }) {
  const s = STATUS_CARGA[celula.status];
  const fracao = celula.capacidadeH > 0 ? Math.min(1, celula.cargaH / celula.capacidadeH) : celula.cargaH > 0 ? 1 : 0;
  return (
    <div>
      {!compacto && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <StatusCargaTag status={celula.status} />
          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-100">{formatHoras(celula.cargaH)}</span> de{" "}
            {formatHoras(celula.capacidadeH)} · {pct(celula.utilizacao)}
          </span>
        </div>
      )}
      <div
        className="h-2 overflow-hidden rounded-full"
        style={{ background: `color-mix(in oklab, ${s.cor} 16%, transparent)` }}
        title={`${formatHoras(celula.cargaH)} de ${formatHoras(celula.capacidadeH)} (${pct(celula.utilizacao)})`}
      >
        <div className="h-full rounded-full" style={{ width: `${fracao * 100}%`, background: s.cor }} />
      </div>
    </div>
  );
}
