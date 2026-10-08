// Mapa de ocupação pessoa × semana (todos os projetos somados). Lê de cima para baixo:
// quem está pior vem primeiro. Célula = % de uso; cor = status pelos limites do gestor.

import type { CelulaGlobal } from "@shared/capacidade/global";
import type { StatusCarga } from "@shared/capacidade/motor";
import type { Periodo } from "@/lib/ocupacao";
import { cn, formatHoras } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { pct, STATUS_CARGA, StatusCargaTag } from "@/components/carga";

const GRAVIDADE: Record<StatusCarga, number> = { "sem-capacidade": 3, sobrecarga: 2, limite: 1, ok: 0 };

export interface LinhaMapa {
  id: string;
  nome: string;
  subtitulo?: string;
}

export function ordenarPorRisco<T extends { id: string }>(
  linhas: T[],
  celula: (p: Periodo, id: string) => CelulaGlobal | undefined,
  periodos: Periodo[],
): T[] {
  const nota = (id: string) => {
    let g = 0;
    let u = 0;
    for (const p of periodos) {
      const c = celula(p, id);
      if (!c) continue;
      g = Math.max(g, GRAVIDADE[c.status]);
      u = Math.max(u, c.utilizacao ?? 0);
    }
    return g * 10 + u;
  };
  const notas = new Map(linhas.map((l) => [l.id, nota(l.id)]));
  return [...linhas].sort((a, b) => notas.get(b.id)! - notas.get(a.id)!);
}

export function MapaOcupacao({
  linhas,
  periodos,
  celula,
  nomeProjeto,
  onAbrir,
}: {
  linhas: LinhaMapa[];
  periodos: Periodo[];
  celula: (p: Periodo, id: string) => CelulaGlobal | undefined;
  nomeProjeto: (id: string) => string;
  onAbrir?: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-x-1 border-spacing-y-1 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white pl-4 text-left text-[11px] font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              Pessoa
            </th>
            {periodos.map((p, i) => (
              <th key={p.id} className="min-w-[64px] px-1 pb-1 text-center text-[11px] font-medium whitespace-nowrap text-slate-500 dark:text-slate-400">
                {i === 0 ? "Esta semana" : p.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id}>
              <td className="sticky left-0 z-10 w-[200px] max-w-[200px] bg-white py-0.5 pr-2 pl-4 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => onAbrir?.(l.id)}
                  disabled={!onAbrir}
                  className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md py-0.5 text-left hover:text-brand-700 disabled:cursor-default dark:hover:text-brand-300"
                >
                  <Avatar nome={l.nome} tamanho="xs" className="ring-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">{l.nome}</span>
                    {l.subtitulo && <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{l.subtitulo}</span>}
                  </span>
                </button>
              </td>
              {periodos.map((p) => (
                <td key={p.id} className="p-0">
                  <CelulaMapa c={celula(p, l.id)} nomeProjeto={nomeProjeto} onClick={onAbrir ? () => onAbrir(l.id) : undefined} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CelulaMapa({ c, nomeProjeto, onClick }: { c?: CelulaGlobal; nomeProjeto: (id: string) => string; onClick?: () => void }) {
  if (!c) return <div className="h-10 rounded-md bg-slate-50 dark:bg-slate-800/40" />;
  const ausente = c.capacidadeH === 0;
  const livre = !ausente && c.cargaH === 0;
  if (livre)
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Sem tasks nesta semana · ${formatHoras(c.capacidadeH)} livres`}
        className="flex h-10 w-full cursor-pointer items-center justify-center rounded-md bg-slate-50 text-[11px] text-slate-400 transition-transform hover:scale-[1.04] dark:bg-slate-800/40 dark:text-slate-500"
      >
        livre
      </button>
    );
  const s = STATUS_CARGA[c.status];
  const forte = c.status === "sobrecarga" || c.status === "sem-capacidade";
  const intensidade = ausente ? 0 : c.status === "ok" ? 8 + Math.min(1, c.utilizacao ?? 0) * 14 : forte ? 30 : 24;
  const titulo = [
    ausente ? (c.cargaH > 0 ? `Ausente com ${formatHoras(c.cargaH)} de tasks` : "Ausente (folga, férias ou feriado)") : `${formatHoras(c.cargaH)} de ${formatHoras(c.capacidadeH)} · ${pct(c.utilizacao)}`,
    s.rotulo,
    ...c.porProjeto.map((x) => `${nomeProjeto(x.projetoId)}: ${formatHoras(x.cargaH)}`),
  ].join("\n");

  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      className={cn(
        "flex h-10 w-full cursor-pointer flex-col items-center justify-center rounded-md text-xs tabular-nums transition-transform hover:scale-[1.04]",
        ausente && c.cargaH === 0 && "bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgb(148_163_184/0.15)_4px,rgb(148_163_184/0.15)_8px)]",
      )}
      style={
        ausente && c.cargaH === 0
          ? undefined
          : {
              background: `color-mix(in oklab, ${s.cor} ${ausente ? 30 : intensidade}%, transparent)`,
              boxShadow: forte ? `inset 0 0 0 1.5px ${s.cor}` : undefined,
            }
      }
    >
      {ausente ? (
        <span className={cn("text-[11px] font-medium", c.cargaH > 0 ? "text-red-800 dark:text-red-300" : "text-slate-400")}>
          {c.cargaH > 0 ? "ausente!" : "ausente"}
        </span>
      ) : (
        <>
          <span className={cn("font-semibold", forte ? "text-red-800 dark:text-red-200" : "text-slate-800 dark:text-slate-100")}>
            {pct(c.utilizacao)}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">{formatHoras(c.cargaH)}</span>
        </>
      )}
    </button>
  );
}

export function LegendaMapa() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {(["ok", "limite", "sobrecarga"] as const).map((s) => (
        <StatusCargaTag key={s} status={s} className="font-normal text-slate-600 dark:text-slate-300" />
      ))}
      <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
        <span className="size-3 rounded-sm bg-[repeating-linear-gradient(135deg,transparent,transparent_2px,rgb(148_163_184/0.4)_2px,rgb(148_163_184/0.4)_4px)]" />
        Ausente
      </span>
    </div>
  );
}
