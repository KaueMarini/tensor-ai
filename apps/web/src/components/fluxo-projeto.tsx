// Métricas → "Fluxo e previsibilidade": o que o gestor precisa para decidir em segundos —
// a sprint fecha? o time está entregando? quanto tempo uma tarefa leva? tem coisa demais aberta?
// Números do módulo puro @shared/metricas/fluxo (datas do Azure DevOps de cada item).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarCheck, Gauge, Hourglass, Timer } from "lucide-react";
import { diasUteis, horasPendentes } from "@shared/capacidade/motor";
import { categoriaDe, TIPOS_FORA_DO_KANBAN } from "@shared/kanban";
import { metricasFluxo, previsaoSprint } from "@shared/metricas/fluxo";
import { useCapacidadeProjeto } from "@/lib/capacidade-projeto";
import { useBacklog, useEstados } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { cn, formatHoras } from "@/lib/utils";
import { Ajuda } from "@/components/ajuda";
import type { TermoGlossario } from "@/lib/glossario";
import { STATUS_CARGA } from "@/components/carga";
import { Card, CardTitulo } from "@/components/ui/card";

const txt = (v: unknown) => (typeof v === "string" && v ? v : null);
const dias = (n: number | null) => (n === null ? "—" : `${String(n).replace(".", ",")} ${n === 1 ? "dia" : "dias"}`);

const PREVISAO = {
  "no-ritmo": { rotulo: "No ritmo", cor: STATUS_CARGA.ok.cor, texto: "O que falta cabe na capacidade que resta." },
  apertado: { rotulo: "Apertado", cor: STATUS_CARGA.limite.cor, texto: "Cabe, mas sem folga para imprevistos." },
  "em-risco": { rotulo: "Em risco", cor: STATUS_CARGA.sobrecarga.cor, texto: "Falta mais trabalho do que capacidade até o fim da sprint." },
  "sem-dados": { rotulo: "Sem dados", cor: "var(--color-slate-400)", texto: "Sem horas ou sem capacidade para comparar." },
} as const;

