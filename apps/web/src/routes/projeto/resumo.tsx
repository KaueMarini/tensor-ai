// Resumo do projeto (aba padrão): o estado da sprint em um olhar — números do time, o que
// precisa de atenção (inclusive quem parece bem aqui mas está sobrecarregado somando outros
// projetos), quem pode absorver trabalho e o mapa pessoa × sprint. Números vêm do motor.

import { useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, BatteryMedium, CalendarRange, Gauge, Grid3x3, Layers, Lightbulb, PartyPopper, UserRoundX } from "lucide-react";
import type { Celula, StatusCarga } from "@shared/capacidade/motor";
import { useCapacidadeProjeto } from "@/lib/capacidade-projeto";
import { useCargaGlobal } from "@/lib/carga-global";
import { precisaDeEquipe } from "@/lib/equipe-sugerida";
import { useProjeto } from "@/lib/queries";
import { EquipeSugeridaPainel } from "@/components/equipe-sugerida";
import { cn, formatData, formatHoras } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { pct, STATUS_CARGA, StatusCargaTag } from "@/components/carga";
import { Card, CardTitulo, Stat } from "@/components/ui/card";

const GRAVIDADE: Record<StatusCarga, number> = { "sem-capacidade": 3, sobrecarga: 2, limite: 1, ok: 0 };

type DestinoAcao =
  | { rotulo: string; to: "/analises"; search: { projeto: string } }
  | { rotulo: string; to: "/projetos/$projetoId/equipe" }
  | { rotulo: string; to: "/projetos/$projetoId/kanban"; search: { resp: string; sprint: string } };

interface Alerta {
  chave: string;
  status: StatusCarga;
  texto: string;
  detalhe: string;
  acao?: DestinoAcao;
}

export function ResumoPage() {
  const { projetoId } = useParams({ strict: false }) as { projetoId: string };
  const projeto = useProjeto(projetoId);
  // Projeto novo sem gente: a primeira coisa que o gestor precisa é de quem pode tocar
  if (precisaDeEquipe(projeto.data))
    return (
      <div className="space-y-5">
        <EquipeSugeridaPainel projetoId={projetoId} projetoNome={projeto.data?.nome ?? "o projeto"} />
        <ResumoSprint projetoId={projetoId} />
      </div>
    );
  return <ResumoSprint projetoId={projetoId} />;
}

