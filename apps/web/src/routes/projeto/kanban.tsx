// Kanban do projeto: colunas por categoria de estado do processo (A fazer, Em andamento,
// Resolvido, Concluído). Arrastar um card muda o estado no Azure DevOps (Edge Function
// devops-acoes), com atualização otimista e registro em `acao`. Features não entram.

import { type DragEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, Clock, KanbanSquare, Layers, List, Loader2, Search, ShieldCheck, UserRound } from "lucide-react";
import { type Categoria, CATEGORIAS, categoriaDe, estadoDestino, TIPOS_FORA_DO_KANBAN } from "@shared/kanban";
import { useBacklog, useEstados, useMoverCard, useSprints } from "@/lib/queries";
import type { BacklogRow } from "@/lib/backlog";
import { sprintStatus } from "@/lib/backlog";
import { useRealtime } from "@/lib/realtime";
import { cn, formatData, formatHoras, normalizarNome } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BacklogLista, IdLink, TIPO_ICONE } from "./lista";

const COLUNAS: Record<Categoria, { titulo: string; barra: string }> = {
  Proposed: { titulo: "A fazer", barra: "bg-slate-400 dark:bg-slate-500" },
  InProgress: { titulo: "Em andamento", barra: "bg-blue-500" },
  Resolved: { titulo: "Resolvido", barra: "bg-violet-500" },
  Completed: { titulo: "Concluído", barra: "bg-emerald-500" },
};

const TODAS = "todas";
const SEM_SPRINT = "sem-sprint";

export function KanbanPage() {
  const { projetoId } = useParams({ strict: false }) as { projetoId: string };
  const { modo, sprint, resp } = useSearch({ from: "/app/projetos/$projetoId/kanban" });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <AlternarModo projetoId={projetoId} lista={modo === "lista"} sprint={sprint} />
        {modo !== "lista" && (
          <p className="hidden items-center gap-1.5 text-xs text-slate-500 md:flex dark:text-slate-400">
            <ShieldCheck className="size-3.5" /> Arrastar um card muda o estado no Azure DevOps e fica registrado.
          </p>
        )}
      </div>
      {modo === "lista" ? <BacklogLista /> : <Quadro key={resp ?? ""} projetoId={projetoId} sprintParam={sprint} respParam={resp} />}
    </div>
  );
}

function AlternarModo({ projetoId, lista, sprint }: { projetoId: string; lista: boolean; sprint?: string }) {
  const base = "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
  const ativo = "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white";
  const inativo = "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200";
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800/60">
      <Link
        to="/projetos/$projetoId/kanban"
        params={{ projetoId }}
        search={sprint ? { sprint } : {}}
        className={cn(base, lista ? inativo : ativo)}
      >
        <KanbanSquare className="size-4" /> Quadro
      </Link>
      <Link
        to="/projetos/$projetoId/kanban"
        params={{ projetoId }}
        search={{ modo: "lista" }}
        className={cn(base, lista ? ativo : inativo)}
      >
        <List className="size-4" /> Lista
      </Link>
    </div>
  );
}

