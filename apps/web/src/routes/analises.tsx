// Análises (sidebar): sugestões de responsável para tasks abertas sem dono, em todos os projetos.
// O ranking vem do motor determinístico (@shared/capacidade/recomendacao): encaixe de skills e
// tags de função + horas livres na sprint (motor de capacidade). O gestor aprova com "Atribuir"
// e a task é reatribuída no Azure DevOps (auditado em `acao`). Nada muda sem o clique.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  Clock,
  Info,
  Lightbulb,
  Loader2,
  PartyPopper,
  Search,
  Sparkles,
  UserPlus,
  UserRoundX,
} from "lucide-react";
import { horasPendentes } from "@shared/capacidade/motor";
import type { CelulaGlobal } from "@shared/capacidade/global";
import { type OpcaoAlocacao, recomendarAlocacao, type RecomendacaoTask } from "@shared/capacidade/recomendacao";
import { type PessoaProjeto, useCapacidadeProjeto } from "@/lib/capacidade-projeto";
import { useAtribuirTask, useProjetosPorIds, useSemDonoResumo } from "@/lib/queries";
import { useCargaGlobal } from "@/lib/carga-global";
import type { BacklogRow } from "@/lib/backlog";
import { cn, formatHoras } from "@/lib/utils";
import { Avatar, MarcaProjeto } from "@/components/avatar";
import { pct, STATUS_CARGA, StatusCargaTag } from "@/components/carga";
import { QuandoVisivel } from "@/components/quando-visivel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stat } from "@/components/ui/card";

const AZDO_ORG_URL = (import.meta.env.VITE_AZDO_ORG_URL as string | undefined)?.replace(/\/$/, "");

