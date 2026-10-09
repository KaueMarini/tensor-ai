import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarRange, Sparkles, UserRoundX, Users } from "lucide-react";
import type { Celula } from "@shared/capacidade/motor";
import { ehTimePadrao, type ResumoSquad, resumirSquad } from "@shared/capacidade/squads";
import { type PessoaProjeto, useCapacidadeProjeto } from "@/lib/capacidade-projeto";
import { cn, corAvatar, formatData, formatHoras } from "@/lib/utils";
import { Avatar, MarcaProjeto } from "@/components/avatar";
import { MedidorCarga, pct, STATUS_CARGA, StatusCargaTag } from "@/components/carga";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import type { Membro } from "./membros";

interface Props {
  projetos: { id: string; nome: string }[];
  membros: Membro[];
  temFiltro: boolean;
  onAbrir: (pessoaId: string) => void;
}

export function VisaoSquads({ projetos, membros, temFiltro, onAbrir }: Props) {
  const visiveis = useMemo(() => new Set(membros.map((m) => m.pessoaId)), [membros]);
  const lista = temFiltro ? projetos.filter((p) => membros.some((m) => m.projetos.some((x) => x.id === p.id))) : projetos;
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const projeto = lista.find((p) => p.id === escolhido) ?? lista[0];

  if (!projeto) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
        <Users className="mb-3 size-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {temFiltro ? "Nenhum squad com pessoas nesses filtros" : "Nenhum squad sincronizado ainda"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <label htmlFor="squad-projeto" className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Projeto
        </label>
        <Select id="squad-projeto" value={projeto.id} onChange={(e) => setEscolhido(e.target.value)} className="w-full sm:w-72">
          {lista.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Select>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {lista.length} {lista.length === 1 ? "projeto" : "projetos"} · escolha um para ver os squads (times) dele
        </span>
      </div>
      <ProjetoSquads key={projeto.id} projeto={projeto} visiveis={visiveis} temFiltro={temFiltro} onAbrir={onAbrir} onLargura={() => {}} />
    </div>
  );
}

interface Squad {
  nome: string;
  padrao: boolean;
  pessoas: PessoaProjeto[];
  resumo: ResumoSquad | null;
}