function Quadro({ projetoId, sprintParam, respParam }: { projetoId: string; sprintParam?: string; respParam?: string }) {
  const navigate = useNavigate({ from: "/projetos/$projetoId/kanban" });
  const sprints = useSprints(projetoId);
  const backlog = useBacklog(projetoId);
  const estados = useEstados(projetoId);
  const mover = useMoverCard();
  const { destacados } = useRealtime();

  const [busca, setBusca] = useState("");
  // vindo de "Ver tasks" (Início/Equipe): já filtra a pessoa, em todas as sprints
  const [responsavel, setResponsavel] = useState(respParam ?? "");
  const [tiposOcultos, setTiposOcultos] = useState<ReadonlySet<string>>(new Set());
  const [overrides, setOverrides] = useState<ReadonlyMap<number, Categoria>>(new Map());
  const [pendentes, setPendentes] = useState<ReadonlySet<number>>(new Set());
  const [arrastando, setArrastando] = useState<BacklogRow | null>(null);
  const [alvo, setAlvo] = useState<Categoria | null>(null);

  const sprintAtual = useMemo(() => {
    const lista = sprints.data ?? [];
    return (
      lista.find((s) => sprintStatus(s.inicio, s.fim) === "atual") ??
      lista.find((s) => sprintStatus(s.inicio, s.fim) === "futura")
    );
  }, [sprints.data]);
  const sprintSel = sprintParam ?? (respParam ? TODAS : sprintAtual?.id ?? TODAS);

  const todos = useMemo(
    () => (backlog.data ?? []).filter((r) => r.item_id !== null && !TIPOS_FORA_DO_KANBAN.has(r.item_tipo ?? "")),
    [backlog.data],
  );
  const tipos = useMemo(() => [...new Set(todos.map((r) => r.item_tipo ?? "Item"))].sort(), [todos]);
  const responsaveis = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of todos) if (r.responsavel_id) m.set(r.responsavel_id, normalizarNome(r.responsavel_nome ?? ""));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [todos]);

  const categoria = (r: BacklogRow) => overrides.get(r.item_id!) ?? categoriaDe(r.item_tipo, r.item_estado, estados.data);

  // quando o dado real (Realtime/refetch) já reflete a mudança, a sobreposição otimista sai
  useEffect(() => {
    if (overrides.size === 0) return;
    const resolvidos = [...overrides].filter(([id, cat]) => {
      const r = todos.find((x) => x.item_id === id);
      return !r || categoriaDe(r.item_tipo, r.item_estado, estados.data) === cat;
    });
    if (resolvidos.length === 0) return;
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const [id] of resolvidos) next.delete(id);
      return next;
    });
  }, [todos, estados.data, overrides]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todos.filter((r) => {
      if (sprintSel === SEM_SPRINT ? r.sprint_id !== null : sprintSel !== TODAS && r.sprint_id !== sprintSel) return false;
      if (responsavel && (responsavel === "ninguem" ? r.responsavel_id !== null : r.responsavel_id !== responsavel))
        return false;
      if (tiposOcultos.has(r.item_tipo ?? "Item")) return false;
      if (!q) return true;
      return [r.item_titulo, r.feature_titulo, r.responsavel_nome, `#${r.item_id}`, ...(r.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [todos, sprintSel, responsavel, tiposOcultos, busca]);

  const porColuna = useMemo(() => {
    const m = new Map<Categoria, BacklogRow[]>(CATEGORIAS.map((c) => [c, []]));
    for (const r of visiveis) {
      const c = categoria(r);
      if (c !== "Removed") m.get(c)!.push(r);
    }
    for (const lista of m.values()) lista.sort((a, b) => (a.item_id ?? 0) - (b.item_id ?? 0));
    return m;
  }, [visiveis, overrides, estados.data]);

  // "Resolvido" só aparece se algum tipo do processo usa essa categoria
  const temResolvido =
    Object.values(estados.data ?? {}).some((l) => l.some((e) => e.categoria === "Resolved")) ||
    (porColuna.get("Resolved")?.length ?? 0) > 0;
  const colunas = CATEGORIAS.filter((c) => c !== "Resolved" || temResolvido);

  const aceita = (r: BacklogRow, c: Categoria) => {
    const lista = estados.data?.[r.item_tipo ?? ""];
    return !lista || estadoDestino(lista, c) !== null;
  };

  function soltar(c: Categoria, idArrastado: string) {
    const r = todos.find((x) => String(x.item_id) === idArrastado) ?? arrastando;
    setArrastando(null);
    setAlvo(null);
    if (!r || r.item_id === null || categoria(r) === c || !aceita(r, c)) return;
    const id = r.item_id;
    setOverrides((prev) => new Map(prev).set(id, c));
    setPendentes((prev) => new Set(prev).add(id));
    mover.mutate(
      { devopsId: id, categoria: c },
      {
        onSuccess: (res) => toast.success(`#${id} movido para "${res.para}" no Azure DevOps`),
        onError: (e) => {
          setOverrides((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          toast.error(`Não foi possível mover #${id}: ${e.message}`);
        },
        onSettled: () =>
          setPendentes((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          }),
      },
    );
  }

  const carregando = sprints.isLoading || backlog.isLoading;
  const erro = sprints.error ?? backlog.error;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={sprintSel}
          onChange={(e) => void navigate({ search: { sprint: e.target.value }, replace: true })}
          className="h-9 cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value={TODAS}>Todas as sprints</option>
          {(sprints.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
              {s.id === sprintAtual?.id ? " (atual)" : ""}
              {s.inicio ? ` · ${formatData(s.inicio)}–${formatData(s.fim)}` : ""}
            </option>
          ))}
          <option value={SEM_SPRINT}>Sem sprint</option>
        </select>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar título, tag ou #id" className="pl-8" />
        </div>
        <select
          value={responsavel}
          onChange={(e) => setResponsavel(e.target.value)}
          className="h-9 cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-600 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <option value="">Todos os responsáveis</option>
          <option value="ninguem">Sem responsável</option>
          {responsaveis.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {tipos.map((t) => {
            const oculto = tiposOcultos.has(t);
            const Icone = (TIPO_ICONE[t] ?? TIPO_ICONE.Task)!.Icon;
            return (
              <button
                key={t}
                onClick={() =>
                  setTiposOcultos((prev) => {
                    const next = new Set(prev);
                    if (next.has(t)) next.delete(t);
                    else next.add(t);
                    return next;
                  })
                }
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  oculto
                    ? "border-dashed border-slate-300 text-slate-400 dark:border-slate-700 dark:text-slate-500"
                    : "border-slate-200 bg-white text-slate-700 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
                )}
                title={oculto ? `Mostrar ${t}` : `Ocultar ${t}`}
              >
                <Icone className={cn("size-3.5", !oculto && TIPO_ICONE[t]?.cor)} /> {t}
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{visiveis.length} itens</span>
      </div>

      {erro && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          Erro ao carregar: {erro.message}
        </p>
      )}
      {estados.error && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="size-4 shrink-0" />
          Não deu para ler os estados do processo no DevOps; as colunas usam os nomes de estado mais comuns.
        </p>
      )}

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(260px, 1fr))` }}
      >
        {colunas.map((c) => {
          const cards = porColuna.get(c) ?? [];
          const horas = cards.reduce((s, r) => s + (r.horas_restantes ?? 0), 0);
          const permitido = !arrastando || aceita(arrastando, c);
          const mesma = arrastando && categoria(arrastando) === c;
          return (
            <section
              key={c}
              onDragOver={(e: DragEvent) => {
                if (!permitido || mesma) return;
                e.preventDefault();
                setAlvo(c);
              }}
              onDragLeave={() => setAlvo((a) => (a === c ? null : a))}
              onDrop={(e) => {
                e.preventDefault();
                soltar(c, e.dataTransfer.getData("text/plain"));
              }}
              className={cn(
                "flex min-h-[420px] flex-col rounded-xl border bg-slate-100/60 transition-colors dark:bg-slate-900/50",
                alvo === c
                  ? "border-brand-500 bg-brand-50/70 dark:border-brand-400 dark:bg-brand-900/20"
                  : "border-slate-200 dark:border-slate-800",
                arrastando && !permitido && "opacity-40",
              )}
            >
              <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className={cn("h-4 w-1 rounded-full", COLUNAS[c].barra)} />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{COLUNAS[c].titulo}</h3>
                <span className="rounded-full bg-white px-1.5 text-xs font-medium tabular-nums text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                  {cards.length}
                </span>
                {horas > 0 && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400" title="Horas restantes">
                    <Clock className="size-3" /> {formatHoras(horas)}
                  </span>
                )}
              </header>
              <div className="flex-1 space-y-2 px-2 pb-2">
                {carregando &&
                  Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-lg bg-white/70 dark:bg-slate-800/60" />
                  ))}
                {!carregando && cards.length === 0 && (
                  <div className="grid h-24 place-items-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
                    {arrastando && permitido && !mesma ? "Solte aqui" : "Nenhum item"}
                  </div>
                )}
                {cards.map((r) => (
                  <Cartao
                    key={r.item_id}
                    r={r}
                    pendente={pendentes.has(r.item_id!)}
                    destacado={destacados.has(r.item_id!)}
                    onDragStart={() => setArrastando(r)}
                    onDragEnd={() => {
                      setArrastando(null);
                      setAlvo(null);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Cartao({
  r,
  pendente,
  destacado,
  onDragStart,
  onDragEnd,
}: {
  r: BacklogRow;
  pendente: boolean;
  destacado: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const tipo = TIPO_ICONE[r.item_tipo ?? ""] ?? TIPO_ICONE.Task!;
  const nome = r.responsavel_nome ? normalizarNome(r.responsavel_nome) : null;
  const horas = r.horas_restantes ?? r.horas_estimadas;
  return (
    <article
      draggable={!pendente}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(r.item_id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-xs transition-shadow hover:shadow-md active:cursor-grabbing dark:border-slate-700/80 dark:bg-slate-800",
        pendente && "cursor-wait opacity-60",
        destacado && "ring-2 ring-amber-400",
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <tipo.Icon className={cn("size-3.5 shrink-0", tipo.cor)} aria-label={r.item_tipo ?? undefined} />
        <IdLink id={r.item_id!} />
        {r.item_estado && <span className="truncate text-[11px] text-slate-400 dark:text-slate-500">· {r.item_estado}</span>}
        {pendente && <Loader2 className="ml-auto size-3.5 animate-spin text-brand-600" />}
      </div>
      <p className="line-clamp-2 text-sm leading-snug font-medium text-slate-800 dark:text-slate-100" title={r.item_titulo ?? ""}>
        {r.item_titulo}
      </p>
      {r.feature_titulo && (
        <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-slate-400" title={r.feature_titulo}>
          <Layers className="size-3 shrink-0 text-violet-500" /> {r.feature_titulo}
        </p>
      )}
      {(r.tags?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.tags!.slice(0, 3).map((t) => (
            <Badge key={t} tone="slate" className="font-normal">
              {t}
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-700/60">
        {nome ? (
          <>
            <Avatar nome={nome} tamanho="xs" className="ring-0" />
            <span className="truncate text-xs text-slate-600 dark:text-slate-300">{nome.split(" ")[0]}</span>
          </>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
            <UserRound className="size-3.5" /> Sem responsável
          </span>
        )}
        <span className="ml-auto">
          {r.sem_estimativa ? (
            <Badge tone="amber" title="Sem horas no DevOps">
              <AlertTriangle className="size-3" /> sem estimativa
            </Badge>
          ) : (
            horas !== null && (
              <span className="flex items-center gap-1 text-xs tabular-nums text-slate-500 dark:text-slate-400" title="Horas restantes">
                <Clock className="size-3" /> {formatHoras(horas)}
              </span>
            )
          )}
        </span>
      </div>
    </article>
  );
}
