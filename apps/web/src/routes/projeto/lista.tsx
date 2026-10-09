import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  BookOpen,
  Bug,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDot,
  Layers,
  Search,
  SquareCheck,
} from "lucide-react";
import { useBacklog, useSprints } from "@/lib/queries";
import { agruparBacklog, type FeatureGroup, type ItemNode, type SprintGroup, type SprintStatus, type Totais } from "@/lib/backlog";
import { useRealtime } from "@/lib/realtime";
import { cn, corAvatar, formatData, formatHoras, iniciais, normalizarNome } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AZDO_ORG_URL = (import.meta.env.VITE_AZDO_ORG_URL as string | undefined)?.replace(/\/$/, "");

export function BacklogLista() {
  const { projetoId } = useParams({ strict: false }) as { projetoId: string };
  const sprints = useSprints(projetoId);
  const backlog = useBacklog(projetoId);
  const [busca, setBusca] = useState("");
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());

  const grupos = useMemo(
    () => agruparBacklog(sprints.data ?? [], backlog.data ?? [], { busca }),
    [sprints.data, backlog.data, busca],
  );

  const resumo = useMemo(() => {
    const t: Totais = { itens: 0, estimadas: 0, restantes: 0, concluidas: 0, semEstimativa: 0 };
    let features = 0;
    for (const s of grupos) {
      features += s.features.filter((f) => f.id !== null).length;
      t.itens += s.totais.itens;
      t.restantes += s.totais.restantes;
      t.semEstimativa += s.totais.semEstimativa;
    }
    return { sprints: grupos.filter((g) => g.id).length, features, ...t };
  }, [grupos]);

  const todasChaves = useMemo(() => grupos.flatMap((s) => [s.key, ...s.features.map((f) => f.key)]), [grupos]);
  const alternar = (k: string) =>
    setRecolhidos((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const carregando = sprints.isLoading || backlog.isLoading;
  const erro = sprints.error ?? backlog.error;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi rotulo="Sprints" valor={resumo.sprints} />
        <Kpi rotulo="Features" valor={resumo.features} />
        <Kpi rotulo="Itens de trabalho" valor={resumo.itens} />
        <Kpi rotulo="Horas restantes" valor={formatHoras(resumo.restantes)} />
        <Kpi
          rotulo="Sem estimativa"
          valor={resumo.semEstimativa}
          alerta={resumo.semEstimativa > 0}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, responsável, tag ou #id"
            className="pl-8"
          />
        </div>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setRecolhidos(new Set())}>
            <ChevronsUpDown className="size-3.5" /> Expandir tudo
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRecolhidos(new Set(todasChaves))}>
            <ChevronsDownUp className="size-3.5" /> Recolher tudo
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <th className="px-4 py-2.5">Item</th>
                <th className="w-24 px-3 py-2.5">Estado</th>
                <th className="w-44 px-3 py-2.5">Responsável</th>
                <th className="w-[6.5rem] px-3 py-2.5 text-right">Estimado</th>
                <th className="w-20 px-3 py-2.5 text-right">Restante</th>
                <th className="w-24 px-3 py-2.5 text-right">Concluído</th>
                <th className="w-48 px-3 py-2.5">Tags</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <LinhasCarregando />}
              {erro && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-red-600">
                    Erro ao carregar: {erro.message}
                  </td>
                </tr>
              )}
              {!carregando && !erro && grupos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    {busca ? "Nada encontrado para essa busca." : "Nenhuma sprint ou item sincronizado neste projeto."}
                  </td>
                </tr>
              )}
              {grupos.map((s) => (
                <SprintRows key={s.key} sprint={s} recolhidos={recolhidos} alternar={alternar} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Kpi({ rotulo, valor, alerta }: { rotulo: string; valor: string | number; alerta?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white px-4 py-3 dark:bg-slate-900",
        alerta ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30" : "border-slate-200 dark:border-slate-800",
      )}
    >
      <div className={cn("text-xs", alerta ? "text-amber-700 dark:text-amber-500" : "text-slate-500 dark:text-slate-400")}>{rotulo}</div>
      <div className={cn("mt-0.5 text-xl font-semibold tabular-nums dark:text-slate-100", alerta && "text-amber-800 dark:text-amber-400")}>{valor}</div>
    </div>
  );
}

const STATUS_SPRINT: Record<SprintStatus, { texto: string; tone: "teal" | "blue" | "slate" }> = {
  atual: { texto: "Atual", tone: "teal" },
  futura: { texto: "Futura", tone: "blue" },
  passada: { texto: "Encerrada", tone: "slate" },
  "sem-data": { texto: "Sem datas", tone: "slate" },
};

function Chevron({ aberto }: { aberto: boolean }) {
  return <ChevronRight className={cn("size-4 shrink-0 text-slate-400 transition-transform", aberto && "rotate-90")} />;
}

function HorasCells({ t }: { t: Totais }) {
  return (
    <>
      <td className="px-3 text-right tabular-nums dark:text-slate-300">{formatHoras(t.estimadas)}</td>
      <td className="px-3 text-right tabular-nums dark:text-slate-300">{formatHoras(t.restantes)}</td>
      <td className="px-3 text-right tabular-nums dark:text-slate-300">{formatHoras(t.concluidas)}</td>
    </>
  );
}

function SprintRows({
  sprint,
  recolhidos,
  alternar,
}: {
  sprint: SprintGroup;
  recolhidos: ReadonlySet<string>;
  alternar: (k: string) => void;
}) {
  const aberto = !recolhidos.has(sprint.key);
  const st = STATUS_SPRINT[sprint.status];
  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-200 bg-slate-50 font-medium text-slate-800 hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
        onClick={() => alternar(sprint.key)}
      >
        <td className="px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
            <Chevron aberto={aberto} />
            <span className="font-semibold">{sprint.nome}</span>
            {sprint.id && <Badge tone={st.tone}>{st.texto}</Badge>}
            {sprint.inicio && (
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                {formatData(sprint.inicio)} – {formatData(sprint.fim)}
              </span>
            )}
            <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
              · {sprint.features.length} {sprint.features.length === 1 ? "feature" : "features"} · {sprint.totais.itens}{" "}
              {sprint.totais.itens === 1 ? "item" : "itens"}
            </span>
          </div>
        </td>
        <td />
        <td>
          {sprint.totais.semEstimativa > 0 && (
            <span className="px-3 text-xs font-normal text-amber-700 dark:text-amber-500">
              {sprint.totais.semEstimativa} sem estimativa
            </span>
          )}
        </td>
        <HorasCells t={sprint.totais} />
        <td />
      </tr>
      {aberto && sprint.features.length === 0 && (
        <tr className="border-b border-slate-100 dark:border-slate-800">
          <td colSpan={7} className="py-3 pl-12 text-xs text-slate-400 dark:text-slate-500">
            Nenhuma feature nesta sprint.
          </td>
        </tr>
      )}
      {aberto &&
        sprint.features.map((f) => (
          <FeatureRows key={f.key} feature={f} aberto={!recolhidos.has(f.key)} alternar={alternar} />
        ))}
    </>
  );
}

