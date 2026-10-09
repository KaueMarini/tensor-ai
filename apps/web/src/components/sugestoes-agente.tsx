import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Check, ExternalLink, GitCompareArrows, Hourglass, Layers, Loader2, OctagonAlert, RefreshCw, Scale, ScanSearch, Sparkles, UserRoundPlus, UserRoundX, X } from "lucide-react";
import { type RotaTask, type SugestaoAgente, useAnalisarAgora, useDecidirSugestao, useSugestoesAgente } from "@/lib/sugestoes-agente";
import { cn, formatHoras, tempoRelativo } from "@/lib/utils";
import { STATUS_CARGA } from "@/components/carga";
import { Card } from "@/components/ui/card";
import { ModalExplicacao } from "@/components/explicacao-agente";
import { SomenteGestor } from "@/lib/papel";

const AZDO_ORG_URL = (import.meta.env.VITE_AZDO_ORG_URL as string | undefined)?.replace(/\/$/, "");

const VISUAL: Record<SugestaoAgente["tipo"], { icone: typeof Bot; cor: string; aprovar: string }> = {
  rebalancear: { icone: OctagonAlert, cor: STATUS_CARGA.sobrecarga.cor, aprovar: "Aprovar e reatribuir no DevOps" },
  ausencia: { icone: OctagonAlert, cor: STATUS_CARGA["sem-capacidade"].cor, aprovar: "Aprovar e reatribuir no DevOps" },
  atribuir: { icone: UserRoundX, cor: STATUS_CARGA.limite.cor, aprovar: "Aprovar e atribuir no DevOps" },
  equipe: { icone: UserRoundPlus, cor: "var(--color-brand-600)", aprovar: "Vou montar" },
  portfolio: { icone: Scale, cor: STATUS_CARGA.limite.cor, aprovar: "Vou avaliar" },
  similares: { icone: GitCompareArrows, cor: "var(--color-brand-600)", aprovar: "Vou avaliar" },
  gargalo: { icone: Hourglass, cor: STATUS_CARGA.sobrecarga.cor, aprovar: "Vou destravar" },
  wip: { icone: Layers, cor: STATUS_CARGA.limite.cor, aprovar: "Vou conversar" },
};
const PRIORIDADE = { 1: "Hoje", 2: "Esta semana", 3: "Quando der" } as const;

export const TIPOS_ALOCACAO: SugestaoAgente["tipo"][] = ["rebalancear", "ausencia", "atribuir", "equipe"];
export const TIPOS_PROCESSO: SugestaoAgente["tipo"][] = ["gargalo", "wip", "portfolio", "similares"];

interface PropsCaixa {
  projetoId?: string;
  limite?: number;
  titulo?: string;
  tipos?: SugestaoAgente["tipo"][];
  descricao?: string;
  vazio?: string;
}

export function SugestoesAgente(props: PropsCaixa) {
  return (
    <SomenteGestor oculto>
      <CaixaSugestoes {...props} />
    </SomenteGestor>
  );
}

