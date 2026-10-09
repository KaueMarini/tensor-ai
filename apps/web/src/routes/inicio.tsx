import { type ReactNode, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarOff,
  ChevronDown,
  CircleCheck,
  FolderKanban,
  Grid3x3,
  KanbanSquare,
  Lightbulb,
  ListChecks,
  OctagonAlert,
  PartyPopper,
  UserRoundPlus,
  UserRoundSearch,
  UserRoundX,
} from "lucide-react";
import { type ItemAtencao, itensDeAtencao } from "@shared/capacidade/atencao";
import { proximasSemanas, semanas, useOcupacaoEquipe } from "@/lib/ocupacao";
import { precisaDeEquipe } from "@/lib/equipe-sugerida";
import { useFuncaoTags, useProjetosPagina, useSemDonoResumo, useSkillsCatalogo } from "@/lib/queries";
import { cn, formatHoras } from "@/lib/utils";
import { MarcaProjeto } from "@/components/avatar";
import { STATUS_CARGA } from "@/components/carga";
import { LegendaMapa, MapaOcupacao, ordenarPorRisco } from "@/components/mapa-ocupacao";
import { Card } from "@/components/ui/card";
import { Ajuda } from "@/components/ajuda";
import type { TermoGlossario } from "@/lib/glossario";
import { PainelMembro } from "@/routes/membros";
import { SugestoesAgente } from "@/components/sugestoes-agente";

const HORIZONTES = [1, 2, 4] as const;
const SEMANAS_MAPA = semanas(5);
const LINHAS_MAPA = 8;
const ITENS_VISIVEIS = 5;