function ProjetoSquads({
  projeto,
  visiveis,
  temFiltro,
  onAbrir,
  onLargura,
}: {
  projeto: { id: string; nome: string };
  visiveis: Set<string>;
  temFiltro: boolean;
  onAbrir: (pessoaId: string) => void;
  onLargura: (largo: boolean) => void;
}) {
  const cap = useCapacidadeProjeto(projeto.id);
  const sprint = cap.sprintAtual;
  const celula = (pessoaId: string) => (sprint ? cap.celula(sprint.id, pessoaId) : undefined);

  const squads = useMemo<Squad[]>(() => {
    const porTime = new Map<string, PessoaProjeto[]>();
    for (const p of cap.pessoas) {
      if (p.foraDoTime) continue;
      for (const t of p.times) porTime.set(t, [...(porTime.get(t) ?? []), p]);
    }
    return [...porTime]
      .map(([nome, pessoas]) => ({
        nome,
        padrao: ehTimePadrao(nome, projeto.nome),
        pessoas,
        resumo: sprint ? resumirSquad(pessoas.map((p) => cap.celula(sprint.id, p.id))) : null,
      }))
      .sort((a, b) => Number(b.padrao) - Number(a.padrao) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [cap.pessoas, cap.celula, sprint, projeto.nome]);

  const foraDosSquads = cap.pessoas.filter((p) => p.foraDoTime);
  const geral = sprint ? resumirSquad(cap.pessoas.filter((p) => !p.foraDoTime).map((p) => celula(p.id))) : null;
  const filtrados = squads
    .map((s) => ({ ...s, pessoas: s.pessoas.filter((p) => visiveis.has(p.id)) }))
    .filter((s) => !temFiltro || s.pessoas.length > 0);
  const mostraFora = !temFiltro && foraDosSquads.length > 0;
  const largo = filtrados.length + Number(mostraFora) > 1;
  useEffect(() => onLargura(largo), [largo, onLargura]);

  return (
    <section>
      <header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <MarcaProjeto nome={projeto.nome} className="size-10 text-base" />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{projeto.nome}</h2>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {squads.length} {squads.length === 1 ? "squad" : "squads"} ·{" "}
              {cap.pessoas.length - foraDosSquads.length} {cap.pessoas.length - foraDosSquads.length === 1 ? "pessoa" : "pessoas"}
            </span>
            {sprint && (
              <span className="inline-flex items-center gap-1">
                <CalendarRange className="size-3.5" />
                {sprint.nome} · {formatData(sprint.inicio)} – {formatData(sprint.fim)}
                {sprint.status !== "atual" && <span className="italic">(próxima)</span>}
              </span>
            )}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {geral && geral.pessoas > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-900">
              <StatusCargaTag status={geral.status} />
              <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{pct(geral.utilizacao)} do projeto</span>
            </span>
          )}
          {cap.semResponsavel.length > 0 && (
            <Badge tone="amber" title="Tasks abertas sem responsável no projeto">
              <UserRoundX className="size-3" /> {cap.semResponsavel.length} sem dono
            </Badge>
          )}
          <Link
            to="/projetos/$projetoId/squad"
            params={{ projetoId: projeto.id }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30"
          >
            Ver no projeto <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </header>

      {cap.carregando ? (
        <GradeEsqueleto />
      ) : cap.erro ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          Erro ao carregar {projeto.nome}: {cap.erro.message}
        </p>
      ) : filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Nenhum squad com membros no Azure DevOps.
        </p>
      ) : (
        <div className={cn("grid grid-cols-1 gap-4", largo && "md:grid-cols-2 2xl:grid-cols-3")}>
          {filtrados.map((s) => (
            <SquadCard
              key={s.nome}
              squad={s}
              projetoNome={projeto.nome}
              sprintNome={sprint?.nome ?? null}
              celula={celula}
              onAbrir={onAbrir}
            />
          ))}
          {mostraFora && <ForaDosSquads pessoas={foraDosSquads} celula={celula} onAbrir={onAbrir} />}
        </div>
      )}
    </section>
  );
}