export function AnalisesPage() {
  const resumo = useSemDonoResumo();
  const [projeto, setProjeto] = useState("");
  const [busca, setBusca] = useState("");

  const projetos = resumo.data ?? [];
  const visiveis = projeto ? projetos.filter((p) => p.projeto_id === projeto) : projetos;
  const totalTasks = projetos.reduce((n, p) => n + (p.tasks ?? 0), 0);
  const totalHoras = projetos.reduce((n, p) => n + Number(p.horas), 0);

  return (
    <div className="mx-auto max-w-[1300px] px-6 py-6">
      <header className="mb-6">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Análises</div>
        <h1 className="text-2xl font-semibold tracking-tight dark:text-slate-100">Sugestões de alocação</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Tasks abertas sem responsável e quem melhor pode assumir cada uma, pelo encaixe de skills e tags e pelo tempo
          livre na sprint. Você aprova; a mudança vai direto para o Azure DevOps.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icone={UserRoundX} rotulo="Tasks sem responsável" valor={totalTasks} alerta={totalTasks > 0} />
        <Stat icone={Clock} rotulo="Horas sem dono" valor={formatHoras(totalHoras)} />
        <Stat icone={Lightbulb} rotulo="Projetos com pendências" valor={projetos.length} />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar task, tag ou #id" className="pl-8" />
        </div>
        <select
          value={projeto}
          onChange={(e) => setProjeto(e.target.value)}
          className={cn(
            "h-9 cursor-pointer rounded-md border bg-white px-2.5 text-sm shadow-xs focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 focus:outline-none dark:bg-slate-900",
            projeto
              ? "border-brand-500 font-medium text-brand-800 dark:text-brand-200"
              : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300",
          )}
        >
          <option value="">Todos os projetos</option>
          {projetos.map((p) => (
            <option key={p.projeto_id} value={p.projeto_id ?? ""}>
              {p.projeto_nome} ({p.tasks})
            </option>
          ))}
        </select>
        <ComoFunciona />
      </div>

      {resumo.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
      ) : resumo.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          Erro ao carregar: {resumo.error.message}
        </p>
      ) : visiveis.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
          <PartyPopper className="mb-3 size-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Todas as tasks abertas têm responsável</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Quando surgir uma task sem dono, ela aparece aqui com sugestões.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {visiveis.map((p) => (
            <QuandoVisivel key={p.projeto_id} reserva={<div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />}>
              <ProjetoSugestoes projetoId={p.projeto_id!} projetoNome={p.projeto_nome ?? "Projeto"} busca={busca} />
            </QuandoVisivel>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projeto
// ---------------------------------------------------------------------------

function ProjetoSugestoes({ projetoId, projetoNome, busca }: { projetoId: string; projetoNome: string; busca: string }) {
  const cap = useCapacidadeProjeto(projetoId);
  const idsCandidatos = useMemo(() => cap.pessoas.filter((p) => !p.foraDoTime).map((p) => p.id), [cap.pessoas]);
  // Ocupação no ÂMBITO GERAL: capacidade única da pessoa × tasks dela em todos os projetos
  const global = useCargaGlobal(idsCandidatos);

  const { tasks, recomendacoes, pessoas, detalhe } = useMemo(() => {
    const sprintsComData = new Map(cap.sprints.map((s) => [s.id, s]));
    const celulaGlobal = (sprintId: string, pessoaId: string) => {
      const s = sprintsComData.get(sprintId);
      return s && global.celula ? global.celula({ id: s.id, inicio: s.inicio, fim: s.fim }, pessoaId) : undefined;
    };
    // Mais urgentes primeiro: sprint mais próxima, depois as maiores (as sugestões consideram as anteriores)
    const ordem = (r: BacklogRow) => (r.sprint_id && sprintsComData.get(r.sprint_id)?.inicio) || "9999";
    const tasks = [...cap.semResponsavel].sort(
      (a, b) => ordem(a).localeCompare(ordem(b)) || (b.horas_restantes ?? b.horas_estimadas ?? 0) - (a.horas_restantes ?? a.horas_estimadas ?? 0),
    );
    const candidatos = cap.pessoas.filter((p) => !p.foraDoTime);
    const recomendacoes = recomendarAlocacao({
      tasks: tasks.map((r) => ({
        id: r.item_id!,
        sprintId: r.sprint_id && sprintsComData.has(r.sprint_id) ? r.sprint_id : null,
        tags: r.tags ?? [],
        featureTags: r.feature_tags ?? [],
        horas: r.sem_estimativa
          ? null
          : horasPendentes({ horasRestantes: r.horas_restantes, horasEstimadas: r.horas_estimadas, horasConcluidas: r.horas_concluidas }),
      })),
      candidatos: candidatos.map((p) => ({
        id: p.id,
        skills: p.skills.map((s) => ({
          tag: s,
          confirmada: p.skillsInfo.info[s]?.confirmada ?? true,
          evidencias: p.skillsInfo.info[s]?.evidencias ?? 0,
        })),
        funcoes: p.tags.map((t) => t.nome),
      })),
      celula: celulaGlobal,
      sprintPadrao: cap.sprintAtual?.id ?? null,
    });
    return {
      tasks,
      recomendacoes: new Map(recomendacoes.map((r) => [r.taskId, r])),
      pessoas: new Map(candidatos.map((p) => [p.id, p])),
      detalhe: celulaGlobal,
    };
  }, [cap.semResponsavel, cap.pessoas, cap.sprints, cap.sprintAtual, global.celula]);
  const carregando = cap.carregando || global.carregando;
  const erro = cap.erro ?? global.erro;

  const q = busca.trim().toLowerCase();
  const filtradas = q
    ? tasks.filter((r) =>
        [r.item_titulo, r.feature_titulo, `#${r.item_id}`, ...(r.tags ?? []), ...(r.feature_tags ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : tasks;
  const sprintNome = (id: string | null) => cap.sprints.find((s) => s.id === id);

  if (!carregando && filtradas.length === 0 && q) return null;

  return (
    <section>
      <header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <MarcaProjeto nome={projetoNome} className="size-10 text-base" />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{projetoNome}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {carregando
              ? "Calculando…"
              : `${tasks.length} ${tasks.length === 1 ? "task sem responsável" : "tasks sem responsável"} · ${pessoas.size} ${pessoas.size === 1 ? "pessoa" : "pessoas"} no time`}
          </p>
        </div>
        <Link
          to="/projetos/$projetoId/kanban"
          params={{ projetoId }}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30"
        >
          Abrir Kanban <ArrowUpRight className="size-3.5" />
        </Link>
      </header>

      {carregando ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
      ) : erro ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          Erro ao calcular {projetoNome}: {erro.message}
        </p>
      ) : filtradas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-5 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Nenhuma task aberta sem responsável neste projeto.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {pessoas.size === 1 && tasks.length > 3 && (
            <p className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              Só uma pessoa no time deste projeto no Azure DevOps: todas as sugestões caem nela. Adicione gente ao time
              (Project settings → Teams) para o motor distribuir.
            </p>
          )}
          {pessoas.size === 0 && (
            <p className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              Ninguém nos times deste projeto no Azure DevOps — não há a quem sugerir.
            </p>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtradas.map((r) => (
              <LinhaTask
                key={r.item_id}
                task={r}
                rec={recomendacoes.get(r.item_id!)}
                pessoas={pessoas}
                detalhe={detalhe}
                sprint={sprintNome(recomendacoes.get(r.item_id!)?.sprintId ?? null)}
                semSprintPropria={!r.sprint_id || !cap.sprints.some((s) => s.id === r.sprint_id)}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Uma task e suas sugestões
// ---------------------------------------------------------------------------

function LinhaTask({
  task,
  rec,
  pessoas,
  detalhe,
  sprint,
  semSprintPropria,
}: {
  task: BacklogRow;
  rec: RecomendacaoTask | undefined;
  pessoas: Map<string, PessoaProjeto>;
  detalhe: (sprintId: string, pessoaId: string) => CelulaGlobal | undefined;
  sprint: { nome: string; inicio: string; fim: string } | undefined;
  semSprintPropria: boolean;
}) {
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const melhor = rec?.opcoes[0];
  const outras = rec?.opcoes.slice(1) ?? [];
  const horas = task.sem_estimativa ? null : (task.horas_restantes ?? task.horas_estimadas);

  return (
    <li className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Task */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <IdLink id={task.item_id!} />
          <span>{task.item_tipo}</span>
          <span>·</span>
          <span>{task.item_estado}</span>
        </div>
        <h3 className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{task.item_titulo}</h3>
        {task.feature_titulo && (
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" title={task.feature_titulo}>
            em <span className="text-slate-700 dark:text-slate-300">{task.feature_titulo}</span>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {sprint && (
            <Badge tone="blue" title={semSprintPropria ? "Task sem sprint: usando a sprint atual" : undefined}>
              <CalendarRange className="size-3" /> {sprint.nome}
              {semSprintPropria && " (atual)"}
            </Badge>
          )}
          {horas !== null && horas !== undefined ? (
            <Badge tone="slate">
              <Clock className="size-3" /> {formatHoras(horas)}
            </Badge>
          ) : (
            <Badge tone="amber" title="Sem horas no DevOps: o impacto na carga não entra no cálculo">
              sem estimativa
            </Badge>
          )}
          {rec?.tagsConsideradas.map((t) => (
            <Badge key={t} tone="slate" className="font-normal">
              {t}
            </Badge>
          ))}
        </div>
      </div>

      {/* Sugestões */}
      <div className="min-w-0">
        {!melhor ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            Sem candidatos no time do projeto.
          </p>
        ) : (
          <>
            <Opcao opcao={melhor} pessoa={pessoas.get(melhor.pessoaId)} global={rec?.sprintId ? detalhe(rec.sprintId, melhor.pessoaId) : undefined} task={task} sprint={sprint} destaque />
            {outras.length > 0 && (
              <button
                onClick={() => setMaisOpcoes((v) => !v)}
                className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", maisOpcoes && "rotate-180")} />
                {maisOpcoes ? "Esconder" : `Ver ${outras.length} ${outras.length === 1 ? "outra opção" : "outras opções"}`}
              </button>
            )}
            {maisOpcoes && (
              <div className="mt-2 space-y-2">
                {outras.map((o) => (
                  <Opcao key={o.pessoaId} opcao={o} pessoa={pessoas.get(o.pessoaId)} global={rec?.sprintId ? detalhe(rec.sprintId, o.pessoaId) : undefined} task={task} sprint={sprint} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function rotuloEncaixe(e: number | null): { texto: string; tom: string } {
  if (e === null) return { texto: "Task sem tags — decidido pela folga", tom: "text-slate-500 dark:text-slate-400" };
  if (e >= 0.75) return { texto: `Encaixe alto · ${pct(e)}`, tom: "text-emerald-700 dark:text-emerald-400" };
  if (e >= 0.4) return { texto: `Encaixe médio · ${pct(e)}`, tom: "text-sky-700 dark:text-sky-400" };
  if (e > 0) return { texto: `Encaixe baixo · ${pct(e)}`, tom: "text-amber-700 dark:text-amber-400" };
  return { texto: "Nenhuma skill em comum", tom: "text-slate-500 dark:text-slate-400" };
}

function Opcao({
  opcao,
  pessoa,
  global,
  task,
  sprint,
  destaque,
}: {
  opcao: OpcaoAlocacao;
  pessoa: PessoaProjeto | undefined;
  global: CelulaGlobal | undefined;
  task: BacklogRow;
  sprint: { nome: string } | undefined;
  destaque?: boolean;
}) {
  const atribuir = useAtribuirTask();
  const nome = pessoa?.nome ?? "Pessoa";
  const enc = rotuloEncaixe(opcao.encaixe);
  const st = STATUS_CARGA[opcao.statusDepois];

  async function aprovar() {
    try {
      const r = await atribuir.mutateAsync({
        devopsId: task.item_id!,
        pessoaId: opcao.pessoaId,
        motivo: {
          origem: "analises",
          encaixe: opcao.encaixe,
          skills: opcao.matches,
          sprint: sprint?.nome ?? null,
          utilizacao_antes: opcao.utilizacaoAntes,
          utilizacao_depois: opcao.utilizacaoDepois,
        },
      });
      toast.success(r.semMudanca ? `${nome} já era responsável por #${task.item_id}` : `#${task.item_id} atribuída a ${nome} no Azure DevOps`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        destaque
          ? "border-brand-200 bg-brand-50/40 dark:border-brand-800/60 dark:bg-brand-900/15"
          : "border-slate-200 dark:border-slate-800",
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar nome={nome} tamanho="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-slate-900 dark:text-slate-100">{nome}</span>
            {destaque && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold tracking-wide text-brand-700 uppercase dark:text-brand-300">
                <Sparkles className="size-3" /> Melhor opção
              </span>
            )}
          </div>
          <div className={cn("text-xs font-medium", enc.tom)}>{enc.texto}</div>
          {opcao.matches.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {opcao.matches.map((m) =>
                m.tipo === "sugerida" ? (
                  <span
                    key={m.tag}
                    title="Skill sugerida pelas tasks (ainda não confirmada)"
                    className="inline-flex items-center gap-1 rounded border border-dashed border-brand-400/70 px-1.5 py-0.5 text-[11px] leading-4 text-brand-800 dark:text-brand-200"
                  >
                    <Sparkles className="size-3 opacity-70" /> {m.tag}
                  </span>
                ) : (
                  <Badge key={m.tag} tone={m.tipo === "funcao" ? "violet" : "green"} title={m.tipo === "funcao" ? "Tag de função" : "Skill confirmada"}>
                    {m.tag}
                  </Badge>
                ),
              )}
            </div>
          )}
        </div>
        <Button size="sm" variant={destaque ? "primary" : "outline"} onClick={() => void aprovar()} disabled={atribuir.isPending}>
          {atribuir.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
          Atribuir
        </Button>
      </div>

      {/* Impacto na carga */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200/70 pt-2 text-xs text-slate-600 dark:border-slate-700/70 dark:text-slate-300">
        {opcao.capacidadeH > 0 ? (
          <>
            <span className="inline-flex items-center gap-1 tabular-nums">
              {pct(opcao.utilizacaoAntes)} <ArrowRight className="size-3" />
              <span className="font-semibold" style={{ color: opcao.statusDepois === "ok" ? undefined : st.cor }}>
                {pct(opcao.utilizacaoDepois)}
              </span>
              {sprint && <span className="text-slate-500 dark:text-slate-400">em {sprint.nome}</span>}
            </span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              {opcao.livreDepoisH >= 0
                ? `${formatHoras(opcao.livreDepoisH)} livres depois`
                : `${formatHoras(-opcao.livreDepoisH)} acima da capacidade`}
            </span>
          </>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">Sem capacidade nesta sprint (férias ou Capacity zerada no DevOps)</span>
        )}
        <StatusCargaTag status={opcao.statusDepois} className="ml-auto" />
      </div>
      {global && global.porProjeto.length > 0 && <OcupacaoProjetos celula={global} />}
    </div>
  );
}

/** De onde vem a ocupação da pessoa no período: tasks em todos os projetos. */
function OcupacaoProjetos({ celula }: { celula: CelulaGlobal }) {
  const ids = celula.porProjeto.map((p) => p.projetoId);
  const nomes = new Map((useProjetosPorIds(ids).data ?? []).map((p) => [p.id, p.nome]));
  return (
    <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
      Ocupação em todos os projetos ({formatHoras(celula.capacidadeH)} de capacidade no período):{" "}
      {celula.porProjeto.map((p, i) => (
        <span key={p.projetoId}>
          {i > 0 && " · "}
          <span className="text-slate-700 dark:text-slate-300">{nomes.get(p.projetoId) ?? "…"}</span> {formatHoras(p.cargaH)}
        </span>
      ))}
    </p>
  );
}

function IdLink({ id }: { id: number }) {
  const cls = "font-mono text-slate-400";
  if (!AZDO_ORG_URL) return <span className={cls}>#{id}</span>;
  return (
    <a
      href={`${AZDO_ORG_URL}/_workitems/edit/${id}`}
      target="_blank"
      rel="noreferrer"
      className={cn(cls, "hover:text-brand-700 hover:underline dark:hover:text-brand-300")}
      title="Abrir no Azure DevOps"
    >
      #{id}
    </a>
  );
}

function ComoFunciona() {
  return (
    <details className="group relative ml-auto">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
        <Info className="size-3.5" /> Como a sugestão é calculada
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-[22rem] rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <p>
          <strong className="text-slate-800 dark:text-slate-100">Encaixe (65%)</strong>: tags da task e da Feature × skills da
          pessoa. Skill confirmada conta inteira; sugerida pelas tasks conta 50–80% (conforme a evidência); tag de
          função conta 50%.
        </p>
        <p className="mt-2">
          <strong className="text-slate-800 dark:text-slate-100">Folga (35%)</strong>: horas livres da pessoa no período da
          sprint da task, depois de recebê-la, <strong className="text-slate-800 dark:text-slate-100">somando todos os projetos</strong>:
          a capacidade é a soma da Capacity dela em todos os times, limitada à jornada (ex.: 8h/dia), e a carga são as
          tasks abertas dela em qualquer projeto. Descontados folgas e feriados.
        </p>
        <p className="mt-2">
          Quem passaria do limite perde pontos; quem não tem capacidade na sprint vai para o fim. As sugestões são
          distribuídas em sequência — a carga da melhor opção de uma task já conta para as próximas.
        </p>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Só entram pessoas dos times do projeto (o DevOps não aceita outro responsável). Fala de carga e encaixe, não de
          desempenho.
        </p>
      </div>
    </details>
  );
}
