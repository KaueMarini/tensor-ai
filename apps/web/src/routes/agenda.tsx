// Agenda: calendário do mês com sprints (início/fim), feriados, ausências e entregas de
// features, de todos os projetos ou de um. O gestor registra/remove ausências aqui; elas
// entram no motor de capacidade como folga pessoal.

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import {
  agruparAusencias,
  type Celula,
  celulasDoMes,
  chaveMes,
  type EventoAgenda,
  type EventoDoDia,
  eventosPorDia,
  hojeLocal,
  lerMes,
  mesVizinho,
  nomeMes,
  proximosEventos,
  rotuloData,
  somarDias,
  type TipoEvento,
} from "@/lib/agenda";
import {
  type TipoAusencia,
  TIPOS_AUSENCIA,
  useAgenda,
  useMembros,
  useProjetosLista,
  useRegistrarAusencia,
  useRemoverAusencia,
} from "@/lib/queries";
import { cn, normalizarNome } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Ajuda } from "@/components/ajuda";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MAX_POR_DIA = 4;
const POR_PAGINA = 9;
const MAX_PROXIMOS = 90;
const JANELA_PROXIMOS_DIAS = 120;

const ESTILO: Record<TipoEvento, { pilula: string; ponto: string; rotulo: string; legenda: string; badge: "slate" | "amber" | "violet" | "green" }> = {
  sprint: {
    pilula: "bg-brand-700 text-white dark:bg-brand-600",
    ponto: "bg-brand-700 dark:bg-brand-400",
    rotulo: "Sprint",
    legenda: "Sprint (início e fim)",
    badge: "slate",
  },
  feriado: {
    pilula: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    ponto: "bg-amber-400",
    rotulo: "Feriado",
    legenda: "Feriado ou folga do time",
    badge: "amber",
  },
  ausencia: {
    pilula: "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200",
    ponto: "bg-indigo-400",
    rotulo: "Ausência",
    legenda: "Férias, folga ou ausência",
    badge: "violet",
  },
  entrega: {
    pilula: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
    ponto: "bg-emerald-500",
    rotulo: "Entrega",
    legenda: "Entrega de feature",
    badge: "green",
  },
};

const ROTULO_AUSENCIA = Object.fromEntries(TIPOS_AUSENCIA.map((t) => [t.valor, t.rotulo])) as Record<string, string>;
const primeiroNome = (nome: string) => normalizarNome(nome).split(" ")[0] ?? nome;

type DadosAgenda = NonNullable<ReturnType<typeof useAgenda>["data"]>;

/** Linhas do banco → eventos da agenda (texto curto na pílula, completo no title). */
/**
 * agruparSprints: no calendário, sprints de mesmo nome e datas em projetos diferentes viram
 * uma pílula só (espaço curto por dia). Na lista de próximos, cada uma aparece com o seu
 * projeto e leva até ele.
 */
