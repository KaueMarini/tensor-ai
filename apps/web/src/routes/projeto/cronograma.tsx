import { type ReactNode, useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { CalendarRange, Layers } from "lucide-react";
import { categoriaDe, TIPOS_FORA_DO_KANBAN } from "@shared/kanban";
import { useBacklog, useEstados, useSprints } from "@/lib/queries";
import { hojeISO, sprintStatus } from "@/lib/backlog";
import { cn, formatData, formatHoras } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitulo } from "@/components/ui/card";

const DIA = 86_400_000;
const dia = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

interface FeatureBarra {
  id: number;
  titulo: string;
  estado: string | null;
  inicio: string;
  fim: string;
  sprintInicial: string;
  itens: number;
  fechados: number;
  concluidas: number;
  restantes: number;
}

export function CronogramaPage() {
  const { projetoId } = useParams({ strict: false }) as { projetoId: string };
  const sprints = useSprints(projetoId);
  const backlog = useBacklog(projetoId);
  const estados = useEstados(projetoId);

  const dados = useMemo(() => {
    const comData = (sprints.data ?? [])
      .filter((s): s is typeof s & { inicio: string; fim: string } => !!s.inicio && !!s.fim)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    const sprintPorId = new Map(comData.map((s) => [s.id, s]));

    const features = new Map<number, FeatureBarra & { sprints: Set<string> }>();
    for (const r of backlog.data ?? []) {
      if (r.feature_id === null) continue;
      let f = features.get(r.feature_id);
      if (!f) {
        f = {
          id: r.feature_id,
          titulo: r.feature_titulo ?? `Feature #${r.feature_id}`,
          estado: r.feature_estado,
          inicio: "",
          fim: "",
          sprintInicial: "",
          itens: 0,
          fechados: 0,
          concluidas: 0,
          restantes: 0,
          sprints: new Set(),
        };
        features.set(r.feature_id, f);
      }
      if (r.sprint_id && sprintPorId.has(r.sprint_id)) f.sprints.add(r.sprint_id);
      if (r.item_id === null || TIPOS_FORA_DO_KANBAN.has(r.item_tipo ?? "")) continue;
      const cat = categoriaDe(r.item_tipo, r.item_estado, estados.data);
      if (cat === "Removed") continue;
      f.itens++;
      if (cat === "Completed") f.fechados++;
      f.concluidas += r.horas_concluidas ?? 0;
      f.restantes += r.horas_restantes ?? 0;
    }

    const comPeriodo: FeatureBarra[] = [];
    const semPeriodo: FeatureBarra[] = [];
    for (const f of features.values()) {
      const ss = [...f.sprints].map((id) => sprintPorId.get(id)!).sort((a, b) => a.inicio.localeCompare(b.inicio));
      if (ss.length === 0) {
        semPeriodo.push(f);
        continue;
      }
      f.inicio = ss[0]!.inicio;
      f.fim = ss.reduce((m, s) => (s.fim > m ? s.fim : m), ss[0]!.fim);
      f.sprintInicial = ss[0]!.id;
      comPeriodo.push(f);
    }

    if (comData.length === 0) return { comData, comPeriodo, semPeriodo, inicio: 0, total: 1, semanas: [] as number[] };
    let inicio = dia(comData[0]!.inicio);
    inicio -= ((new Date(inicio).getUTCDay() + 6) % 7) * DIA;
    let fim = Math.max(...comData.map((s) => dia(s.fim)));
    fim += (6 - ((new Date(fim).getUTCDay() + 6) % 7)) * DIA;
    const total = (fim - inicio) / DIA + 1;
    const semanas: number[] = [];
    for (let t = inicio; t <= fim; t += 7 * DIA) semanas.push(t);
    return { comData, comPeriodo, semPeriodo, inicio, total, semanas };
  }, [sprints.data, backlog.data, estados.data]);

  const pos = (iso: string) => ((dia(iso) - dados.inicio) / DIA / dados.total) * 100;
  const largura = (de: string, ate: string) => ((dia(ate) - dia(de)) / DIA + 1) / dados.total * 100;
  const hoje = hojeISO();
  const hojeVisivel = dados.comData.length > 0 && dia(hoje) >= dados.inicio && pos(hoje) <= 100;
  const larguraMin = Math.max(720, dados.total * 16);

  if (sprints.isLoading || backlog.isLoading) {
    return <div className="h-96 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />;
  }

  if (dados.comData.length === 0) {
    return (
      <Card className="grid place-items-center px-6 py-16 text-center">
        <CalendarRange className="mb-3 size-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nenhuma sprint com datas</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Defina início e fim das iterações no Azure DevOps para montar o cronograma.
        </p>
      </Card>
    );
  }

  const Hoje = () =>
    hojeVisivel ? (
      <div className="pointer-events-none absolute inset-y-0 w-px bg-red-500/70" style={{ left: `${pos(hoje)}%` }} />
    ) : null;

  return (
    <Card className="overflow-hidden">
      <CardTitulo
        icone={CalendarRange}
        titulo="Cronograma"
        descricao="Barra = período da feature (da primeira à última sprint com itens). Preenchimento = % concluído."
        acao={
          hojeVisivel ? (
            <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="h-3 w-px bg-red-500" /> Hoje
            </span>
          ) : undefined
        }
      />
      <div className="overflow-x-auto">
        <div className="grid" style={{ gridTemplateColumns: `280px minmax(${larguraMin}px, 1fr)` }}>
          <div className="sticky left-0 z-10 border-r border-b border-slate-100 bg-white px-4 py-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Sprint / feature
          </div>
          <div className="relative h-9 border-b border-slate-100 dark:border-slate-800">
            {dados.semanas.map((t) => (
              <span
                key={t}
                className="absolute top-0 flex h-full items-center border-l border-[var(--viz-grid)] pl-1.5 text-[11px] whitespace-nowrap text-slate-500 dark:text-slate-400"
                style={{ left: `${((t - dados.inicio) / DIA / dados.total) * 100}%` }}
              >
                {formatData(new Date(t).toISOString())}
              </span>
            ))}
            <Hoje />
          </div>

          {dados.comData.map((s) => {
            const st = sprintStatus(s.inicio, s.fim);
            const feats = dados.comPeriodo
              .filter((f) => f.sprintInicial === s.id)
              .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.titulo.localeCompare(b.titulo));
            return (
              <Linhas key={s.id}>
                <div className="sticky left-0 z-10 flex items-center gap-2 border-r border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                  <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{s.nome}</span>
                  {st === "atual" && <Badge tone="teal">Atual</Badge>}
                  <span className="ml-auto shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                    {formatData(s.inicio)}–{formatData(s.fim)}
                  </span>
                </div>
                <div className="relative border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
                  <Grade semanas={dados.semanas} inicio={dados.inicio} total={dados.total} />
                  <div
                    className={cn(
                      "absolute top-1/2 h-6 -translate-y-1/2 rounded-md",
                      st === "passada"
                        ? "bg-slate-200 dark:bg-slate-700/70"
                        : st === "atual"
                          ? "bg-brand-300 dark:bg-brand-700"
                          : "bg-brand-100 dark:bg-brand-900/60",
                    )}
                    style={{ left: `${pos(s.inicio)}%`, width: `${largura(s.inicio, s.fim)}%` }}
                    title={`${s.nome}: ${formatData(s.inicio)} a ${formatData(s.fim)}`}
                  />
                  <Hoje />
                </div>

                {feats.length === 0 && (
                  <>
                    <div className="sticky left-0 z-10 border-r border-b border-slate-100 bg-white px-4 py-2 pl-8 text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
                      Nenhuma feature começa nesta sprint
                    </div>
                    <div className="relative border-b border-slate-100 dark:border-slate-800">
                      <Grade semanas={dados.semanas} inicio={dados.inicio} total={dados.total} />
                      <Hoje />
                    </div>
                  </>
                )}

                {feats.map((f) => (
                  <FeatureLinha key={f.id} f={f} pos={pos} largura={largura}>
                    <Grade semanas={dados.semanas} inicio={dados.inicio} total={dados.total} />
                    <Hoje />
                  </FeatureLinha>
                ))}
              </Linhas>
            );
          })}
        </div>
      </div>

      {dados.semPeriodo.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300">Fora do cronograma: </span>
          {dados.semPeriodo.length} {dados.semPeriodo.length === 1 ? "feature sem itens" : "features sem itens"} em sprint com datas (
          {dados.semPeriodo.slice(0, 4).map((f) => f.titulo).join(", ")}
          {dados.semPeriodo.length > 4 ? "…" : ""})
        </div>
      )}
    </Card>
  );
}

