// Início: a tela que o gestor abre de manhã. Em segundos responde "quem está em risco e o que
// eu faço agora?": pendências priorizadas com ação de um clique, mapa de ocupação pessoa ×
// semana (todos os projetos somados) e a saúde de cada projeto. Números vêm do motor global.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarOff,
  CircleCheck,
  Clock,
  FolderKanban,
  Grid3x3,
  KanbanSquare,
  Lightbulb,
  OctagonAlert,
  PartyPopper,
  UserRoundSearch,
  UserRoundX,
} from "lucide-react";
import { type ItemAtencao, itensDeAtencao } from "@shared/capacidade/atencao";
import { proximasSemanas, semanas, useOcupacaoEquipe } from "@/lib/ocupacao";
import { useFuncaoTags, useProjetosPagina, useSemDonoResumo, useSkillsCatalogo } from "@/lib/queries";
import { cn, formatHoras } from "@/lib/utils";
import { MarcaProjeto } from "@/components/avatar";
import { STATUS_CARGA } from "@/components/carga";
import { LegendaMapa, MapaOcupacao, ordenarPorRisco } from "@/components/mapa-ocupacao";
import { Card, CardTitulo } from "@/components/ui/card";
import { PainelMembro } from "@/routes/membros";

const HORIZONTES = [1, 2, 4] as const;
const SEMANAS_MAPA = semanas(5);
const LINHAS_MAPA = 8;
const ITENS_VISIVEIS = 5;

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

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
  }, [eq, periodo, semDono]);

  const totalSemDono = semDono.reduce((n, s) => n + s.tasks, 0);
  const selecionado = eq.membros.find((m) => m.pessoaId === aberto) ?? null;

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight dark:text-slate-100">{saudacao()}! Veja como está a equipe.</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ocupação somando <strong className="font-medium text-slate-700 dark:text-slate-200">todos os projetos</strong>, atualizada ao vivo com o Azure DevOps.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          Olhando
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
            {HORIZONTES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setHorizonte(n)}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1 font-medium",
                  horizonte === n ? "bg-brand-700 text-white dark:bg-brand-600" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                {n === 1 ? "Esta semana" : `${n} semanas`}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Semáforo: 4 números, cada um leva à ação */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          icone={OctagonAlert}
          cor={STATUS_CARGA.sobrecarga.cor}
          valor={analise?.acima}
          rotulo="acima da capacidade"
          destaque={(analise?.acima ?? 0) > 0}
          href="#precisa"
        />
        <Indicador
          icone={AlertTriangle}
          cor={STATUS_CARGA.limite.cor}
          valor={analise?.limite}
          rotulo="no limite"
          destaque={(analise?.limite ?? 0) > 0}
          href="#precisa"
        />
        <Indicador
          icone={UserRoundX}
          cor={STATUS_CARGA.limite.cor}
          valor={semDonoQ.isLoading ? undefined : totalSemDono}
          rotulo={totalSemDono === 1 ? "task sem responsável" : "tasks sem responsável"}
          destaque={totalSemDono > 0}
          to="/analises"
        />
        <Indicador
          icone={Clock}
          cor={STATUS_CARGA.ok.cor}
          valor={analise ? formatHoras(Math.round(analise.livres)) : undefined}
          rotulo="horas livres na equipe"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card id="precisa" className="scroll-mt-6">
          <CardTitulo
            icone={Lightbulb}
            titulo="Precisa de você"
            descricao={`O que pode virar problema ${periodo.rotulo}, do mais grave para o menos grave.`}
          />
          {!analise ? (
            <div className="space-y-2 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
              ))}
            </div>
          ) : analise.itens.length === 0 ? (
            <div className="grid place-items-center px-6 py-12 text-center">
              <PartyPopper className="mb-2 size-7 text-emerald-500" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Tudo sob controle</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Ninguém acima do limite e nenhuma task sem dono {periodo.rotulo}.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(todosItens ? analise.itens : analise.itens.slice(0, ITENS_VISIVEIS)).map((it, i) => (
                <ItemPendencia key={i} item={it} onPessoa={setAberto} />
              ))}
              {analise.itens.length > ITENS_VISIVEIS && (
                <li>
                  <button
                    type="button"
                    onClick={() => setTodosItens((v) => !v)}
                    className="w-full cursor-pointer px-5 py-2.5 text-center text-xs font-medium text-brand-700 hover:bg-slate-50 dark:text-brand-300 dark:hover:bg-slate-800/50"
                  >
                    {todosItens ? "Mostrar menos" : `Mostrar mais ${analise.itens.length - ITENS_VISIVEIS}`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card className="min-w-0">
          <CardTitulo
            icone={Grid3x3}
            titulo="Ocupação nas próximas semanas"
            descricao="Quem está pior aparece primeiro. Clique numa pessoa para ver de onde vem a carga."
          />
          <div className="border-b border-slate-100 px-5 py-2 dark:border-slate-800">
            <LegendaMapa />
          </div>
          {!analise ? (
            <div className="m-5 h-72 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
          ) : (
            <div className="py-3 pr-3">
              <MapaOcupacao
                linhas={analise.linhas.slice(0, LINHAS_MAPA)}
                periodos={SEMANAS_MAPA}
                celula={eq.celula!}
                nomeProjeto={eq.nomeProjeto}
                onAbrir={setAberto}
              />
            </div>
          )}
          <Link
            to="/membros"
            className="flex items-center justify-center gap-1 border-t border-slate-100 px-5 py-2.5 text-xs font-medium text-brand-700 hover:bg-slate-50 dark:border-slate-800 dark:text-brand-300 dark:hover:bg-slate-800/50"
          >
            Ver a equipe toda ({eq.membros.length}) <ArrowRight className="size-3.5" />
          </Link>
        </Card>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <FolderKanban className="size-4 text-brand-700 dark:text-brand-300" /> Projetos
          </h2>
          <Link to="/projetos" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
            Ver todos
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(projetosQ.data?.projetos ?? []).map((p) => {
            const pessoas = eq.membros.filter((m) => m.projetos.some((x) => x.id === p.id));
            const acima = analise
              ? pessoas.filter((m) => {
                  const s = analise.cel(m.pessoaId)?.status;
                  return s === "sobrecarga" || s === "sem-capacidade";
                })
              : [];
            const sd = semDono.find((s) => s.projetoId === p.id)?.tasks ?? 0;
            return <CartaoProjeto key={p.id} id={p.id!} nome={p.nome ?? "Projeto"} sprint={p.sprint_atual} pessoas={pessoas.length} acima={acima.map((m) => m.nome)} semDono={sd} />;
          })}
          {projetosQ.isLoading && [0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />)}
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

function Indicador({
  icone: Icone,
  cor,
  valor,
  rotulo,
  destaque,
  href,
  to,
}: {
  icone: typeof Clock;
  cor: string;
  valor: number | string | undefined;
  rotulo: string;
  destaque?: boolean;
  href?: string;
  to?: "/analises";
}) {
  const conteudo = (
    <>
      <span
        className="grid size-10 shrink-0 place-items-center rounded-lg"
        style={{ background: `color-mix(in oklab, ${cor} ${destaque ? 18 : 10}%, transparent)`, color: cor }}
      >
        <Icone className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl leading-tight font-semibold text-slate-900 tabular-nums dark:text-slate-100">
          {valor ?? <span className="inline-block h-6 w-8 animate-pulse rounded bg-slate-100 align-middle dark:bg-slate-800" />}
        </div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{rotulo}</div>
      </div>
      {(href || to) && <ArrowRight className="ml-auto size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />}
    </>
  );
  const classe = cn(
    "group flex items-center gap-3 rounded-xl border bg-white px-4 py-3.5 shadow-xs transition-colors dark:bg-slate-900",
    destaque ? "border-slate-300 dark:border-slate-700" : "border-slate-200 dark:border-slate-800",
    (href || to) && "cursor-pointer hover:border-brand-500/50",
  );
  if (to)
    return (
      <Link to={to} className={classe}>
        {conteudo}
      </Link>
    );
  if (href)
    return (
      <a href={href} className={classe}>
        {conteudo}
      </a>
    );
  return <div className={classe}>{conteudo}</div>;
}

const ICONE_ITEM = {
  "sem-capacidade": { icone: CalendarOff, cor: STATUS_CARGA["sem-capacidade"].cor },
  sobrecarga: { icone: OctagonAlert, cor: STATUS_CARGA.sobrecarga.cor },
  limite: { icone: AlertTriangle, cor: STATUS_CARGA.limite.cor },
  "sem-dono": { icone: UserRoundX, cor: STATUS_CARGA.limite.cor },
} as const;

function ItemPendencia({ item, onPessoa }: { item: ItemAtencao; onPessoa: (id: string) => void }) {
  const ic = ICONE_ITEM[item.tipo];
  return (
    <li className="flex gap-3 px-5 py-3.5">
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in oklab, ${ic.cor} 14%, transparent)`, color: ic.cor }}
      >
        <ic.icone className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.titulo}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.detalhe}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.tipo === "sem-dono" ? (
            <Acao to="/analises" search={item.projetoId ? { projeto: item.projetoId } : {}} primaria>
              <Lightbulb className="size-3.5" /> Ver sugestões
            </Acao>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onPessoa(item.pessoaId)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-brand-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-900 dark:bg-brand-600 dark:hover:bg-brand-500"
              >
                <UserRoundSearch className="size-3.5" /> Ver ocupação
              </button>
              {item.projetoId && (
                <Link
                  to="/projetos/$projetoId/kanban"
                  params={{ projetoId: item.projetoId }}
                  search={{ resp: item.pessoaId }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <KanbanSquare className="size-3.5" /> Ver tasks
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function Acao({ to, search, primaria, children }: { to: "/analises"; search: { projeto?: string }; primaria?: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      search={search}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium",
        primaria
          ? "bg-brand-700 text-white hover:bg-brand-900 dark:bg-brand-600 dark:hover:bg-brand-500"
          : "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300",
      )}
    >
      {children}
    </Link>
  );
}

function CartaoProjeto({
  id,
  nome,
  sprint,
  pessoas,
  acima,
  semDono,
}: {
  id: string;
  nome: string;
  sprint: string | null;
  pessoas: number;
  acima: string[];
  semDono: number;
}) {
  const ok = acima.length === 0 && semDono === 0;
  return (
    <Link
      to="/projetos/$projetoId"
      params={{ projetoId: id }}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center gap-3">
        <MarcaProjeto nome={nome} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900 dark:text-slate-100">{nome}</div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
            {sprint ? `${sprint} em andamento` : "Sem sprint ativa"} · {pessoas} {pessoas === 1 ? "pessoa" : "pessoas"}
          </div>
        </div>
        <ArrowRight className="size-4 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
      </div>
      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
        {ok ? (
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <CircleCheck className="size-3.5" style={{ color: STATUS_CARGA.ok.cor }} /> Equipe com folga e tudo com dono
          </span>
        ) : (
          <>
            {acima.length > 0 && (
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                <OctagonAlert className="size-3.5 shrink-0" style={{ color: STATUS_CARGA.sobrecarga.cor }} />
                <span className="truncate">
                  {acima.length === 1 ? `${acima[0]} acima da capacidade` : `${acima.length} pessoas acima da capacidade`}
                </span>
              </div>
            )}
            {semDono > 0 && (
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                <UserRoundX className="size-3.5 shrink-0" style={{ color: STATUS_CARGA.limite.cor }} />
                {semDono} {semDono === 1 ? "task sem responsável" : "tasks sem responsável"}
              </div>
            )}
          </>
        )}
      </div>
    </Link>
  );
}