function CaixaSugestoes({ projetoId, limite, titulo = "Sugestões do agente", tipos, descricao, vazio }: PropsCaixa) {
  const q = useSugestoesAgente(projetoId);
  const analisar = useAnalisarAgora();
  const [todas, setTodas] = useState(false);
  const lista = (q.data ?? []).filter((s) => !tipos || tipos.includes(s.tipo));
  const visiveis = limite && !todas ? lista.slice(0, limite) : lista;
  const comIA = lista.some((s) => s.usouIA);

  return (
    <Card className="overflow-hidden" id="agente">
      <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-50/80 to-transparent px-5 py-4 dark:border-slate-800 dark:from-brand-900/30">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-700 text-white dark:bg-brand-600">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {titulo}
            {lista.length > 0 && <span className="rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold text-white tabular-nums dark:bg-brand-600">{lista.length}</span>}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {descricao ?? "O agente acompanha o Azure DevOps e propõe ações antes de virarem problema. Os números vêm do motor de capacidade"}
            {comIA ? "; a explicação, da IA" : ""}. Nada muda sem a sua aprovação.
          </p>
        </div>
        <button
          type="button"
          onClick={() => analisar.mutate(projetoId)}
          disabled={analisar.isPending}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {analisar.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Analisar agora
        </button>
      </div>

      {q.isLoading ? (
        <div className="space-y-2 p-5">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
          ))}
        </div>
      ) : q.error ? (
        <p className="px-5 py-6 text-sm text-red-700 dark:text-red-400">Erro ao carregar: {q.error.message}</p>
      ) : lista.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-slate-600 dark:text-slate-300">
          <Sparkles className="size-5 shrink-0 text-emerald-500" />
          {vazio ?? "Nenhuma sugestão pendente."} O agente reavalia a cada mudança no DevOps e a cada 15 minutos.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {visiveis.map((s) => (
            <ItemSugestao key={s.id} s={s} mostrarProjeto={!projetoId} />
          ))}
          {limite && lista.length > limite && (
            <li>
              <button
                type="button"
                onClick={() => setTodas((v) => !v)}
                className="w-full cursor-pointer px-5 py-2.5 text-center text-xs font-medium text-brand-700 hover:bg-slate-50 dark:text-brand-300 dark:hover:bg-slate-800/50"
              >
                {todas ? "Mostrar menos" : `Ver mais ${lista.length - limite}`}
              </button>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

function ItemSugestao({ s, mostrarProjeto }: { s: SugestaoAgente; mostrarProjeto: boolean }) {
  const decidir = useDecidirSugestao();
  const [entendendo, setEntendendo] = useState(false);
  const v = VISUAL[s.tipo];
  const pendente = decidir.isPending;
  const roteaveis = s.rotas.filter((r) => r.paraId && !r.foraDoTime).map((r) => r.taskId);
  const [marcadas, setMarcadas] = useState(() => new Set(roteaveis));
  const lote = s.rotas.length > 0;
  const emLote = roteaveis.length > 0;
  const nMarcadas = roteaveis.filter((id) => marcadas.has(id)).length;
  const alternar = (id: number) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <li className="flex gap-3 px-5 py-4">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${v.cor} 14%, transparent)`, color: v.cor }}>
        <v.icone className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "rounded px-1.5 py-px text-[10px] font-semibold uppercase",
              s.prioridade === 1
                ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                : s.prioridade === 2
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
            )}
          >
            {PRIORIDADE[s.prioridade]}
          </span>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.titulo}</p>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{s.texto}</p>

        {lote && <ListaRotas rotas={s.rotas} marcadas={marcadas} alternar={alternar} />}

        {!lote && s.antes.some((a, i) => a.pct !== s.depois[i]?.pct) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {s.antes.map((a, i) => {
              const d = s.depois[i];
              if (d && d.pct === a.pct) return null;
              const st = d ? STATUS_CARGA[d.status] : null;
              return (
                <span key={a.pessoaId} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 tabular-nums dark:bg-slate-800 dark:text-slate-200">
                  {a.nome.split(" ")[0]}: {a.pct ?? "—"}%
                  <ArrowRight className="size-3 text-slate-400" />
                  <strong style={{ color: st && d!.status !== "ok" ? st.cor : undefined }}>{d?.pct ?? "—"}%</strong>
                </span>
              );
            })}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={pendente || (emLote && nMarcadas === 0)}
            onClick={() => decidir.mutate({ id: s.id, aprovar: true, titulo: s.titulo, ...(emLote ? { itens: roteaveis.filter((id) => marcadas.has(id)) } : {}) })}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-brand-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-900 disabled:opacity-60 dark:bg-brand-600 dark:hover:bg-brand-500"
          >
            {pendente && decidir.variables?.aprovar ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}{" "}
            {emLote ? (nMarcadas === roteaveis.length ? `Rotear tudo no DevOps (${nMarcadas})` : `Rotear ${nMarcadas} no DevOps`) : lote ? "Vou resolver" : v.aprovar}
          </button>
          <button
            type="button"
            disabled={pendente}
            onClick={() => decidir.mutate({ id: s.id, aprovar: false, titulo: s.titulo })}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="size-3.5" /> Ignorar
          </button>
          <button
            type="button"
            onClick={() => setEntendendo(true)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-brand-300 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-200 dark:hover:bg-brand-900/50"
          >
            <ScanSearch className="size-3.5" /> Entender análise
          </button>
          {s.tipo === "equipe" && s.projetoId ? (
            <Link to="/projetos/$projetoId/resumo" params={{ projetoId: s.projetoId }} className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              Ver equipe sugerida
            </Link>
          ) : (
            s.workItemId &&
            AZDO_ORG_URL && (
              <a
                href={`${AZDO_ORG_URL}/_workitems/edit/${s.workItemId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
              >
                #{s.workItemId} <ExternalLink className="size-3" />
              </a>
            )
          )}
          <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
            {mostrarProjeto && s.projeto ? `${s.projeto} · ` : ""}
            {s.usouIA ? `explicado pelo ${s.ia === "gemini" ? "Gemini" : "Claude"}` : "texto automático"} · {tempoRelativo(s.criadaEm)}
          </span>
        </div>
      </div>
      {entendendo && <ModalExplicacao sugestao={s} onClose={() => setEntendendo(false)} />}
    </li>
  );
}