const Linhas = ({ children }: { children: ReactNode }) => <>{children}</>;

function Grade({ semanas, inicio, total }: { semanas: number[]; inicio: number; total: number }) {
  return (
    <>
      {semanas.map((t) => (
        <span
          key={t}
          className="pointer-events-none absolute inset-y-0 w-px bg-[var(--viz-grid)] opacity-60"
          style={{ left: `${((t - inicio) / DIA / total) * 100}%` }}
        />
      ))}
    </>
  );
}

function progresso(f: FeatureBarra) {
  const horas = f.concluidas + f.restantes;
  if (horas > 0) return f.concluidas / horas;
  return f.itens > 0 ? f.fechados / f.itens : 0;
}

function FeatureLinha({
  f,
  pos,
  largura,
  children,
}: {
  f: FeatureBarra;
  pos: (iso: string) => number;
  largura: (de: string, ate: string) => number;
  children: ReactNode;
}) {
  const pct = progresso(f);
  const rotulo = `${Math.round(pct * 100)}%`;
  return (
    <>
      <div className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r border-b border-slate-100 bg-white py-2 pr-4 pl-8 dark:border-slate-800 dark:bg-slate-900">
        <Layers className="size-3.5 shrink-0 text-violet-500" />
        <span className="truncate text-sm text-slate-700 dark:text-slate-200" title={f.titulo}>
          {f.titulo}
        </span>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
          {f.itens} {f.itens === 1 ? "item" : "itens"}
        </span>
      </div>
      <div className="group relative h-10 border-b border-slate-100 dark:border-slate-800">
        {children}
        <div
          className="absolute top-1/2 flex h-3.5 -translate-y-1/2 items-center"
          style={{ left: `${pos(f.inicio)}%`, width: `${largura(f.inicio, f.fim)}%` }}
        >
          <div className="relative h-full w-full overflow-hidden rounded-[4px] bg-[color-mix(in_oklab,var(--viz-1)_18%,transparent)]">
            <div className="h-full rounded-[4px] bg-[var(--viz-1)]" style={{ width: `${pct * 100}%` }} />
          </div>
          <span className="absolute left-full ml-2 text-[11px] font-medium whitespace-nowrap text-slate-600 tabular-nums dark:text-slate-300">
            {rotulo}
          </span>
          <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg group-hover:block dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-1 font-semibold text-slate-900 dark:text-slate-100">{f.titulo}</div>
            <div className="text-slate-500 dark:text-slate-400">
              {formatData(f.inicio)} – {formatData(f.fim)}
              {f.estado && ` · ${f.estado}`}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-300">
              <dt>Concluído</dt>
              <dd className="text-right tabular-nums">{rotulo}</dd>
              <dt>Itens fechados</dt>
              <dd className="text-right tabular-nums">
                {f.fechados} / {f.itens}
              </dd>
              <dt>Horas concluídas</dt>
              <dd className="text-right tabular-nums">{formatHoras(f.concluidas)}</dd>
              <dt>Horas restantes</dt>
              <dd className="text-right tabular-nums">{formatHoras(f.restantes)}</dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