function SquadCard({
  squad,
  projetoNome,
  sprintNome,
  celula,
  onAbrir,
}: {
  squad: Squad;
  projetoNome: string;
  sprintNome: string | null;
  celula: (pessoaId: string) => Celula | undefined;
  onAbrir: (pessoaId: string) => void;
}) {
  const r = squad.resumo;
  const skills = topSkills(squad.pessoas, 6);
  const titulo = squad.padrao ? "Squad principal" : squad.nome;
  const alertas = r ? r.porStatus.sobrecarga + r.porStatus["sem-capacidade"] : 0;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className={cn("h-1.5", corAvatar(squad.nome))} />

      <div className="flex items-start gap-3 px-5 pt-4">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-white shadow-sm", corAvatar(squad.nome))}>
          <Users className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900 dark:text-slate-100" title={squad.nome}>
            {titulo}
          </h3>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {squad.padrao ? squad.nome : projetoNome} · {squad.pessoas.length}{" "}
            {squad.pessoas.length === 1 ? "pessoa" : "pessoas"}
          </p>
        </div>
        {r && r.pessoas > 0 && <StatusCargaTag status={r.status} className="mt-0.5 shrink-0" />}
      </div>

      <div className="px-5 pt-4">
        {r && r.pessoas > 0 ? (
          <>
            <div className="mb-2 flex items-end justify-between gap-2">
              <div>
                <div className="text-3xl leading-none font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {pct(r.utilizacao)}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">utilização em {sprintNome}</div>
              </div>
              <div className="text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{formatHoras(r.cargaH)}</span> de{" "}
                  {formatHoras(r.capacidadeH)}
                </div>
                <div>{formatHoras(r.livreH)} livres</div>
              </div>
            </div>
            <BarraSquad resumo={r} />
            {alertas > 0 && (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-medium" style={{ color: STATUS_CARGA.sobrecarga.cor }}>
                  {alertas} {alertas === 1 ? "pessoa precisa" : "pessoas precisam"} de atenção
                </span>{" "}
                mesmo com o squad {r.status === "ok" ? "com folga" : "nesse nível"}.
              </p>
            )}
          </>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            Sem sprint com datas para medir a carga.
          </p>
        )}
      </div>

      <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
        {squad.pessoas.map((p) => (
          <LinhaPessoa key={p.id} pessoa={p} celula={celula(p.id)} onAbrir={onAbrir} />
        ))}
      </ul>

      <div className="mt-auto border-t border-slate-100 px-5 py-3 dark:border-slate-800">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">
          <Sparkles className="size-3" /> Skills do squad
        </div>
        {skills.length === 0 ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">Nenhuma skill cadastrada</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {skills.map(([s, n]) => (
              <Badge key={s} tone="slate" className="font-normal" title={`${n} ${n === 1 ? "pessoa" : "pessoas"}`}>
                {s}
                {n > 1 && <span className="opacity-60">×{n}</span>}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function BarraSquad({ resumo }: { resumo: ResumoSquad }) {
  const cor = STATUS_CARGA[resumo.status].cor;
  const fracao = resumo.capacidadeH > 0 ? Math.min(1, resumo.cargaH / resumo.capacidadeH) : resumo.cargaH > 0 ? 1 : 0;
  return (
    <div
      className="h-2.5 overflow-hidden rounded-full"
      style={{ background: `color-mix(in oklab, ${cor} 16%, transparent)` }}
      title={`${formatHoras(resumo.cargaH)} de ${formatHoras(resumo.capacidadeH)} (${pct(resumo.utilizacao)})`}
    >
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${fracao * 100}%`, background: cor }} />
    </div>
  );
}

function LinhaPessoa({
  pessoa,
  celula,
  onAbrir,
}: {
  pessoa: PessoaProjeto;
  celula: Celula | undefined;
  onAbrir: (pessoaId: string) => void;
}) {
  return (
    <li>
      <button
        onClick={() => onAbrir(pessoa.id)}
        className="grid w-full cursor-pointer grid-cols-[auto_1fr_5.5rem_2.75rem] items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
      >
        <Avatar nome={pessoa.nome} tamanho="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm text-slate-800 dark:text-slate-100">{pessoa.nome}</span>
          {pessoa.tags.length > 0 && (
            <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
              {pessoa.tags.map((t) => t.nome).join(" · ")}
            </span>
          )}
        </span>
        {celula ? (
          <>
            <MedidorCarga celula={celula} compacto />
            <span
              className="text-right text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200"
              title={STATUS_CARGA[celula.status].rotulo}
            >
              {pct(celula.utilizacao)}
            </span>
          </>
        ) : (
          <span className="col-span-2 text-right text-xs text-slate-400">—</span>
        )}
      </button>
    </li>
  );
}

function ForaDosSquads({
  pessoas,
  celula,
  onAbrir,
}: {
  pessoas: PessoaProjeto[];
  celula: (pessoaId: string) => Celula | undefined;
  onAbrir: (pessoaId: string) => void;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="px-5 pt-4">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200">Fora dos squads</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Têm tasks no projeto, mas não estão em nenhum time do Azure DevOps.
        </p>
      </div>
      <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-700">
        {pessoas.map((p) => (
          <LinhaPessoa key={p.id} pessoa={p} celula={celula(p.id)} onAbrir={onAbrir} />
        ))}
      </ul>
    </article>
  );
}

function topSkills(pessoas: PessoaProjeto[], n: number): [string, number][] {
  const m = new Map<string, number>();
  for (const p of pessoas) for (const s of p.skills) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).slice(0, n);
}

function GradeEsqueleto() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
      ))}
    </div>
  );
}