function ResumoSprint({ projetoId }: { projetoId: string }) {
  const cap = useCapacidadeProjeto(projetoId);
  const [sprintId, setSprintId] = useState<string | null>(null);
  const sprint = cap.sprints.find((s) => s.id === sprintId) ?? cap.sprintAtual;
  const idsTime = useMemo(() => cap.pessoas.filter((p) => !p.foraDoTime).map((p) => p.id), [cap.pessoas]);
  const global = useCargaGlobal(idsTime);

  const daSprint = useMemo(() => {
    if (!sprint) return [];
    return cap.pessoas
      .map((p) => ({ p, c: cap.celula(sprint.id, p.id)! }))
      .filter((x) => x.c)
      .sort((a, b) => GRAVIDADE[b.c.status] - GRAVIDADE[a.c.status] || (b.c.utilizacao ?? 0) - (a.c.utilizacao ?? 0));
  }, [cap, sprint]);

  const alertas = useMemo(() => {
    const out: Alerta[] = [];
    const verEquipe: DestinoAcao = { rotulo: "Ver equipe", to: "/projetos/$projetoId/equipe" };
    for (const s of cap.sprints.filter((x) => x.status !== "passada")) {
      for (const p of cap.pessoas) {
        const c = cap.celula(s.id, p.id);
        if (!c || c.status === "ok") continue;
        const detalhe = `${formatHoras(c.cargaH)} de ${formatHoras(c.capacidadeH)} · ${c.itens} ${c.itens === 1 ? "task" : "tasks"}`;
        const verTasks: DestinoAcao = { rotulo: "Ver tasks", to: "/projetos/$projetoId/kanban", search: { resp: p.id, sprint: s.id } };
        if (c.status === "sem-capacidade")
          out.push({ chave: `${s.id}${p.id}`, status: c.status, texto: `${p.nome} tem tasks na ${s.nome}, mas está ausente (folga ou férias)`, detalhe, acao: verTasks });
        else if (c.status === "sobrecarga")
          out.push({ chave: `${s.id}${p.id}`, status: c.status, texto: `${p.nome} vai a ${pct(c.utilizacao)} na ${s.nome} — ${formatHoras(-c.livreH)} acima`, detalhe, acao: verTasks });
        else out.push({ chave: `${s.id}${p.id}`, status: c.status, texto: `${p.nome} está no limite na ${s.nome} (${pct(c.utilizacao)})`, detalhe, acao: verEquipe });
      }
    }
    // Parece bem aqui, mas está pior somando os outros projetos (sprint em foco)
    if (sprint && global.celula) {
      for (const p of cap.pessoas) {
        const c = cap.celula(sprint.id, p.id);
        const g = global.celula({ id: sprint.id, inicio: sprint.inicio, fim: sprint.fim }, p.id);
        if (!c || !g || g.status === "ok" || GRAVIDADE[g.status] <= GRAVIDADE[c.status]) continue;
        out.push({
          chave: `g${p.id}`,
          status: g.status,
          texto: `${p.nome} parece ${c.status === "ok" ? "com folga" : "no limite"} aqui (${pct(c.utilizacao)}), mas está a ${pct(g.utilizacao)} somando os outros projetos`,
          detalhe: `${formatHoras(g.cargaH)} de ${formatHoras(g.capacidadeH)} no geral na ${sprint.nome} · cuidado ao passar mais trabalho`,
          acao: verEquipe,
        });
      }
    }
    return out.sort((a, b) => GRAVIDADE[b.status] - GRAVIDADE[a.status]);
  }, [cap, sprint, global.celula]);

  const comFolga = daSprint
    .filter((x) => x.c.status === "ok" && livreAteAtencao(x.c) > 0)
    .sort((a, b) => livreAteAtencao(b.c) - livreAteAtencao(a.c));
  const resumo = useMemo(() => {
    const cap0 = daSprint.reduce((s, x) => s + x.c.capacidadeH, 0);
    const carga = daSprint.reduce((s, x) => s + x.c.cargaH, 0);
    return {
      acima: daSprint.filter((x) => x.c.status === "sobrecarga" || x.c.status === "sem-capacidade").length,
      utilizacao: cap0 > 0 ? carga / cap0 : null,
      livre: daSprint.reduce((s, x) => s + Math.max(0, x.c.livreH), 0),
    };
  }, [daSprint]);

  if (cap.carregando) return <div className="h-96 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />;
  if (cap.erro) return <p className="text-sm text-red-600">Erro ao carregar: {cap.erro.message}</p>;
  if (cap.sprints.length === 0)
    return (
      <Card className="grid place-items-center px-6 py-16 text-center">
        <CalendarRange className="mb-3 size-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Sem sprints com datas</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">A análise de capacidade precisa do período de cada sprint no Azure DevOps.</p>
      </Card>
    );

  const semDono = cap.semResponsavel.length;
  const horasSemDono = cap.semResponsavel.reduce((n, r) => n + (r.horas_restantes ?? r.horas_estimadas ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {sprint?.nome}
            {sprint?.status === "atual" && (
              <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 align-middle text-[11px] font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
                em andamento
              </span>
            )}
          </h2>
          {sprint && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatData(sprint.inicio)} a {formatData(sprint.fim)}
            </p>
          )}
        </div>
        <select
          value={sprint?.id ?? ""}
          onChange={(e) => setSprintId(e.target.value)}
          aria-label="Sprint"
          className="h-9 cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {cap.sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
              {s.status === "atual" ? " (atual)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icone={Gauge} rotulo="Uso do time na sprint" valor={pct(resumo.utilizacao)} ajuda="ocupacao" />
        <Stat icone={UserRoundX} rotulo="Acima da capacidade" valor={resumo.acima} alerta={resumo.acima > 0} ajuda="sobrecarregado" />
        <Stat icone={BatteryMedium} rotulo="Horas livres no time" valor={formatHoras(resumo.livre)} ajuda="horasLivres" />
        <Stat icone={Layers} ajuda="semResponsavel" rotulo="Tarefas sem responsável" valor={semDono} detalhe={`${cap.semEstimativa.length} sem estimativa`} alerta={semDono > 0} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardTitulo icone={AlertTriangle} titulo="Precisa de atenção" descricao="Sprint atual e próximas, do mais grave para o menos grave." />
          <ul className="max-h-[440px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {semDono > 0 && (
              <li className="flex gap-3 px-5 py-3">
                <UserRoundX className="mt-0.5 size-4 shrink-0" style={{ color: "var(--status-atencao)" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {semDono} {semDono === 1 ? "task aberta sem responsável" : "tasks abertas sem responsável"} ({formatHoras(horasSemDono)})
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {cap.semResponsavel
                      .slice(0, 3)
                      .map((r) => `#${r.item_id} ${r.item_titulo}`)
                      .join(" · ")}
                  </p>
                </div>
                <BotaoAcao projetoId={projetoId} acao={{ rotulo: "Ver sugestões", to: "/analises", search: { projeto: projetoId } }} primaria />
              </li>
            )}
            {alertas.map((a) => {
              const s = STATUS_CARGA[a.status];
              return (
                <li key={a.chave} className="flex gap-3 px-5 py-3">
                  <s.icone className="mt-0.5 size-4 shrink-0" style={{ color: s.cor }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 dark:text-slate-200">{a.texto}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{a.detalhe}</p>
                  </div>
                  {a.acao && <BotaoAcao projetoId={projetoId} acao={a.acao} />}
                </li>
              );
            })}
            {alertas.length === 0 && semDono === 0 && (
              <li className="grid place-items-center px-5 py-10 text-center">
                <PartyPopper className="mb-2 size-6 text-emerald-500" />
                <p className="text-sm text-slate-600 dark:text-slate-300">Nenhum risco de capacidade à vista.</p>
              </li>
            )}
          </ul>
        </Card>

        <Card>
          <CardTitulo
            icone={Lightbulb}
            titulo="Quem pode absorver trabalho"
            descricao={`Horas livres na ${sprint?.nome ?? "sprint"} sem passar de ${pct(daSprint[0]?.c.limites.atencao ?? 0.8)} de uso.`}
          />
          <ul className="space-y-3 px-5 py-4">
            {comFolga.length === 0 && <li className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">Ninguém com folga nesta sprint.</li>}
            {comFolga.slice(0, 6).map(({ p, c }) => {
              const g = sprint && global.celula ? global.celula({ id: sprint.id, inicio: sprint.inicio, fim: sprint.fim }, p.id) : undefined;
              const cuidado = !!g && g.status !== "ok";
              return (
                <li key={p.id} className="flex items-center gap-3">
                  <Avatar nome={p.nome} tamanho="sm" className="ring-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{p.nome}</span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{formatHoras(livreAteAtencao(c))}</span> livres
                      </span>
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 truncate text-[11px]",
                        cuidado ? "font-medium text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-slate-400",
                      )}
                    >
                      {cuidado
                        ? `Cuidado: ${pct(g.utilizacao)} somando todos os projetos`
                        : p.tags
                            .map((t) => t.nome)
                            .concat(p.skills.slice(0, 3))
                            .join(" · ") || "Sem skills/tags cadastradas"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card>
        <CardTitulo
          icone={Grid3x3}
          titulo="Mapa de utilização"
          descricao="Pessoa × sprint, só a carga deste projeto. Clique numa sprint para focar nela."
          acao={<LegendaStatus />}
        />
        <Mapa cap={cap} selecionada={sprint?.id} onSprint={setSprintId} />
      </Card>
    </div>
  );
}

function BotaoAcao({ projetoId, acao, primaria }: { projetoId: string; acao: DestinoAcao; primaria?: boolean }) {
  const classe = cn(
    "inline-flex h-7 shrink-0 items-center gap-1 self-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap",
    primaria
      ? "bg-brand-700 text-white hover:bg-brand-900 dark:bg-brand-600 dark:hover:bg-brand-500"
      : "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
  );
  const conteudo = (
    <>
      {acao.rotulo} <ArrowRight className="size-3" />
    </>
  );
  if (acao.to === "/analises")
    return (
      <Link to="/analises" search={acao.search} className={classe}>
        {conteudo}
      </Link>
    );
  if (acao.to === "/projetos/$projetoId/kanban")
    return (
      <Link to="/projetos/$projetoId/kanban" params={{ projetoId }} search={acao.search} className={classe}>
        {conteudo}
      </Link>
    );
  return (
    <Link to="/projetos/$projetoId/equipe" params={{ projetoId }} className={classe}>
      {conteudo}
    </Link>
  );
}

/** Horas que a pessoa ainda pode receber sem passar do limite de atenção (regras do gestor). */
function livreAteAtencao(c: Celula) {
  return Math.max(0, Math.floor(c.capacidadeH * c.limites.atencao - c.cargaH));
}

function LegendaStatus() {
  return (
    <div className="hidden shrink-0 flex-wrap gap-x-3 gap-y-1 sm:flex">
      {(["ok", "limite", "sobrecarga"] as const).map((s) => (
        <StatusCargaTag key={s} status={s} className="font-normal text-slate-600 dark:text-slate-300" />
      ))}
    </div>
  );
}

function Mapa({
  cap,
  selecionada,
  onSprint,
}: {
  cap: ReturnType<typeof useCapacidadeProjeto>;
  selecionada?: string;
  onSprint: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full border-separate border-spacing-[3px] text-sm">
        <thead>
          <tr>
            <th className="w-44" />
            {cap.sprints.map((s) => (
              <th key={s.id} className="min-w-20 pb-1 align-bottom">
                <button
                  onClick={() => onSprint(s.id)}
                  className={cn(
                    "w-full cursor-pointer rounded-md px-1 py-1 text-[11px] leading-tight font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800",
                    s.id === selecionada ? "bg-brand-50 text-brand-900 dark:bg-brand-900/40 dark:text-brand-100" : "text-slate-500 dark:text-slate-400",
                  )}
                >
                  {s.nome}
                  {s.status === "atual" && <span className="block text-[10px] font-normal text-slate-400">atual</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cap.pessoas.map((p) => (
            <tr key={p.id}>
              <td className="pr-2">
                <div className="flex items-center gap-2">
                  <Avatar nome={p.nome} tamanho="xs" className="ring-0" />
                  <span className={cn("truncate text-xs", p.foraDoTime ? "text-slate-400 italic" : "text-slate-700 dark:text-slate-200")} title={p.foraDoTime ? "Tem tasks, mas não está nos times do projeto" : p.nome}>
                    {p.nome}
                  </span>
                </div>
              </td>
              {cap.sprints.map((s) => {
                const c = cap.celula(s.id, p.id);
                if (!c) return <td key={s.id} />;
                const st = STATUS_CARGA[c.status];
                const vazio = c.cargaH === 0 && c.status === "ok";
                return (
                  <td key={s.id} className="p-0">
                    <div
                      className={cn(
                        "group relative grid h-10 place-items-center rounded-md text-xs font-medium tabular-nums",
                        s.id === selecionada && "ring-1 ring-brand-500/60",
                        vazio ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-100",
                      )}
                      style={{
                        background: vazio ? "var(--viz-grid)" : `color-mix(in oklab, ${st.cor} ${c.status === "ok" ? 18 : 32}%, transparent)`,
                      }}
                    >
                      <span className="flex items-center gap-1">
                        {c.status !== "ok" && <st.icone className="size-3" style={{ color: st.cor }} />}
                        {c.status === "sem-capacidade" ? "folga" : pct(c.utilizacao)}
                      </span>
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-48 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-xs font-normal shadow-lg group-hover:block dark:border-slate-700 dark:bg-slate-800">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{p.nome}</div>
                        <div className="mb-1.5 text-slate-500 dark:text-slate-400">{s.nome}</div>
                        <StatusCargaTag status={c.status} />
                        <div className="mt-1 text-slate-600 dark:text-slate-300">
                          {formatHoras(c.cargaH)} de {formatHoras(c.capacidadeH)} · {c.itens} tasks
                        </div>
                        <div className="text-slate-400">{c.diasUteis} dias úteis</div>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
