// Caixa de sugestões do agente de IA: cada uma diz o problema, a ação e o efeito (números do
// motor), com Aprovar (aplica no Azure DevOps, auditado) e Ignorar. A IA sugere, o gestor decide.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Check, ExternalLink, GitCompareArrows, Loader2, OctagonAlert, RefreshCw, Scale, ScanSearch, Sparkles, UserRoundPlus, UserRoundX, X } from "lucide-react";
import { type SugestaoAgente, useAnalisarAgora, useDecidirSugestao, useSugestoesAgente } from "@/lib/sugestoes-agente";
import { cn, tempoRelativo } from "@/lib/utils";
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
};
const PRIORIDADE = { 1: "Hoje", 2: "Esta semana", 3: "Quando der" } as const;

export function SugestoesAgente(props: { projetoId?: string; limite?: number; titulo?: string }) {
  // sugestões são executivas: membro não vê a caixa (o banco também não devolve as linhas)
  return (
    <SomenteGestor oculto>
      <CaixaSugestoes {...props} />
    </SomenteGestor>
  );
}

function CaixaSugestoes({ projetoId, limite, titulo = "Sugestões do agente" }: { projetoId?: string; limite?: number; titulo?: string }) {
  const q = useSugestoesAgente(projetoId);
  const analisar = useAnalisarAgora();
  const [todas, setTodas] = useState(false);
  const lista = q.data ?? [];
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
            O agente acompanha o Azure DevOps e propõe ações antes de virarem problema. Os números vêm do motor de capacidade
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
          Nenhuma sugestão pendente. O agente reavalia a cada mudança no DevOps e a cada 15 minutos.
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

        {s.antes.some((a, i) => a.pct !== s.depois[i]?.pct) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {s.antes.map((a, i) => {
              const d = s.depois[i];
              if (d && d.pct === a.pct) return null; // ex.: task sem estimativa não muda o %
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
            disabled={pendente}
            onClick={() => decidir.mutate({ id: s.id, aprovar: true, titulo: s.titulo })}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-brand-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-900 disabled:opacity-60 dark:bg-brand-600 dark:hover:bg-brand-500"
          >
            {pendente && decidir.variables?.aprovar ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {v.aprovar}
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
