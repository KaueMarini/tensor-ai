import { useEffect } from "react";
import { BarChart3, Bot, Clock, Grid2x2, Loader2, X } from "lucide-react";
import type { FerramentaMatriz, FerramentaPareto, FerramentaTempo, Quadrante } from "@shared/agente/explicacao";
import { type SugestaoAgente, useExplicacao } from "@/lib/sugestoes-agente";
import { cn } from "@/lib/utils";

const NOME_IA: Record<string, string> = { gemini: "Gemini", claude: "Claude" };
const QUADRANTE: Record<Quadrante, { rotulo: string; cor: string; dica: string }> = {
  "quick-win": { rotulo: "Quick win", cor: "var(--status-ok)", dica: "pouco esforço, muito impacto" },
  "grande-aposta": { rotulo: "Grande aposta", cor: "var(--color-brand-600)", dica: "muito esforço, muito impacto" },
  preenchimento: { rotulo: "Preenchimento", cor: "var(--color-slate-400)", dica: "pouco esforço, pouco impacto" },
  evitar: { rotulo: "Evitar", cor: "var(--status-critico)", dica: "muito esforço, pouco impacto" },
};

export function ModalExplicacao({ sugestao, onClose }: { sugestao: SugestaoAgente; onClose: () => void }) {
  const q = useExplicacao(sugestao.id);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const d = q.data;
  const origem = (k: string) => d?.origem[k] === "ia";

  return (
    <div className="anim-fade fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Entender análise"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-700 text-white dark:bg-brand-600">
            <Bot className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold tracking-wide text-brand-700 uppercase dark:text-brand-300">Entender análise · visão técnica</div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{sugestao.titulo}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {q.isLoading ? (
            <div className="grid place-items-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="size-6 animate-spin text-brand-600" />O agente está analisando os dados desta sugestão…
            </div>
          ) : q.error ? (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">Não foi possível gerar a análise: {q.error.message}</p>
          ) : d ? (
            <>
              <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-slate-800 dark:border-brand-800 dark:bg-brand-900/20 dark:text-slate-100">
                {d.resumo}
                <Origem ia={origem("resumo") ? d.ia : null} />
              </div>
              {d.ferramentas.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">Para esta sugestão não há dados suficientes de tempo, carga ou esforço para uma análise técnica além do resumo.</p>
              )}
              {d.ferramentas.map((f) => (
                <section key={f.tipo} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  {f.tipo === "tempo" && <Tempo f={f} />}
                  {f.tipo === "pareto" && <Pareto f={f} />}
                  {f.tipo === "matriz" && <Matriz f={f} />}
                  {d.leituras[f.tipo] && (
                    <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:text-slate-200">
                      {d.leituras[f.tipo]}
                      <Origem ia={origem(f.tipo) ? d.ia : null} />
                    </p>
                  )}
                </section>
              ))}
            </>
          ) : null}
        </div>

        <footer className="border-t border-slate-100 px-6 py-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Números calculados pelo motor de capacidade a partir do Azure DevOps. A IA só escreve a leitura, recebendo números e nunca nomes de pessoas, e o
          texto é conferido contra os dados antes de aparecer.
        </footer>
      </div>
    </div>
  );
}

function Origem({ ia }: { ia: string | null }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded bg-white/70 px-1.5 py-px align-middle text-[10px] font-medium text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
      {ia ? (
        <>
          <Bot className="size-3" /> {NOME_IA[ia] ?? ia}
        </>
      ) : (
        "texto automático"
      )}
    </span>
  );
}

function Titulo({ icone: Icone, titulo, sub }: { icone: typeof Clock; titulo: string; sub: string }) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <Icone className="mt-0.5 size-4 shrink-0 text-brand-700 dark:text-brand-300" />
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{titulo}</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