function FeatureRows({
  feature,
  aberto,
  alternar,
}: {
  feature: FeatureGroup;
  aberto: boolean;
  alternar: (k: string) => void;
}) {
  const { destacados } = useRealtime();
  return (
    <>
      <tr
        className={cn(
          "cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40",
          feature.id !== null && destacados.has(feature.id) && "row-flash",
        )}
        onClick={() => alternar(feature.key)}
      >
        <td className="py-2 pr-4 pl-9">
          <div className="flex min-w-0 items-center gap-2">
            <Chevron aberto={aberto} />
            <Layers className={cn("size-4 shrink-0", feature.id === null ? "text-slate-300 dark:text-slate-600" : "text-violet-600 dark:text-violet-400")} />
            {feature.id !== null && <IdLink id={feature.id} />}
            <span className={cn("truncate font-medium dark:text-slate-200", feature.id === null && "text-slate-500 italic dark:text-slate-400")} title={feature.titulo}>
              {feature.titulo}
            </span>
            <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
              {feature.itens.length} {feature.itens.length === 1 ? "item" : "itens"}
            </span>
          </div>
        </td>
        <td className="px-3">{feature.estado && <Estado estado={feature.estado} />}</td>
        <td />
        <HorasCells t={feature.totais} />
        <td />
      </tr>
      {aberto && feature.itens.length === 0 && (
        <tr className="border-b border-slate-100 dark:border-slate-800">
          <td colSpan={7} className="py-2 pl-[5.5rem] text-xs text-amber-700 dark:text-amber-500">
            Feature sem itens de trabalho
          </td>
        </tr>
      )}
      {aberto && feature.itens.map((n) => <ItemRow key={n.row.item_id} node={n} />)}
    </>
  );
}