export function FluxoProjeto({ projetoId }: { projetoId: string }) {
  const estados = useEstados(projetoId);
  const backlog = useBacklog(projetoId);
  const cap = useCapacidadeProjeto(projetoId);
  const itens = useQuery({
    queryKey: ["backlog", "fluxo", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_item").select("devops_id, tipo, estado, parent_devops_id, fields").eq("projeto_id", projetoId).is("deleted_at", null);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const hoje = new Date().toISOString().slice(0, 10);

  const fluxo = useMemo(() => {
    if (!itens.data) return null;
    const pais = new Set(itens.data.map((i) => i.parent_devops_id).filter((x) => x !== null));
    const folhas = itens.data.filter((i) => !TIPOS_FORA_DO_KANBAN.has(i.tipo) && !pais.has(i.devops_id));
    return metricasFluxo(
      folhas
        .map((i) => {
          const f = (i.fields ?? {}) as Record<string, unknown>;
          return {
            categoria: categoriaDe(i.tipo, i.estado, estados.data),
            criado: txt(f["System.CreatedDate"]),
            ativado: txt(f["Microsoft.VSTS.Common.ActivatedDate"]),
            fechado: txt(f["Microsoft.VSTS.Common.ClosedDate"]),
            mudouEstado: txt(f["Microsoft.VSTS.Common.StateChangeDate"]),
          };
        })
        .filter((i): i is typeof i & { categoria: "Proposed" | "InProgress" | "Resolved" | "Completed" } => i.categoria !== "Removed"),
      hoje,
    );
  }, [itens.data, estados.data, hoje]);

  const previsao = useMemo(() => {
    const s = cap.sprintAtual;
    if (!s || s.status !== "atual") return null;
    const capacidade = cap.pessoas.reduce((n, p) => n + (cap.celula(s.id, p.id)?.capacidadeH ?? 0), 0);
    const rows = (backlog.data ?? []).filter((r) => r.sprint_id === s.id && r.item_id !== null && !TIPOS_FORA_DO_KANBAN.has(r.item_tipo ?? ""));
    const pais = new Set(rows.map((r) => r.item_parent_id));
    const restantes = rows
      .filter((r) => !pais.has(r.item_id))
      .filter((r) => !["Completed", "Removed"].includes(categoriaDe(r.item_tipo, r.item_estado, estados.data)))
      .reduce((n, r) => n + horasPendentes({ horasRestantes: r.horas_restantes, horasEstimadas: r.horas_estimadas, horasConcluidas: r.horas_concluidas }), 0);
    return {
      sprint: s,
      ...previsaoSprint({
        horasRestantes: restantes,
        capacidadeSprintH: capacidade,
        diasUteisTotal: diasUteis(s.inicio, s.fim),
        diasUteisRestantes: hoje > s.fim ? 0 : diasUteis(hoje > s.inicio ? hoje : s.inicio, s.fim),
      }),
    };
  }, [cap, backlog.data, estados.data, hoje]);

  if (!fluxo) return <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />;
  const maxThr = Math.max(1, ...fluxo.throughput.map((s) => s.concluidos));
  const pv = previsao ? PREVISAO[previsao.status] : null;

  return (
    <Card>
      <CardTitulo icone={Activity} titulo="Fluxo e previsibilidade" descricao="A sprint fecha? O time está entregando? Quanto tempo uma tarefa leva do começo ao fim?" />
      <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4 dark:bg-slate-800 [&>*]:bg-white dark:[&>*]:bg-slate-900">
        <Indicador icone={Gauge} rotulo="Throughput" ajuda="throughput" valor={`${String(fluxo.throughputMedio).replace(".", ",")}/semana`} detalhe="tarefas concluídas (média das semanas fechadas)" />
        <Indicador
          icone={Timer}
          rotulo="Cycle time"
          ajuda="cycleTime"
          valor={dias(fluxo.cycleMediana)}
          detalhe={fluxo.cycleP85 !== null ? `mediana · 85% em até ${dias(fluxo.cycleP85)}` : "sem tarefas concluídas com datas ainda"}
        />
        <Indicador icone={Hourglass} rotulo="Lead time" ajuda="leadTime" valor={dias(fluxo.leadMediana)} detalhe={`da criação à entrega · ${fluxo.amostra} concluídas`} />
        <Indicador
          icone={Activity}
          rotulo="Em andamento (WIP)"
          ajuda="wip"
          valor={String(fluxo.wip)}
          detalhe={fluxo.wipIdadeMediana !== null ? `há ${dias(fluxo.wipIdadeMediana)} no estado (mediana)` : "nada em andamento"}
        />
      </div>

      <div className="grid gap-5 border-t border-slate-100 p-5 lg:grid-cols-2 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Entregas por semana</h3>
          <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">Tarefas concluídas em cada semana (a última ainda está em andamento).</p>
          <div className="flex h-32 items-end gap-2">
            {fluxo.throughput.map((s, i) => (
              <div key={s.inicio} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">{s.concluidos}</span>
                <div
                  className={cn("w-full rounded-t-md", i === fluxo.throughput.length - 1 && "opacity-50")}
                  style={{ height: `${Math.max(4, (s.concluidos / maxThr) * 88)}px`, background: "var(--viz-1)" }}
                  title={`${s.concluidos} concluídas na semana de ${s.semana}`}
                />
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{s.semana}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <CalendarCheck className="size-4 text-brand-700 dark:text-brand-300" /> A sprint atual fecha?
          </h3>
          {!previsao || !pv ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Nenhuma sprint em andamento agora.</p>
          ) : (
            <>
              <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
                {previsao.sprint.nome} · {previsao.diasUteisRestantes} {previsao.diasUteisRestantes === 1 ? "dia útil restante" : "dias úteis restantes"}
              </p>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: `color-mix(in oklab, ${pv.cor} 16%, transparent)`, color: pv.cor }}>
                  {pv.rotulo}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-300">{pv.texto}</span>
              </div>
              <Barra rotulo="Falta fazer" valor={previsao.horasRestantes} max={Math.max(previsao.horasRestantes, previsao.capacidadeRestanteH, 1)} cor={pv.cor} />
              <Barra rotulo="Capacidade que resta" valor={previsao.capacidadeRestanteH} max={Math.max(previsao.horasRestantes, previsao.capacidadeRestanteH, 1)} cor="var(--viz-1)" />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function Indicador({ icone: Icone, rotulo, valor, detalhe, ajuda }: { icone: typeof Gauge; rotulo: string; valor: string; detalhe: string; ajuda: TermoGlossario }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Icone className="size-3.5" /> {rotulo} <Ajuda termo={ajuda} />
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{valor}</div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{detalhe}</div>
    </div>
  );
}

function Barra({ rotulo, valor, max, cor }: { rotulo: string; valor: number; max: number; cor: string }) {
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex justify-between text-xs text-slate-600 dark:text-slate-300">
        <span>{rotulo}</span>
        <span className="font-semibold tabular-nums">{formatHoras(valor)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${(valor / max) * 100}%`, background: cor }} />
      </div>
    </div>
  );
}