function montarEventos(d: DadosAgenda | undefined, geral: boolean, agruparSprints: boolean): EventoAgenda[] {
  if (!d) return [];
  const out: EventoAgenda[] = [];
  const sprints = new Map<
    string,
    { id: string; nome: string; inicio: string; fim: string; projetos: { id: string; nome: string }[] }
  >();
  for (const s of d.sprints) {
    if (!s.inicio || !s.fim) continue;
    const chave = agruparSprints ? `${s.nome}|${s.inicio}|${s.fim}` : s.id;
    const g = sprints.get(chave) ?? { id: s.id, nome: s.nome, inicio: s.inicio, fim: s.fim, projetos: [] };
    g.projetos.push({ id: s.projeto_id, nome: s.projeto?.nome ?? "" });
    sprints.set(chave, g);
  }
  for (const s of sprints.values()) {
    const n = s.projetos.length;
    const nomes = s.projetos.map((p) => p.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
    out.push({
      id: `s-${s.id}`,
      tipo: "sprint",
      inicio: s.inicio,
      fim: s.fim,
      // na lista (sem agrupar), o projeto vem em destaque e a sprint embaixo
      // no calendário, várias sprints iguais mostram só o nome (os projetos ficam no title)
      texto: !agruparSprints && geral ? nomes[0]! : !geral || n > 1 ? s.nome : `${s.nome} · ${nomes[0]}`,
      subtexto: !agruparSprints && geral ? s.nome : undefined,
      detalhe: `${s.nome} (${rotuloData(s)}) — ${n > 1 ? `${n} projetos: ` : ""}${nomes.join(", ")}`,
      projetoId: n === 1 ? s.projetos[0]!.id : undefined,
    });
  }
  for (const f of d.feriados) {
    out.push({ id: `f-${f.id}`, tipo: "feriado", inicio: f.data, fim: f.data, texto: f.nome, detalhe: `Feriado: ${f.nome}` });
  }
  const ausencias = agruparAusencias(
    d.ausencias.map((a) => ({
      id: a.id,
      pessoaId: a.pessoa_id,
      tipo: a.tipo,
      inicio: a.inicio,
      fim: a.fim,
      nome: a.pessoa?.nome ?? "Sem nome",
    })),
  );
  for (const a of ausencias) {
    const tipo = ROTULO_AUSENCIA[a.tipo] ?? a.tipo;
    out.push({
      id: `a-${a.ids.join("-")}`,
      tipo: "ausencia",
      inicio: a.inicio,
      fim: a.fim,
      texto: `${primeiroNome(a.nome)} · ${tipo}`,
      detalhe: `${normalizarNome(a.nome)} — ${tipo} (${rotuloData(a)})`,
      ausenciaIds: a.ids,
    });
  }
  // folgas registradas no Azure DevOps (days off do time/sprint)
  const diasDeFeriado = new Set(d.feriados.map((f) => f.data));
  for (const o of d.folgas) {
    const projeto = o.time?.projeto?.nome ?? "";
    const quando = rotuloData(o);
    if (o.pessoa_id) {
      const nome = o.pessoa?.nome ?? "Sem nome";
      out.push({
        id: `o-${o.id}`,
        tipo: "ausencia",
        inicio: o.inicio,
        fim: o.fim,
        texto: `${primeiroNome(nome)} · Folga`,
        subtexto: "Férias ou folga (Azure DevOps)",
        detalhe: `${normalizarNome(nome)} — férias ou folga registrada no Azure DevOps (${quando}) · ${projeto}`,
        projetoId: o.time?.projeto_id,
      });
    } else {
      // folga do time num feriado nacional é o mesmo dia de descanso: não repete
      if (o.inicio === o.fim && diasDeFeriado.has(o.inicio)) continue;
      out.push({
        id: `o-${o.id}`,
        tipo: "feriado",
        inicio: o.inicio,
        fim: o.fim,
        texto: geral ? `Folga do time · ${projeto}` : "Folga do time",
        subtexto: "Folga do time inteiro (Azure DevOps)",
        detalhe: `Folga do time ${o.time?.nome ?? ""} (${projeto}) — registrada no Azure DevOps (${quando})`,
        projetoId: o.time?.projeto_id,
      });
    }
  }
  for (const e of d.entregas) {
    const data = (e.target_date ?? e.finish_date)?.slice(0, 10);
    if (!data) continue;
    out.push({
      id: `e-${e.devops_id}`,
      tipo: "entrega",
      inicio: data,
      fim: data,
      texto: e.titulo,
      detalhe: `Entrega da feature #${e.devops_id}: ${e.titulo}${geral ? ` — ${e.projeto?.nome ?? ""}` : ""}`,
      projetoId: e.projeto_id,
    });
  }
  return out;
}

export function AgendaPage() {
  const { mes, projeto = "" } = useSearch({ from: "/app/agenda" });
  const navigate = useNavigate({ from: "/agenda" });
  const [registrando, setRegistrando] = useState(false);

  const hoje = hojeLocal();
  const atual = lerMes(mes) ?? { ano: Number(hoje.slice(0, 4)), mes0: Number(hoje.slice(5, 7)) - 1 };
  const celulas = useMemo(() => celulasDoMes(atual.ano, atual.mes0), [atual.ano, atual.mes0]);

  // duas janelas: a grade do mês e os próximos dias (a lista lateral não depende do mês aberto)
  const grade = useAgenda(celulas[0]!.data, celulas.at(-1)!.data, projeto);
  const futuro = useAgenda(hoje, somarDias(hoje, JANELA_PROXIMOS_DIAS), projeto);
  const projetos = useProjetosLista();

  const geral = !projeto;
  const porDia = useMemo(() => eventosPorDia(celulas, montarEventos(grade.data, geral, true)), [celulas, grade.data, geral]);
  const proximos = useMemo(() => proximosEventos(montarEventos(futuro.data, geral, false), hoje, MAX_PROXIMOS), [futuro.data, geral, hoje]);

  const irPara = (ano: number, mes0: number) => {
    const chave = chaveMes(ano, mes0);
    void navigate({ search: (s) => ({ ...s, mes: chave === hoje.slice(0, 7) ? undefined : chave }) });
  };
  const anterior = mesVizinho(atual.ano, atual.mes0, -1);
  const proximo = mesVizinho(atual.ano, atual.mes0, 1);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-brand-600 uppercase dark:text-brand-300">Calendário</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Agenda</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Sprints, feriados, ausências e entregas das features. Num só lugar: quando começa e termina cada sprint (ciclo
            de trabalho), os feriados, quem está de férias ou de folga e quando cada feature deve ser entregue.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select
            aria-label="Filtrar por projeto"
            value={projeto}
            onChange={(e) => void navigate({ search: (s) => ({ ...s, projeto: e.target.value || undefined }) })}
            className="w-full sm:w-60"
          >
            <option value="">Todos os projetos</option>
            {(projetos.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
          <Button onClick={() => setRegistrando(true)} className="w-full sm:w-auto">
            <Plus className="size-4" /> Registrar ausência
          </Button>
        </div>
      </header>

      {(grade.error || futuro.error) && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          Erro ao carregar a agenda: {(grade.error ?? futuro.error)?.message}
        </p>
      )}

      <div className="space-y-5">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {nomeMes(atual.ano, atual.mes0)}
              {grade.isFetching && <Loader2 className="size-3.5 animate-spin text-slate-400" aria-label="Carregando" />}
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="w-8 px-0" aria-label="Mês anterior" onClick={() => irPara(anterior.ano, anterior.mes0)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="sm" aria-label="Ir para o mês atual" onClick={() => void navigate({ search: (s) => ({ ...s, mes: undefined }) })}>
                Hoje
              </Button>
              <Button variant="outline" size="sm" className="w-8 px-0" aria-label="Próximo mês" onClick={() => irPara(proximo.ano, proximo.mes0)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div role="grid" aria-label={`Calendário de ${nomeMes(atual.ano, atual.mes0)}`}>
            <div role="row" className="grid grid-cols-7 border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60">
              {SEMANA.map((d) => (
                <div key={d} role="columnheader" className="px-1.5 py-2.5 text-center text-xs font-semibold tracking-wider text-slate-500 uppercase sm:px-2.5 sm:text-left dark:text-slate-400">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800">
              {celulas.map((c) => (
                <Dia key={c.data} celula={c} hoje={c.data === hoje} eventos={porDia.get(c.data) ?? []} />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 px-4 py-3.5 sm:px-5 dark:border-slate-800">
            {(["sprint", "feriado", "ausencia", "entrega"] as const).map((t) => (
              <span key={t} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <span className={cn("size-3 rounded-sm", ESTILO[t].ponto)} /> {ESTILO[t].legenda}
                {t === "sprint" && <Ajuda termo="sprint" />}
                {t === "entrega" && <Ajuda termo="feature" />}
              </span>
            ))}
            <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">Passe o mouse num dia para ver tudo o que acontece nele</span>
          </div>
        </Card>

        <ProximosEventos eventos={proximos} carregando={futuro.isLoading} />
      </div>

      {registrando && <RegistrarAusencia projetoId={projeto} hoje={hoje} onClose={() => setRegistrando(false)} />}
    </div>
  );
}

function Dia({ celula, hoje, eventos }: { celula: Celula; hoje: boolean; eventos: EventoDoDia[] }) {
  const visiveis = eventos.slice(0, MAX_POR_DIA);
  const resto = eventos.length - visiveis.length;
  return (
    <div
      role="gridcell"
      aria-label={`${celula.dia}${eventos.length ? `, ${eventos.length} ${eventos.length === 1 ? "evento" : "eventos"}` : ""}`}
      title={eventos.map((e) => e.detalhe).join("\n") || undefined}
      className={cn(
        "min-h-16 min-w-0 bg-white p-1 sm:min-h-28 sm:p-2 lg:min-h-36 dark:bg-slate-900",
        !celula.doMes && "bg-slate-50 opacity-55 dark:bg-slate-950",
      )}
    >
      <div className="mb-1 flex justify-center sm:justify-start">
        {hoje ? (
          <span className="grid size-[26px] place-items-center rounded-full bg-red-500 text-xs font-semibold text-white" aria-current="date">
            {celula.dia}
          </span>
        ) : (
          <span className={cn("grid h-[26px] items-center px-1 text-sm tabular-nums", celula.doMes ? "text-slate-700 dark:text-slate-300" : "text-slate-400 dark:text-slate-500")}>
            {celula.dia}
          </span>
        )}
      </div>

      {/* celular: só pontos coloridos; a partir de sm, pílulas com texto */}
      <div className="flex flex-wrap justify-center gap-0.5 sm:hidden">
        {eventos.slice(0, 4).map((e) => (
          <span key={e.id} className={cn("size-1.5 rounded-full", ESTILO[e.tipo].ponto)} />
        ))}
      </div>
      <div className="hidden space-y-1 sm:block">
        {visiveis.map((e) => (
          <div key={e.id} title={e.detalhe} className={cn("truncate rounded-md px-2 py-0.5 text-xs leading-[18px] font-medium", ESTILO[e.tipo].pilula)}>
            {e.texto}
          </div>
        ))}
        {resto > 0 && <div className="px-1 text-xs font-medium text-slate-500 dark:text-slate-400">+{resto} mais</div>}
      </div>
    </div>
  );
}

function ProximosEventos({ eventos, carregando }: { eventos: EventoAgenda[]; carregando: boolean }) {
  const remover = useRemoverAusencia();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);

  // páginas de POR_PAGINA itens: o card não cresce; ao trocar o filtro a lista volta para a 1ª página
  const paginas = Math.max(1, Math.ceil(eventos.length / POR_PAGINA));
  const chaveLista = eventos.map((e) => e.id).join(",");
  useEffect(() => setPagina(0), [chaveLista]);
  const atual = Math.min(pagina, paginas - 1);
  const daPagina = eventos.slice(atual * POR_PAGINA, (atual + 1) * POR_PAGINA);

  return (
    <Card>
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <CalendarClock className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Próximos eventos</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">O que vem pela frente, em ordem de data. Itens com seta abrem o projeto.</p>
        </div>
      </div>
      {/* altura reservada para uma página cheia (9 itens): trocar de página não mexe no layout */}
      <ul className={cn("grid content-start gap-x-4 px-3 py-2 sm:grid-cols-2 lg:grid-cols-3", paginas > 1 && "min-h-[592px] sm:min-h-[336px] lg:min-h-[208px]")}>
        {carregando &&
          Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="px-2 py-3">
              <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </li>
          ))}
        {!carregando && eventos.length === 0 && (
          <li className="col-span-full px-2 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Nada programado nos próximos meses.</li>
        )}
        {daPagina.map((e) => (
          <li key={e.id} className="flex h-16 items-center gap-2 border-b border-slate-100 px-2 dark:border-slate-800">
            {e.projetoId ? (
              <Link
                to="/projetos/$projetoId"
                params={{ projetoId: e.projetoId }}
                title={`${e.detalhe ?? e.texto} — abrir o projeto`}
                className="group -mx-2 -my-1.5 flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:bg-slate-800/60"
              >
                <ConteudoEvento e={e} />
                <ChevronRight className="mt-1 size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600 dark:text-slate-600 dark:group-hover:text-brand-300" />
              </Link>
            ) : (
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <ConteudoEvento e={e} />
              </div>
            )}
            {e.ausenciaIds &&
              (confirmando === e.id ? (
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500"
                  disabled={remover.isPending}
                  onClick={() =>
                    remover.mutate(e.ausenciaIds!, {
                      onSuccess: () => toast.success("Ausência removida"),
                      onError: (err) => toast.error(err.message),
                      onSettled: () => setConfirmando(null),
                    })
                  }
                >
                  Remover
                </Button>
              ) : (
                <button
                  onClick={() => setConfirmando(e.id)}
                  aria-label={`Remover ausência: ${e.detalhe ?? e.texto}`}
                  className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ))}
          </li>
        ))}
      </ul>
      {paginas > 1 && (
        <nav aria-label="Páginas de próximos eventos" className="flex items-center justify-end gap-1 border-t border-slate-100 px-3 py-1.5 dark:border-slate-800">
          <span className="mr-1 text-[11px] tabular-nums text-slate-400 dark:text-slate-500" aria-live="polite">
            {atual + 1} de {paginas}
          </span>
          <button
            onClick={() => setPagina(atual - 1)}
            disabled={atual === 0}
            aria-label="Página anterior de eventos"
            className="grid size-7 cursor-pointer place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => setPagina(atual + 1)}
            disabled={atual + 1 >= paginas}
            aria-label="Próxima página de eventos"
            className="grid size-7 cursor-pointer place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}
    </Card>
  );
}

function ConteudoEvento({ e }: { e: EventoAgenda }) {
  return (
    <>
      <Badge tone={ESTILO[e.tipo].badge} className="mt-0.5 shrink-0 tabular-nums">
        {rotuloData(e)}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-800 dark:text-slate-200" title={e.detalhe}>
          {e.tipo === "entrega" ? `Entrega: ${e.texto}` : e.texto}
        </p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {e.subtexto ?? ESTILO[e.tipo].rotulo}
        </p>
      </div>
    </>
  );
}

function RegistrarAusencia({ projetoId, hoje, onClose }: { projetoId: string; hoje: string; onClose: () => void }) {
  const membros = useMembros();
  const registrar = useRegistrarAusencia();
  const [pessoaId, setPessoaId] = useState("");
  const [tipo, setTipo] = useState<TipoAusencia>("ferias");
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(hoje);

  const pessoas = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of membros.data ?? []) {
      if (!r.pessoa_id || (projetoId && r.projeto_id !== projetoId)) continue;
      m.set(r.pessoa_id, normalizarNome(r.nome ?? "Sem nome"));
    }
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [membros.data, projetoId]);

  const datasInvalidas = !!inicio && !!fim && fim < inicio;
  const podeSalvar = !!pessoaId && !!inicio && !!fim && !datasInvalidas && !registrar.isPending;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!podeSalvar) return;
    try {
      await registrar.mutateAsync({ pessoaId, tipo, inicio, fim });
      const nome = pessoas.find(([id]) => id === pessoaId)?.[1] ?? "";
      toast.success(`Ausência de ${nome} registrada (${rotuloData({ inicio, fim })})`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Dialog titulo="Registrar ausência" descricao="Os dias úteis do período deixam de contar na capacidade da pessoa." onClose={onClose}>
      <form onSubmit={salvar} className="space-y-4 px-5 py-5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Pessoa</span>
          <Select required value={pessoaId} onChange={(e) => setPessoaId(e.target.value)} disabled={membros.isLoading}>
            <option value="">{membros.isLoading ? "Carregando…" : "Selecione"}</option>
            {pessoas.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipo</span>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAusencia)}>
            {TIPOS_AUSENCIA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </Select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Início</span>
            <Input type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} className="dark:[color-scheme:dark]" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Fim</span>
            <Input
              type="date"
              required
              min={inicio || undefined}
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              aria-invalid={datasInvalidas}
              aria-describedby={datasInvalidas ? "erro-datas" : undefined}
              className={cn("dark:[color-scheme:dark]", datasInvalidas && "border-red-400 focus:border-red-500 focus:ring-red-500/15")}
            />
          </label>
        </div>
        {datasInvalidas && (
          <p id="erro-datas" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            A data de fim não pode ser antes do início.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!podeSalvar}>
            {registrar.isPending && <Loader2 className="size-4 animate-spin" />}
            Registrar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