export const TIPO_ICONE: Record<string, { Icon: typeof SquareCheck; cor: string }> = {
  Task: { Icon: SquareCheck, cor: "text-amber-500" },
  "User Story": { Icon: BookOpen, cor: "text-sky-600" },
  "Product Backlog Item": { Icon: BookOpen, cor: "text-sky-600" },
  Bug: { Icon: Bug, cor: "text-red-500" },
};

function ItemRow({ node }: { node: ItemNode }) {
  const { destacados } = useRealtime();
  const r = node.row;
  const tipo = TIPO_ICONE[r.item_tipo ?? ""] ?? { Icon: CircleDot, cor: "text-slate-400" };
  const semEstimativa = r.sem_estimativa && !node.temFilhos;

  return (
    <tr
      className={cn(
        "border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/30",
        r.item_id !== null && destacados.has(r.item_id) && "row-flash",
      )}
    >
      <td className="py-2 pr-4" style={{ paddingLeft: `${5.5 + node.depth * 1.5}rem` }}>
        <div className="flex min-w-0 items-center gap-2">
          <tipo.Icon className={cn("size-4 shrink-0", tipo.cor)} aria-label={r.item_tipo ?? undefined} />
          {r.item_id !== null && <IdLink id={r.item_id} />}
          <span className={cn("truncate dark:text-slate-200", node.temFilhos && "font-medium")} title={r.item_titulo ?? undefined}>
            {r.item_titulo}
          </span>
        </div>
      </td>
      <td className="px-3">{r.item_estado && <Estado estado={r.item_estado} />}</td>
      <td className="px-3">
        <Responsavel nome={r.responsavel_nome} />
      </td>
      <td className="px-3 text-right tabular-nums dark:text-slate-300">
        {semEstimativa ? (
          <Badge tone="amber" title="Sem horas no DevOps">
            <AlertTriangle className="size-3" /> sem estimativa
          </Badge>
        ) : (
          <span className={cn(r.horas_origem === "sistema" && "text-slate-400 italic dark:text-slate-500")} title={r.horas_origem === "sistema" ? "Estimativa do sistema" : undefined}>
            {formatHoras(r.horas_estimadas)}
          </span>
        )}
      </td>
      <td className="px-3 text-right tabular-nums dark:text-slate-300">{formatHoras(r.horas_restantes)}</td>
      <td className="px-3 text-right tabular-nums dark:text-slate-300">{formatHoras(r.horas_concluidas)}</td>
      <td className="px-3 py-1.5">
        <div className="flex flex-wrap gap-1">
          {(r.tags ?? []).map((t) => (
            <Badge key={t} tone="slate" className="font-normal">
              {t}
            </Badge>
          ))}
        </div>
      </td>
    </tr>
  );
}

export function IdLink({ id }: { id: number }) {
  const cls = "font-mono text-xs text-slate-400 dark:text-slate-500";
  if (!AZDO_ORG_URL) return <span className={cls}>#{id}</span>;
  return (
    <a
      href={`${AZDO_ORG_URL}/_workitems/edit/${id}`}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(cls, "hover:text-brand-700 hover:underline")}
      title="Abrir no Azure DevOps"
    >
      #{id}
    </a>
  );
}

export function Estado({ estado }: { estado: string }) {
  const e = estado.toLowerCase();
  const tone =
    e === "new" || e === "to do" || e === "proposed"
      ? "slate"
      : e === "active" || e === "in progress" || e === "committed"
        ? "blue"
        : e === "resolved" || e === "closed" || e === "done"
          ? "green"
          : e === "removed"
            ? "red"
            : "slate";
  return <Badge tone={tone}>{estado}</Badge>;
}

function Responsavel({ nome: bruto }: { nome: string | null }) {
  if (!bruto) return <span className="text-xs text-slate-400 dark:text-slate-500">Não atribuído</span>;
  const nome = normalizarNome(bruto);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white",
          corAvatar(nome),
        )}
      >
        {iniciais(nome)}
      </span>
      <span className="truncate text-sm text-slate-700 dark:text-slate-300" title={nome}>
        {nome}
      </span>
    </div>
  );
}

function LinhasCarregando() {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
          <td colSpan={7} className="px-4 py-3">
            <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" style={{ width: `${60 - i * 6}%` }} />
          </td>
        </tr>
      ))}
    </>
  );
}
