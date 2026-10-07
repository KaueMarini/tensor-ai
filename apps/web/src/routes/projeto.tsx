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
import { useBacklog, useProjetos, useSprints } from "@/lib/queries";
import { agruparBacklog, type FeatureGroup, type ItemNode, type SprintGroup, type SprintStatus, type Totais } from "@/lib/backlog";
import { useRealtime } from "@/lib/realtime";
import { cn, formatData, formatHoras } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AZDO_ORG_URL = (import.meta.env.VITE_AZDO_ORG_URL as string | undefined)?.replace(/\/$/, "");

export function ProjetoPage() {
  const { projetoId } = useParams({ from: "/app/projetos/$projetoId" });
  const projetos = useProjetos();
  const sprints = useSprints(projetoId);
  const backlog = useBacklog(projetoId);
  const [busca, setBusca] = useState("");
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());

  const projeto = projetos.data?.find((p) => p.id === projetoId);
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
    <div className="mx-auto max-w-[1500px] px-6 py-6">
      <header className="mb-5">
        <div className="text-xs font-medium text-slate-500">Projeto</div>
        <h1 className="text-2xl font-semibold tracking-tight">{projeto?.nome ?? "…"}</h1>
      </header>

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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
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
    </div>
  );
}

function Kpi({ rotulo, valor, alerta }: { rotulo: string; valor: string | number; alerta?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white px-4 py-3",
        alerta ? "border-amber-200 bg-amber-50/50" : "border-slate-200",
      )}
    >
      <div className={cn("text-xs", alerta ? "text-amber-700" : "text-slate-500")}>{rotulo}</div>
      <div className={cn("mt-0.5 text-xl font-semibold tabular-nums", alerta && "text-amber-800")}>{valor}</div>
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
      <td className="px-3 text-right tabular-nums">{formatHoras(t.estimadas)}</td>
      <td className="px-3 text-right tabular-nums">{formatHoras(t.restantes)}</td>
      <td className="px-3 text-right tabular-nums">{formatHoras(t.concluidas)}</td>
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
        className="cursor-pointer border-b border-slate-200 bg-slate-50 font-medium text-slate-800 hover:bg-slate-100/70"
        onClick={() => alternar(sprint.key)}
      >
        <td className="px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
            <Chevron aberto={aberto} />
            <span className="font-semibold">{sprint.nome}</span>
            {sprint.id && <Badge tone={st.tone}>{st.texto}</Badge>}
            {sprint.inicio && (
              <span className="text-xs font-normal text-slate-500">
                {formatData(sprint.inicio)} – {formatData(sprint.fim)}
              </span>
            )}
            <span className="text-xs font-normal text-slate-400">
              · {sprint.features.length} {sprint.features.length === 1 ? "feature" : "features"} · {sprint.totais.itens}{" "}
              {sprint.totais.itens === 1 ? "item" : "itens"}
            </span>
          </div>
        </td>
        <td />
        <td>
          {sprint.totais.semEstimativa > 0 && (
            <span className="px-3 text-xs font-normal text-amber-700">
              {sprint.totais.semEstimativa} sem estimativa
            </span>
          )}
        </td>
        <HorasCells t={sprint.totais} />
        <td />
      </tr>
      {aberto && sprint.features.length === 0 && (
        <tr className="border-b border-slate-100">
          <td colSpan={7} className="py-3 pl-12 text-xs text-slate-400">
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
          "cursor-pointer border-b border-slate-100 hover:bg-slate-50",
          feature.id !== null && destacados.has(feature.id) && "row-flash",
        )}
        onClick={() => alternar(feature.key)}
      >
        <td className="py-2 pr-4 pl-9">
          <div className="flex min-w-0 items-center gap-2">
            <Chevron aberto={aberto} />
            <Layers className={cn("size-4 shrink-0", feature.id === null ? "text-slate-300" : "text-violet-600")} />
            {feature.id !== null && <IdLink id={feature.id} />}
            <span className={cn("truncate font-medium", feature.id === null && "text-slate-500 italic")} title={feature.titulo}>
              {feature.titulo}
            </span>
            <span className="shrink-0 text-xs text-slate-400">
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
        <tr className="border-b border-slate-100">
          <td colSpan={7} className="py-2 pl-[5.5rem] text-xs text-amber-700">
            Feature sem itens de trabalho
          </td>
        </tr>
      )}
      {aberto && feature.itens.map((n) => <ItemRow key={n.row.item_id} node={n} />)}
    </>
  );
}

const TIPO_ICONE: Record<string, { Icon: typeof SquareCheck; cor: string }> = {
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
        "border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70",
        r.item_id !== null && destacados.has(r.item_id) && "row-flash",
      )}
    >
      <td className="py-2 pr-4" style={{ paddingLeft: `${5.5 + node.depth * 1.5}rem` }}>
        <div className="flex min-w-0 items-center gap-2">
          <tipo.Icon className={cn("size-4 shrink-0", tipo.cor)} aria-label={r.item_tipo ?? undefined} />
          {r.item_id !== null && <IdLink id={r.item_id} />}
          <span className={cn("truncate", node.temFilhos && "font-medium")} title={r.item_titulo ?? undefined}>
            {r.item_titulo}
          </span>
        </div>
      </td>
      <td className="px-3">{r.item_estado && <Estado estado={r.item_estado} />}</td>
      <td className="px-3">
        <Responsavel nome={r.responsavel_nome} />
      </td>
      <td className="px-3 text-right tabular-nums">
        {semEstimativa ? (
          <Badge tone="amber" title="Sem horas no DevOps">
            <AlertTriangle className="size-3" /> sem estimativa
          </Badge>
        ) : (
          <span className={cn(r.horas_origem === "sistema" && "text-slate-400 italic")} title={r.horas_origem === "sistema" ? "Estimativa do sistema" : undefined}>
            {formatHoras(r.horas_estimadas)}
          </span>
        )}
      </td>
      <td className="px-3 text-right tabular-nums">{formatHoras(r.horas_restantes)}</td>
      <td className="px-3 text-right tabular-nums">{formatHoras(r.horas_concluidas)}</td>
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

function IdLink({ id }: { id: number }) {
  const cls = "font-mono text-xs text-slate-400";
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

function Estado({ estado }: { estado: string }) {
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

const AVATAR_CORES = ["bg-teal-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-emerald-600"];

const MINUSCULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

/** "KAUÊ NEBOT MARINI" → "Kauê Nebot Marini" (só mexe em nomes todo em maiúsculas). */
function normalizarNome(nome: string): string {
  if (nome !== nome.toUpperCase()) return nome;
  return nome
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

function Responsavel({ nome: bruto }: { nome: string | null }) {
  if (!bruto) return <span className="text-xs text-slate-400">Não atribuído</span>;
  const nome = normalizarNome(bruto);
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white",
          AVATAR_CORES[h % AVATAR_CORES.length],
        )}
      >
        {iniciais}
      </span>
      <span className="truncate text-sm text-slate-700" title={nome}>
        {nome}
      </span>
    </div>
  );
}

function LinhasCarregando() {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <tr key={i} className="border-b border-slate-100">
          <td colSpan={7} className="px-4 py-3">
            <div className="h-4 animate-pulse rounded bg-slate-100" style={{ width: `${60 - i * 6}%` }} />
          </td>
        </tr>
      ))}
    </>
  );
}