export function InicioPage() {
  const eq = useOcupacaoEquipe();
  const semDonoQ = useSemDonoResumo();
  const projetosQ = useProjetosPagina("", 0);
  const funcaoTags = useFuncaoTags();
  const skills = useSkillsCatalogo();
  const [horizonte, setHorizonte] = useState<(typeof HORIZONTES)[number]>(2);
  const [aberto, setAberto] = useState<string | null>(null);
  const [todosItens, setTodosItens] = useState(false);

  const periodo = useMemo(() => proximasSemanas(horizonte), [horizonte]);
  const semDono = useMemo(
    () =>
      (semDonoQ.data ?? []).map((s) => ({
        projetoId: s.projeto_id!,
        nome: s.projeto_nome ?? "Projeto",
        tasks: s.tasks ?? 0,
        horas: Number(s.horas ?? 0),
      })),
    [semDonoQ.data],
  );

  const analise = useMemo(() => {
    if (!eq.celula) return null;
    const celula = eq.celula;
    const cel = (id: string) => celula(periodo, id);
    const itens = itensDeAtencao({
      pessoas: eq.membros.map((m) => ({ id: m.pessoaId, nome: m.nome })),
      celula: cel,
      nomeProjeto: eq.nomeProjeto,
      semDono,
      semEquipe: (projetosQ.data?.projetos ?? []).filter(precisaDeEquipe).map((p) => ({ projetoId: p.id!, nome: p.nome ?? "Projeto" })),
      periodo: periodo.rotulo,
    });
    let acima = 0;
    let limite = 0;
    let livres = 0;
    for (const m of eq.membros) {
      const c = cel(m.pessoaId);
      if (!c) continue;
      if (c.status === "sobrecarga" || c.status === "sem-capacidade") acima++;
      else if (c.status === "limite") limite++;
      livres += Math.max(0, c.livreH);
    }
    const linhas = ordenarPorRisco(
      eq.membros.map((m) => ({ id: m.pessoaId, nome: m.nome, subtitulo: m.projetos.map((p) => p.nome).join(", ") })),
      celula,
      SEMANAS_MAPA,
    );
    return { itens, acima, limite, livres, linhas, cel };
  }, [eq, periodo, semDono, projetosQ.data]);

  const totalSemDono = semDono.reduce((n, s) => n + s.tasks, 0);
  const selecionado = eq.membros.find((m) => m.pessoaId === aberto) ?? null;
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-brand-600 uppercase dark:text-brand-300">{hoje}</div>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Visão geral da equipe</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ocupação somando todos os projetos · atualizada ao vivo com o Azure DevOps
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Período</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800/60">
            {HORIZONTES.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={horizonte === n}
                onClick={() => setHorizonte(n)}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  horizonte === n
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
                )}
              >
                {n === 1 ? "Esta semana" : `${n} semanas`}
              </button>
            ))}
          </div>
        </div>
      </header>

      <Card className="mb-6 grid grid-cols-2 gap-px overflow-hidden bg-slate-100 lg:grid-cols-4 dark:bg-slate-800 [&>*]:bg-white dark:[&>*]:bg-slate-900">
        <Indicador
          rotulo="Acima da capacidade"
          ajuda="sobrecarregado"
          valor={analise?.acima}
          contexto={`pessoas · ${periodo.rotulo}`}
          status={(analise?.acima ?? 0) > 0 ? "critico" : "ok"}
          href="#prioridades"
        />
        <Indicador
          rotulo="No limite"
          ajuda="noLimite"
          valor={analise?.limite}
          contexto={`pessoas · ${periodo.rotulo}`}
          status={(analise?.limite ?? 0) > 0 ? "atencao" : "ok"}
          href="#prioridades"
        />
        <Indicador
          rotulo="Tarefas sem responsável"
          ajuda="semResponsavel"
          valor={semDonoQ.isLoading ? undefined : totalSemDono}
          contexto="abertas, em todos os projetos"
          status={totalSemDono > 0 ? "atencao" : "ok"}
          to="/analises"
        />
        <Indicador
          rotulo="Horas livres"
          ajuda="horasLivres"
          valor={analise ? formatHoras(Math.round(analise.livres)) : undefined}
          contexto={`na equipe · ${periodo.rotulo}`}
          status="neutro"
        />
      </Card>

      <div className="mb-6">
        <SugestoesAgente limite={3} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card id="prioridades" className="scroll-mt-6 overflow-hidden">
          <CabecalhoCard
            icone={Lightbulb}
            titulo="Prioridades"
            contador={analise?.itens.length}
            descricao={`O que pode virar problema ${periodo.rotulo}, do mais grave ao menos grave.`}
          />
          {!analise ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
              ))}
            </div>
          ) : analise.itens.length === 0 ? (
            <div className="grid place-items-center px-6 py-14 text-center">
              <PartyPopper className="mb-2 size-7 text-emerald-500" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Tudo sob controle</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Ninguém acima do limite e nenhuma task sem dono {periodo.rotulo}.
              </p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {(todosItens ? analise.itens : analise.itens.slice(0, ITENS_VISIVEIS)).map((it, i) => (
                  <ItemPrioridade key={i} item={it} onPessoa={setAberto} />
                ))}
              </ul>
              {analise.itens.length > ITENS_VISIVEIS && (
                <button
                  type="button"
                  onClick={() => setTodosItens((v) => !v)}
                  className="flex w-full cursor-pointer items-center justify-center gap-1 border-t border-slate-100 px-5 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                >
                  {todosItens ? "Mostrar menos" : `Mostrar mais ${analise.itens.length - ITENS_VISIVEIS}`}
                  <ChevronDown className={cn("size-3.5 transition-transform", todosItens && "rotate-180")} />
                </button>
              )}
            </>
          )}
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CabecalhoCard
            icone={Grid3x3}
            titulo="Ocupação nas próximas semanas"
            ajuda="ocupacao"
            descricao="Quem está em risco aparece primeiro. Clique numa pessoa para ver de onde vem a carga."
          />
          <div className="border-b border-slate-100 px-5 py-2.5 dark:border-slate-800">
            <LegendaMapa />
          </div>
          {!analise ? (
            <div className="m-5 h-72 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
          ) : (
            <MapaOcupacao
              linhas={analise.linhas.slice(0, LINHAS_MAPA)}
              periodos={SEMANAS_MAPA}
              celula={eq.celula!}
              nomeProjeto={eq.nomeProjeto}
              onAbrir={setAberto}
            />
          )}
          <Link
            to="/membros"
            className="flex items-center justify-center gap-1 border-t border-slate-100 px-5 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
          >
            Ver a equipe toda ({eq.membros.length}) <ArrowRight className="size-3.5" />
          </Link>
        </Card>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <FolderKanban className="size-4 text-slate-400" /> Projetos
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Saúde de cada projeto {periodo.rotulo}.</p>
          </div>
          <Link
            to="/projetos"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            Ver todos <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(projetosQ.data?.projetos ?? []).map((p) => {
            const pessoas = eq.membros.filter((m) => m.projetos.some((x) => x.id === p.id));
            const acima = analise
              ? pessoas.filter((m) => {
                  const s = analise.cel(m.pessoaId)?.status;
                  return s === "sobrecarga" || s === "sem-capacidade";
                })
              : [];
            const sd = semDono.find((s) => s.projetoId === p.id)?.tasks ?? 0;
            return (
              <CartaoProjeto
                key={p.id}
                id={p.id!}
                nome={p.nome ?? "Projeto"}
                sprint={p.sprint_atual}
                pessoas={pessoas.length}
                acima={acima.map((m) => m.nome)}
                semDono={sd}
                semEquipe={precisaDeEquipe(p)}
              />
            );
          })}
          {projetosQ.isLoading && [0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />)}
        </div>
      </section>

      {selecionado && (
        <PainelMembro
          membro={selecionado}
          funcaoTags={funcaoTags.data ?? []}
          skillsCatalogo={skills.data ?? []}
          nomeProjeto={eq.nomeProjeto}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}

function CabecalhoCard({
  icone: Icone,
  titulo,
  descricao,
  contador,
  ajuda,
}: {
  ajuda?: TermoGlossario;
  icone: typeof Lightbulb;
  titulo: string;
  descricao: string;
  contador?: number;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Icone className="size-4" />
      </span>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {titulo}
          {ajuda && <Ajuda termo={ajuda} />}
          {!!contador && (
            <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {contador}
            </span>
          )}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{descricao}</p>
      </div>
    </div>
  );
}

const COR_STATUS = {
  critico: STATUS_CARGA.sobrecarga.cor,
  atencao: STATUS_CARGA.limite.cor,
  ok: STATUS_CARGA.ok.cor,
} as const;

function Indicador({
  rotulo,
  valor,
  contexto,
  status,
  href,
  to,
  ajuda,
}: {
  ajuda?: TermoGlossario;
  rotulo: string;
  valor: number | string | undefined;
  contexto: string;
  status: "critico" | "atencao" | "ok" | "neutro";
  href?: string;
  to?: "/analises";
}) {
  const Icone = status === "critico" ? OctagonAlert : status === "atencao" ? AlertTriangle : status === "ok" ? CircleCheck : null;
  const cor = status === "neutro" ? undefined : COR_STATUS[status];
  const verDetalhes = "inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline underline-offset-2 dark:text-brand-300";
  return (
    <div className="flex flex-col px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          {rotulo}
          {ajuda && <Ajuda termo={ajuda} />}
        </span>
        {Icone && <Icone className="size-4 shrink-0" style={{ color: cor }} aria-hidden />}
      </div>
      <div className="mt-1.5 text-3xl leading-none font-semibold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
        {valor ?? <span className="inline-block h-7 w-10 animate-pulse rounded bg-slate-100 align-middle dark:bg-slate-800" />}
      </div>
      <div className="mt-1.5 line-clamp-2 text-xs text-slate-400 dark:text-slate-500">{contexto}</div>
      {to && (
        <Link to={to} className={cn(verDetalhes, "mt-2")}>
          Ver detalhes <ArrowRight className="size-3.5" />
        </Link>
      )}
      {href && (
        <a href={href} className={cn(verDetalhes, "mt-2")}>
          Ver detalhes <ArrowRight className="size-3.5" />
        </a>
      )}
    </div>
  );
}

const TIPO_ITEM = {
  "sem-capacidade": { icone: CalendarOff, cor: STATUS_CARGA["sem-capacidade"].cor, selo: "Crítico" },
  sobrecarga: { icone: OctagonAlert, cor: STATUS_CARGA.sobrecarga.cor, selo: "Crítico" },
  limite: { icone: AlertTriangle, cor: STATUS_CARGA.limite.cor, selo: "Atenção" },
  "sem-dono": { icone: UserRoundX, cor: STATUS_CARGA.limite.cor, selo: "Atenção" },
  "sem-equipe": { icone: UserRoundPlus, cor: "var(--color-brand-500)", selo: "Ação" },
} as const;

function ItemPrioridade({ item, onPessoa }: { item: ItemAtencao; onPessoa: (id: string) => void }) {
  const t = TIPO_ITEM[item.tipo];
  return (
    <li className="relative flex gap-3.5 py-4 pr-5 pl-6">
      <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: t.cor }} aria-hidden />
      <t.icone className="mt-0.5 size-4 shrink-0" style={{ color: t.cor }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-snug font-medium text-slate-900 dark:text-slate-100">{item.titulo}</p>
          <span
            className="mt-px shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-700 uppercase dark:text-slate-200"
            style={{ background: `color-mix(in oklab, ${t.cor} 16%, transparent)` }}
          >
            {t.selo}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{item.detalhe}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {item.tipo === "sem-equipe" ? (
            <AcaoLink>
              <Link to="/projetos/$projetoId/resumo" params={{ projetoId: item.projetoId }}>
                <UserRoundPlus className="size-3.5" /> Ver equipe sugerida
              </Link>
            </AcaoLink>
          ) : item.tipo === "sem-dono" ? (
            <AcaoLink>
              <Link to="/analises" search={item.projetoId ? { projeto: item.projetoId } : {}}>
                <Lightbulb className="size-3.5" /> Ver sugestões de quem pode pegar
              </Link>
            </AcaoLink>
          ) : (
            <>
              <AcaoLink>
                <button type="button" onClick={() => onPessoa(item.pessoaId)}>
                  <UserRoundSearch className="size-3.5" /> Ver ocupação
                </button>
              </AcaoLink>
              {item.projetoId && (
                <AcaoLink secundaria>
                  <Link to="/projetos/$projetoId/kanban" params={{ projetoId: item.projetoId }} search={{ resp: item.pessoaId }}>
                    <KanbanSquare className="size-3.5" /> Ver tasks
                  </Link>
                </AcaoLink>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function AcaoLink({ children, secundaria }: { children: ReactNode; secundaria?: boolean }) {
  return (
    <span
      className={cn(
        "text-xs font-medium [&>*]:inline-flex [&>*]:cursor-pointer [&>*]:items-center [&>*]:gap-1.5 [&>*]:hover:underline [&>*]:underline-offset-2",
        secundaria ? "text-slate-500 dark:text-slate-400 [&>*]:hover:text-slate-800 dark:[&>*]:hover:text-slate-200" : "text-brand-700 dark:text-brand-300",
      )}
    >
      {children}
    </span>
  );
}

function CartaoProjeto({
  id,
  nome,
  sprint,
  pessoas,
  acima,
  semDono,
  semEquipe,
}: {
  id: string;
  nome: string;
  sprint: string | null;
  pessoas: number;
  acima: string[];
  semDono: number;
  semEquipe: boolean;
}) {
  const saude =
    acima.length > 0
      ? { rotulo: "Em risco", icone: OctagonAlert, cor: STATUS_CARGA.sobrecarga.cor }
      : semDono > 0 || semEquipe
        ? { rotulo: "Atenção", icone: AlertTriangle, cor: STATUS_CARGA.limite.cor }
        : { rotulo: "Saudável", icone: CircleCheck, cor: STATUS_CARGA.ok.cor };

  return (
    <Link
      to="/projetos/$projetoId"
      params={{ projetoId: id }}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white shadow-xs transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      <div className="flex items-start gap-3 p-4">
        <MarcaProjeto nome={nome} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900 dark:text-slate-100">{nome}</div>
          <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {sprint ?? "Sem sprint ativa"} · {pessoas} {pessoas === 1 ? "pessoa" : "pessoas"}
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-200"
          style={{ background: `color-mix(in oklab, ${saude.cor} 14%, transparent)` }}
        >
          <saude.icone className="size-3" style={{ color: saude.cor }} aria-hidden /> {saude.rotulo}
        </span>
      </div>
      <ul className="mt-auto space-y-1.5 border-t border-slate-100 px-4 py-3 text-xs dark:border-slate-800">
        {acima.length === 0 && semDono === 0 && !semEquipe && (
          <Linha icone={ListChecks}>Equipe com folga e tudo com dono</Linha>
        )}
        {semEquipe && <Linha icone={UserRoundPlus}>Sem equipe · veja o squad e as pessoas sugeridas</Linha>}
        {acima.length > 0 && (
          <Linha icone={OctagonAlert} cor={STATUS_CARGA.sobrecarga.cor}>
            {acima.length === 1 ? `${acima[0]} acima da capacidade` : `${acima.length} pessoas acima da capacidade`}
          </Linha>
        )}
        {semDono > 0 && (
          <Linha icone={UserRoundX} cor={STATUS_CARGA.limite.cor}>
            {semDono} {semDono === 1 ? "task sem responsável" : "tasks sem responsável"}
          </Linha>
        )}
      </ul>
    </Link>
  );
}

function Linha({ icone: Icone, cor, children }: { icone: typeof ListChecks; cor?: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
      <Icone className={cn("size-3.5 shrink-0", !cor && "text-slate-400")} style={cor ? { color: cor } : undefined} aria-hidden />
      <span className="truncate">{children}</span>
    </li>
  );
}
