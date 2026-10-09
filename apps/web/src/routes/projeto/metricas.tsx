import { type ReactNode, useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Layers, ListChecks, UserRound } from "lucide-react";
import { type Categoria, CATEGORIAS, categoriaDe, TIPOS_FORA_DO_KANBAN } from "@shared/kanban";
import { useBacklog, useEstados, useSprints } from "@/lib/queries";
import { sprintStatus } from "@/lib/backlog";
import { cn, formatHoras, normalizarNome } from "@/lib/utils";
import { Card, CardTitulo, Stat } from "@/components/ui/card";
import { FluxoProjeto } from "@/components/fluxo-projeto";

const NOME_CAT: Record<Categoria, string> = {
  Proposed: "A fazer",
  InProgress: "Em andamento",
  Resolved: "Resolvido",
  Completed: "Concluído",
};
const COR_CAT: Record<Categoria, string> = {
  Proposed: "var(--viz-1)",
  InProgress: "var(--viz-2)",
  Resolved: "var(--viz-3)",
  Completed: "var(--viz-4)",
};
const COR_CONCLUIDO = "var(--viz-1)";
const COR_RESTANTE = "var(--viz-2)";

export function MetricasPage() {
  const { projetoId } = useParams({ strict: false }) as { projetoId: string };
  const sprints = useSprints(projetoId);
  const backlog = useBacklog(projetoId);
  const estados = useEstados(projetoId);

  const m = useMemo(() => {
    const rows = (backlog.data ?? []).filter((r) => r.item_id !== null && !TIPOS_FORA_DO_KANBAN.has(r.item_tipo ?? ""));
    const pais = new Set(rows.map((r) => r.item_parent_id));
    const folhas = rows
      .filter((r) => !pais.has(r.item_id))
      .map((r) => ({ ...r, cat: categoriaDe(r.item_tipo, r.item_estado, estados.data) }))
      .filter((r) => r.cat !== "Removed");

    const porCat = new Map<Categoria, number>(CATEGORIAS.map((c) => [c, 0]));
    for (const r of folhas) porCat.set(r.cat as Categoria, (porCat.get(r.cat as Categoria) ?? 0) + 1);

    const porSprint = (sprints.data ?? []).map((s) => {
      const doSprint = folhas.filter((r) => r.sprint_id === s.id);
      return {
        id: s.id,
        nome: s.nome,
        atual: sprintStatus(s.inicio, s.fim) === "atual",
        concluidas: soma(doSprint, "horas_concluidas"),
        restantes: soma(doSprint, "horas_restantes"),
        estimadas: soma(doSprint, "horas_estimadas"),
        itens: doSprint.length,
      };
    });

    const features = new Map<number, { titulo: string; itens: number; fechados: number; concluidas: number; restantes: number }>();
    for (const r of folhas) {
      if (r.feature_id === null) continue;
      const f = features.get(r.feature_id) ?? { titulo: r.feature_titulo ?? `#${r.feature_id}`, itens: 0, fechados: 0, concluidas: 0, restantes: 0 };
      f.itens++;
      if (r.cat === "Completed") f.fechados++;
      f.concluidas += r.horas_concluidas ?? 0;
      f.restantes += r.horas_restantes ?? 0;
      features.set(r.feature_id, f);
    }

    const pessoas = new Map<string, { nome: string; restantes: number; abertos: number }>();
    for (const r of folhas) {
      if (r.cat === "Completed") continue;
      const k = r.responsavel_id ?? "—";
      const p = pessoas.get(k) ?? { nome: r.responsavel_nome ? normalizarNome(r.responsavel_nome) : "Sem responsável", restantes: 0, abertos: 0 };
      p.restantes += r.horas_restantes ?? 0;
      p.abertos++;
      pessoas.set(k, p);
    }

    const fechados = porCat.get("Completed") ?? 0;
    return {
      total: folhas.length,
      fechados,
      restantes: soma(folhas, "horas_restantes"),
      concluidas: soma(folhas, "horas_concluidas"),
      semEstimativa: folhas.filter((r) => r.sem_estimativa && r.cat !== "Completed").length,
      porCat,
      porSprint: porSprint.filter((s) => s.itens > 0),
      features: [...features.values()].sort((a, b) => b.restantes - a.restantes || a.titulo.localeCompare(b.titulo)),
      pessoas: [...pessoas.values()].sort((a, b) => b.restantes - a.restantes),
    };
  }, [backlog.data, sprints.data, estados.data]);

  if (backlog.isLoading || sprints.isLoading) {
    return <div className="h-96 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />;
  }

  const temResolvido = (m.porCat.get("Resolved") ?? 0) > 0;
  const cats = CATEGORIAS.filter((c) => c !== "Resolved" || temResolvido);

  return (
    <div className="space-y-5">
      <FluxoProjeto projetoId={projetoId} />

      <h2 className="pt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Andamento do trabalho</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icone={ListChecks} rotulo="Itens de trabalho" valor={m.total} detalhe={`${m.total - m.fechados} abertos`} />
        <Stat
          icone={CheckCircle2}
          rotulo="Concluídos"
          valor={m.total ? `${Math.round((m.fechados / m.total) * 100)}%` : "—"}
          detalhe={`${m.fechados} itens`}
        />
        <Stat icone={Clock} rotulo="Horas restantes" valor={formatHoras(m.restantes)} detalhe={`${formatHoras(m.concluidas)} concluídas`} />
        <Stat icone={AlertTriangle} rotulo="Abertos sem estimativa" valor={m.semEstimativa} alerta={m.semEstimativa > 0} />
      </div>

      <Card>
        <CardTitulo icone={ListChecks} titulo="Itens por estado" descricao="Tasks e bugs (histórias com filhos não contam de novo)." />
        <div className="px-5 py-5">
          {m.total === 0 ? (
            <Vazio>Nenhum item neste projeto.</Vazio>
          ) : (
            <>
              <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[4px]">
                {cats.map((c) => {
                  const n = m.porCat.get(c) ?? 0;
                  if (n === 0) return null;
                  return (
                    <div
                      key={c}
                      className="h-full transition-opacity hover:opacity-80"
                      style={{ width: `${(n / m.total) * 100}%`, background: COR_CAT[c] }}
                      title={`${NOME_CAT[c]}: ${n} (${Math.round((n / m.total) * 100)}%)`}
                    />
                  );
                })}
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {cats.map((c) => {
                  const n = m.porCat.get(c) ?? 0;
                  return (
                    <li key={c} className="flex items-start gap-2">
                      <span className="mt-1 size-2.5 shrink-0 rounded-sm" style={{ background: COR_CAT[c] }} />
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{NOME_CAT[c]}</div>
                        <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {n} <span className="text-xs font-normal text-slate-400">{Math.round((n / m.total) * 100)}%</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardTitulo
            icone={BarChart3}
            titulo="Horas por sprint"
            descricao="Concluídas e restantes das tasks de cada sprint."
            acao={<Legenda itens={[["Concluídas", COR_CONCLUIDO], ["Restantes", COR_RESTANTE]]} />}
          />
          <div className="px-5 py-5">
            {m.porSprint.length === 0 ? <Vazio>Nenhuma task em sprint.</Vazio> : <ColunasSprint dados={m.porSprint} />}
          </div>
        </Card>

        <Card>
          <CardTitulo icone={UserRound} titulo="Horas restantes por responsável" descricao="Só itens abertos." />
          <div className="space-y-3 px-5 py-5">
            {m.pessoas.length === 0 && <Vazio>Nada em aberto.</Vazio>}
            {m.pessoas.map((p) => (
              <BarraLinha
                key={p.nome}
                rotulo={p.nome}
                valor={p.restantes}
                max={m.pessoas[0]!.restantes || 1}
                detalhe={`${p.abertos} ${p.abertos === 1 ? "item" : "itens"}`}
                apagado={p.nome === "Sem responsável"}
              />
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitulo icone={Layers} titulo="Progresso por feature" descricao="% de horas concluídas (sem horas: itens fechados ÷ itens)." />
        {m.features.length === 0 ? (
          <div className="px-5 py-5">
            <Vazio>Nenhuma feature com itens.</Vazio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-2.5">Feature</th>
                  <th className="w-[35%] px-3 py-2.5">Progresso</th>
                  <th className="w-24 px-3 py-2.5 text-right">Itens</th>
                  <th className="w-28 px-5 py-2.5 text-right">Restante</th>
                </tr>
              </thead>
              <tbody>
                {m.features.map((f) => {
                  const h = f.concluidas + f.restantes;
                  const p = h > 0 ? f.concluidas / h : f.itens ? f.fechados / f.itens : 0;
                  return (
                    <tr key={f.titulo} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                      <td className="max-w-0 truncate px-5 py-2.5 text-slate-800 dark:text-slate-200" title={f.titulo}>
                        {f.titulo}
                      </td>
                      <td className="px-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--viz-1)_16%,transparent)]">
                            <div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${p * 100}%` }} />
                          </div>
                          <span className="w-9 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">{Math.round(p * 100)}%</span>
                        </div>
                      </td>
                      <td className="px-3 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        {f.fechados}/{f.itens}
                      </td>
                      <td className="px-5 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatHoras(f.restantes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function soma<T extends Record<string, unknown>>(rows: T[], campo: keyof T): number {
  return rows.reduce((s, r) => s + (Number(r[campo]) || 0), 0);
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">{children}</p>;
}

function Legenda({ itens }: { itens: [string, string][] }) {
  return (
    <div className="flex shrink-0 gap-3">
      {itens.map(([nome, cor]) => (
        <span key={nome} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <span className="size-2.5 rounded-sm" style={{ background: cor }} /> {nome}
        </span>
      ))}
    </div>
  );
}

function BarraLinha({ rotulo, valor, max, detalhe, apagado }: { rotulo: string; valor: number; max: number; detalhe: string; apagado?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className={cn("truncate font-medium", apagado ? "text-amber-700 dark:text-amber-400" : "text-slate-700 dark:text-slate-200")}>
          {rotulo}
        </span>
        <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-100">{formatHoras(valor)}</span> · {detalhe}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-[var(--viz-2)]" style={{ width: `${(valor / max) * 100}%` }} />
      </div>
    </div>
  );
}

function ColunasSprint({
  dados,
}: {
  dados: { id: string; nome: string; atual: boolean; concluidas: number; restantes: number; estimadas: number; itens: number }[];
}) {
  const maxBruto = Math.max(...dados.map((d) => d.concluidas + d.restantes), 1);
  const passo = passoLimpo(maxBruto / 4);
  const max = Math.ceil(maxBruto / passo) * passo;
  const ticks = Array.from({ length: Math.round(max / passo) + 1 }, (_, i) => i * passo);
  const ALTURA = 200;

  return (
    <div className="flex gap-3">
      <div className="relative w-10 shrink-0" style={{ height: ALTURA }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 translate-y-1/2 text-[11px] tabular-nums text-slate-400" style={{ bottom: `${(t / max) * 100}%` }}>
            {t}h
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height: ALTURA }}>
          {ticks.map((t) => (
            <div
              key={t}
              className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-[var(--viz-eixo)]" : "bg-[var(--viz-grid)]")}
              style={{ bottom: `${(t / max) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-around">
            {dados.map((d) => (
              <div key={d.id} className="group relative flex h-full flex-1 items-end justify-center">
                <div className="flex w-6 flex-col-reverse gap-[2px]">
                  {d.concluidas > 0 && (
                    <div
                      className={cn("w-full", d.restantes > 0 ? "" : "rounded-t-[4px]")}
                      style={{ height: (d.concluidas / max) * ALTURA, background: COR_CONCLUIDO }}
                    />
                  )}
                  {d.restantes > 0 && (
                    <div className="w-full rounded-t-[4px]" style={{ height: Math.max(2, (d.restantes / max) * ALTURA - 2), background: COR_RESTANTE }} />
                  )}
                </div>
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden w-44 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg group-hover:block dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-1 font-semibold text-slate-900 dark:text-slate-100">{d.nome}</div>
                  <Linha cor={COR_CONCLUIDO} rotulo="Concluídas" valor={d.concluidas} />
                  <Linha cor={COR_RESTANTE} rotulo="Restantes" valor={d.restantes} />
                  <div className="mt-1 border-t border-slate-100 pt-1 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Estimadas {formatHoras(d.estimadas)} · {d.itens} itens
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-around">
          {dados.map((d) => (
            <span key={d.id} className={cn("flex-1 truncate px-1 text-center text-[11px] text-slate-500 dark:text-slate-400", d.atual && "font-semibold text-slate-800 dark:text-slate-100")}>
              {d.nome}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Linha({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: number }) {
  return (
    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
      <span className="size-2 rounded-sm" style={{ background: cor }} />
      {rotulo}
      <span className="ml-auto tabular-nums font-medium text-slate-900 dark:text-slate-100">{formatHoras(valor)}</span>
    </div>
  );
}

function passoLimpo(bruto: number) {
  const exp = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)));
  const n = bruto / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}