function Tempo({ f }: { f: FerramentaTempo }) {
  const max = Math.max(1, ...f.mapa.celulas.flat());
  return (
    <>
      <Titulo icone={Clock} titulo="Diagnóstico de tempo" sub="Lead time (desde a criação) e tempo parado no estado atual, comparados às tasks abertas do projeto." />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {f.alvo && <Kpi rotulo="Lead time da task" valor={f.alvo.leadDias} />}
        {f.alvo && <Kpi rotulo={`Parada em "${f.alvo.estado}"`} valor={f.alvo.paradoDias} alerta={f.estourado} />}
        <Kpi rotulo="Mediana parada (projeto)" valor={f.medianaParadoDias} />
        <Kpi rotulo="Mediana lead time" valor={f.medianaLeadDias} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="text-left font-medium text-slate-500 dark:text-slate-400">Mapa de calor · dias parado →</th>
              {f.mapa.colunas.map((c) => (
                <th key={c} className="font-medium text-slate-500 dark:text-slate-400">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.mapa.linhas.map((l, i) => (
              <tr key={l}>
                <td className="pr-2 text-slate-700 dark:text-slate-200">{l}</td>
                {f.mapa.celulas[i]!.map((n, j) => {
                  const destaque = f.mapa.destaque?.[0] === i && f.mapa.destaque?.[1] === j;
                  const quente = j >= 2;
                  return (
                    <td key={j} className="p-0">
                      <div
                        className={cn("grid h-9 place-items-center rounded-md font-semibold tabular-nums", destaque && "ring-2 ring-brand-600 ring-offset-1 dark:ring-offset-slate-900")}
                        style={{ background: n ? `color-mix(in oklab, ${quente ? "var(--status-critico)" : "var(--status-atencao)"} ${12 + (n / max) * 45}%, transparent)` : undefined }}
                        title={destaque ? "A task da sugestão está aqui" : `${n} tasks`}
                      >
                        {n || <span className="text-slate-300 dark:text-slate-600">·</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Kpi({ rotulo, valor, alerta }: { rotulo: string; valor: number | null; alerta?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", alerta ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-slate-200 dark:border-slate-800")}>
      <div className={cn("text-lg font-semibold tabular-nums", alerta ? "text-red-700 dark:text-red-300" : "text-slate-900 dark:text-slate-100")}>
        {valor === null ? "—" : `${String(valor).replace(".", ",")} ${valor === 1 ? "dia" : "dias"}`}
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{rotulo}</div>
    </div>
  );
}

function Pareto({ f }: { f: FerramentaPareto }) {
  const max = Math.max(...f.itens.map((i) => i.valor), 1);
  return (
    <>
      <Titulo icone={BarChart3} titulo="Princípio de Pareto (80/20)" sub={`${f.titulo}. A linha marca os itens que somam 80% do total.`} />
      <ul className="space-y-1">
        {f.itens.map((i, idx) => (
          <li key={i.rotulo}>
            <div className="flex items-center gap-2 text-xs">
              <span className={cn("w-5 shrink-0 text-right tabular-nums text-slate-400")}>{idx + 1}</span>
              <span className={cn("w-56 shrink-0 truncate", i.destaque ? "font-semibold text-brand-800 dark:text-brand-200" : "text-slate-700 dark:text-slate-200")} title={i.rotulo}>
                {i.rotulo}
              </span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded"
                  style={{ width: `${(i.valor / max) * 100}%`, background: i.destaque ? "var(--color-brand-600)" : idx < f.corte80 ? "var(--status-atencao)" : "var(--color-slate-300)" }}
                />
              </div>
              <span className="w-12 shrink-0 text-right tabular-nums text-slate-700 dark:text-slate-200">
                {String(i.valor).replace(".", ",")}
                {f.unidade}
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums text-slate-400">{i.acumuladoPct}%</span>
            </div>
            {idx + 1 === f.corte80 && idx + 1 < f.itens.length && (
              <div className="my-1 flex items-center gap-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                <span className="h-px flex-1 border-t border-dashed border-amber-500" /> 80% do total em {f.corte80} {f.corte80 === 1 ? "item" : "itens"}
                <span className="h-px flex-1 border-t border-dashed border-amber-500" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Matriz({ f }: { f: FerramentaMatriz }) {
  const q = QUADRANTE[f.quadrante];
  return (
    <>
      <Titulo icone={Grid2x2} titulo="Matriz Esforço × Impacto" sub={`${f.eixoEsforco}. ${f.eixoImpacto}.`} />
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="relative aspect-square w-64 shrink-0">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-lg border border-slate-200 text-[10px] font-semibold dark:border-slate-700">
            {(["quick-win", "grande-aposta", "preenchimento", "evitar"] as Quadrante[]).map((k) => (
              <div
                key={k}
                className={cn(
                  "flex p-1.5",
                  { "quick-win": "items-end justify-end", "grande-aposta": "items-end justify-start", preenchimento: "items-start justify-end", evitar: "items-start justify-start" }[k],
                  k === f.quadrante ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500",
                )}
                style={{ background: k === f.quadrante ? `color-mix(in oklab, ${QUADRANTE[k].cor} 18%, transparent)` : undefined }}
              >
                {QUADRANTE[k].rotulo}
              </div>
            ))}
          </div>
          {f.pontos.map((p, idx) => (
            <div
              key={p.rotulo}
              className="absolute -translate-x-1/2 translate-y-1/2"
              style={{ left: `${10 + p.esforco * 80}%`, bottom: `${10 + p.impacto * 80}%` }}
              title={`${p.rotulo}: esforço ${Math.round(p.esforco * 100)}%, impacto ${Math.round(p.impacto * 100)}%`}
            >
              <span className={cn("block rounded-full border-2 border-white shadow dark:border-slate-900", p.destaque ? "size-4" : "size-2.5 opacity-60")} style={{ background: p.destaque ? q.cor : "var(--color-slate-500)" }} />
              {p.destaque && (
                <span
                  className={cn(
                    "absolute left-1/2 -translate-x-1/2 rounded bg-white/85 px-1 text-[10px] font-semibold whitespace-nowrap text-slate-800 dark:bg-slate-900/85 dark:text-slate-100",
                    idx % 2 ? "bottom-full mb-0.5" : "top-full mt-0.5",
                  )}
                >
                  {p.rotulo}
                </span>
              )}
            </div>
          ))}
          <span className="absolute -bottom-5 left-0 w-full text-center text-[10px] text-slate-400">esforço →</span>
          <span className="absolute top-1/2 -left-7 -translate-y-1/2 -rotate-90 text-[10px] text-slate-400">impacto →</span>
        </div>
        <div className="text-sm">
          <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `color-mix(in oklab, ${q.cor} 16%, transparent)`, color: q.cor }}>
            {q.rotulo}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{q.dica}</p>
        </div>
      </div>
    </>
  );
}
