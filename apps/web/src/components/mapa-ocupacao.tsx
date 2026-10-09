// Mapa de ocupação pessoa × semana (todos os projetos somados). Lê de cima para baixo:
// quem está pior vem primeiro. Célula = % de uso + mini barra; só células de risco ganham
// fundo, então o olho vai direto para o problema. Status sempre com ícone/texto, nunca só cor.

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
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            <th className="sticky left-0 z-10 bg-white py-2.5 pr-3 pl-5 text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:bg-slate-900 dark:text-slate-400">
              Pessoa
            </th>
            {periodos.map((p, i) => (
              <th
                key={p.id}
                className={cn(
                  "min-w-[76px] px-1 py-2.5 text-center text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase",
                  i === 0 ? "text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400",
                )}
              >
                {i === 0 ? "Esta semana" : p.rotulo}
              </th>
            ))}
            <th className="w-3" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className="group border-b border-slate-100 last:border-b-0 dark:border-slate-800/80">
              <td className="sticky left-0 z-10 w-[230px] max-w-[230px] bg-white py-1.5 pr-3 pl-5 group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/40">
                <button
                  type="button"
                  onClick={() => onAbrir?.(l.id)}
                  disabled={!onAbrir}
                  title={onAbrir ? `Ver a ocupação de ${l.nome}` : l.nome}
                  className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md text-left disabled:cursor-default"
                >
                  <Avatar nome={l.nome} tamanho="sm" className="ring-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-slate-800 group-hover:text-brand-800 dark:text-slate-100 dark:group-hover:text-brand-200">
                      {l.nome}
                    </span>
                    {l.subtitulo && <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{l.subtitulo}</span>}
                  </span>
                </button>
              </td>
              {periodos.map((p) => (
                <td key={p.id} className="px-1 py-1.5 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/40">
                  <CelulaMapa c={celula(p, l.id)} nomeProjeto={nomeProjeto} onClick={onAbrir ? () => onAbrir(l.id) : undefined} />
                </td>
              ))}
              <td className="group-hover:bg-slate-50 dark:group-hover:bg-slate-800/40" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CelulaMapa({ c, nomeProjeto, onClick }: { c?: CelulaGlobal; nomeProjeto: (id: string) => string; onClick?: () => void }) {
  const base = "flex h-10 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md transition-colors";
  if (!c) return <div className="h-10" />;

  const ausente = c.capacidadeH === 0;
  if (ausente) {
    const comTask = c.cargaH > 0;
    return (
      <button
        type="button"
        onClick={onClick}
        title={comTask ? `Ausente, mas com ${formatHoras(c.cargaH)} de tasks` : "Ausente (folga, férias ou feriado)"}
        className={cn(
          base,
          "bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgb(148_163_184/0.14)_4px,rgb(148_163_184/0.14)_8px)] hover:bg-slate-100 dark:hover:bg-slate-800",
          comTask && "ring-1 ring-inset",
        )}
        style={comTask ? { ["--tw-ring-color" as string]: STATUS_CARGA["sem-capacidade"].cor } : undefined}
      >
        <span className={cn("text-[11px] font-medium", comTask ? "text-red-700 dark:text-red-300" : "text-slate-400 dark:text-slate-500")}>
          Ausente
        </span>
      </button>
    );
  }

  if (c.cargaH === 0)
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Sem tasks nesta semana · ${formatHoras(c.capacidadeH)} livres`}
        className={cn(base, "text-sm text-slate-300 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800")}
      >
        —
      </button>
    );

  const s = STATUS_CARGA[c.status];
  const risco = c.status !== "ok";
  const uso = Math.min(1, c.utilizacao ?? 0);
  const titulo = [
    `${formatHoras(c.cargaH)} de ${formatHoras(c.capacidadeH)} · ${pct(c.utilizacao)} · ${s.rotulo}`,
    ...c.porProjeto.map((x) => `${nomeProjeto(x.projetoId)}: ${formatHoras(x.cargaH)}`),
  ].join("\n");

  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      className={cn(base, !risco && "hover:bg-slate-100 dark:hover:bg-slate-800")}
      style={risco ? { background: `color-mix(in oklab, ${s.cor} ${c.status === "limite" ? 12 : 14}%, transparent)` } : undefined}
    >
      <span className="flex items-center gap-1 text-[13px] leading-none font-semibold tabular-nums text-slate-800 dark:text-slate-100">
        {risco && <s.icone className="size-3" style={{ color: s.cor }} aria-label={s.rotulo} />}
        {pct(c.utilizacao)}
      </span>
      <span className="h-[3px] w-9 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80">
        <span className="block h-full rounded-full" style={{ width: `${uso * 100}%`, background: s.cor }} />
      </span>
    </button>
  );
}

export function LegendaMapa() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {(["ok", "limite", "sobrecarga"] as const).map((s) => (
        <StatusCargaTag key={s} status={s} className="font-normal text-slate-600 dark:text-slate-300" />
      ))}
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <span className="size-3 rounded-sm bg-[repeating-linear-gradient(135deg,transparent,transparent_2px,rgb(148_163_184/0.45)_2px,rgb(148_163_184/0.45)_4px)]" />
        Ausente
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <span className="text-slate-400">—</span> Sem tasks
      </span>
    </div>
  );
}