const VISIVEIS_ROTAS = 4;

function ListaRotas({ rotas, marcadas, alternar }: { rotas: RotaTask[]; marcadas: Set<number>; alternar: (id: number) => void }) {
  const [todas, setTodas] = useState(false);
  const mostradas = todas ? rotas : rotas.slice(0, VISIVEIS_ROTAS);
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {mostradas.map((r) => {
          const roteavel = !!r.paraId && !r.foraDoTime;
          const id = `rota-${r.taskId}`;
          return (
            <li key={r.taskId} className={cn("flex items-start gap-3 px-3 py-2.5", !roteavel && "bg-slate-50/70 dark:bg-slate-800/30")}>
              <input
                id={id}
                type="checkbox"
                disabled={!roteavel}
                checked={roteavel && marcadas.has(r.taskId)}
                onChange={() => alternar(r.taskId)}
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
              />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                <span className="flex flex-wrap items-baseline gap-x-2 text-sm text-slate-800 dark:text-slate-100">
                  {AZDO_ORG_URL ? (
                    <a href={`${AZDO_ORG_URL}/_workitems/edit/${r.taskId}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
                      #{r.taskId}
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500">#{r.taskId}</span>
                  )}
                  <span className="font-medium">{r.titulo}</span>
                  <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    {formatHoras(r.horas)} · {r.sprint}
                  </span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {r.paraNome ? (
                    <>
                      <ArrowRight className="size-3 text-slate-400" />
                      <strong className="font-semibold text-slate-900 dark:text-slate-100">{r.paraNome}</strong>
                      {r.antesPct !== null && (
                        <span className="tabular-nums">
                          {r.antesPct}% → {r.depoisPct}%
                        </span>
                      )}
                      {r.livreH !== null && <span className="text-slate-400 dark:text-slate-500">· {formatHoras(r.livreH)} livres</span>}
                      {r.skills.slice(0, 3).map((t) => (
                        <span key={t} className="rounded bg-emerald-50 px-1.5 py-px text-[11px] text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                          {t}
                        </span>
                      ))}
                      {r.projetoSemelhante && (
                        <span className="rounded bg-brand-50 px-1.5 py-px text-[11px] text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
                          atua em {r.projetoSemelhante} ({r.semelhancaPct}% parecido)
                        </span>
                      )}
                      {r.foraDoTime && <span className="text-amber-700 dark:text-amber-400">· fora do time: inclua no projeto antes</span>}
                    </>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">Ninguém com folga no período</span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {rotas.length > VISIVEIS_ROTAS && (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          className="w-full cursor-pointer border-t border-slate-100 px-3 py-2 text-left text-xs font-medium text-brand-700 hover:bg-slate-50 dark:border-slate-800 dark:text-brand-300 dark:hover:bg-slate-800/50"
        >
          {todas ? "Mostrar menos" : `Ver as outras ${rotas.length - VISIVEIS_ROTAS} tasks`}
        </button>
      )}
    </div>
  );
}
