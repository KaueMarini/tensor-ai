// Capacidade (sidebar): o gestor define as regras de capacidade e vê a ocupação GERAL de cada
// pessoa (todos os projetos somados). Regras em cascata (@shared/capacidade/regras):
// pessoa → geral → padrão de mercado. Os números vêm do motor global, nunca da tela.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CircleCheck, Clock, Gauge, Info, OctagonAlert, RotateCcw, Scale, Search, AlertTriangle } from "lucide-react";
import type { StatusCarga } from "@shared/capacidade/motor";
import type { CelulaGlobal } from "@shared/capacidade/global";
import { PADRAO_MERCADO, personalizadas, type RegrasGerais } from "@shared/capacidade/regras";
import { useMembros } from "@/lib/queries";
import { useCargaGlobal } from "@/lib/carga-global";
import { type Regras, useSalvarRegraPessoa, useSalvarRegrasGerais } from "@/lib/regras";
import { cn, formatHoras, normalizarNome } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { MedidorCarga, ORIGEM_CAPACIDADE, pct, STATUS_CARGA, StatusCargaTag } from "@/components/carga";
import { CampoRegra } from "@/components/campo-regra";
import { Button } from "@/components/ui/button";
import { Card, CardTitulo, Stat } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const PERIODOS = [
  { semanas: 1, rotulo: "Esta semana" },
  { semanas: 2, rotulo: "Próximas 2 semanas" },
  { semanas: 4, rotulo: "Próximas 4 semanas" },
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Segunda desta semana até a sexta de N semanas depois. */
function periodoDe(semanas: number) {
  const hoje = new Date();
  const base = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  const dow = base.getUTCDay() || 7;
  const seg = new Date(base.getTime() - (dow - 1) * 86_400_000);
  const sex = new Date(seg.getTime() + ((semanas - 1) * 7 + 4) * 86_400_000);
  return { id: `geral-${iso(seg)}-${semanas}`, inicio: iso(seg), fim: iso(sex) };
}

const fmtData = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

type Filtro = "todos" | "alerta" | "limite" | "ok";
const GRAVIDADE: Record<StatusCarga, number> = { "sem-capacidade": 3, sobrecarga: 2, limite: 1, ok: 0 };

interface PessoaLinha {
  id: string;
  nome: string;
  projetos: Map<string, string>;
}

export function CapacidadePage() {
  const membros = useMembros();
  const [semanas, setSemanas] = useState<number>(2);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  const { pessoas, nomesProjeto } = useMemo(() => {
    const pessoas = new Map<string, PessoaLinha>();
    const nomesProjeto = new Map<string, string>();
    for (const m of membros.data ?? []) {
      if (!m.pessoa_id || !m.projeto_id) continue;
      nomesProjeto.set(m.projeto_id, m.projeto_nome ?? "Projeto");
      const p = pessoas.get(m.pessoa_id) ?? { id: m.pessoa_id, nome: normalizarNome(m.nome ?? "Sem nome"), projetos: new Map() };
      p.projetos.set(m.projeto_id, m.projeto_nome ?? "Projeto");
      pessoas.set(m.pessoa_id, p);
    }
    return { pessoas: [...pessoas.values()], nomesProjeto };
  }, [membros.data]);

  const ids = useMemo(() => pessoas.map((p) => p.id), [pessoas]);
  const global = useCargaGlobal(ids);
  const periodo = useMemo(() => periodoDe(semanas), [semanas]);

  const linhas = useMemo(() => {
    if (!global.celula) return [];
    return pessoas
      .map((p) => ({ p, c: global.celula!(periodo, p.id) }))
      .filter((x): x is { p: PessoaLinha; c: CelulaGlobal } => !!x.c)
      .sort(
        (a, b) =>
          GRAVIDADE[b.c.status] - GRAVIDADE[a.c.status] ||
          (b.c.utilizacao ?? 0) - (a.c.utilizacao ?? 0) ||
          a.p.nome.localeCompare(b.p.nome, "pt-BR"),
      );
  }, [global.celula, pessoas, periodo]);

  const contagem = {
    alerta: linhas.filter((l) => l.c.status === "sobrecarga" || l.c.status === "sem-capacidade").length,
    limite: linhas.filter((l) => l.c.status === "limite").length,
    ok: linhas.filter((l) => l.c.status === "ok").length,
  };
  const livres = linhas.reduce((n, l) => n + Math.max(0, l.c.livreH), 0);
  const termo = busca.trim().toLowerCase();
  const visiveis = linhas.filter(
    (l) =>
      (filtro === "todos" ||
        (filtro === "alerta" ? l.c.status === "sobrecarga" || l.c.status === "sem-capacidade" : l.c.status === filtro)) &&
      (!termo || l.p.nome.toLowerCase().includes(termo)),
  );

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <header className="mb-6">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Capacidade</div>
        <h1 className="text-2xl font-semibold tracking-tight dark:text-slate-100">Ocupação geral da equipe</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Quanto cada pessoa está ocupada somando <strong className="font-medium text-slate-700 dark:text-slate-200">todos os projetos</strong>.
          Você define a jornada, o foco e quando acender o alerta. O que não for definido segue o padrão de mercado.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icone={OctagonAlert} rotulo="Sobrecarregados" valor={contagem.alerta} alerta={contagem.alerta > 0} detalhe="acima do limite" />
        <Stat icone={AlertTriangle} rotulo="No limite" valor={contagem.limite} alerta={contagem.limite > 0} />
        <Stat icone={CircleCheck} rotulo="Com folga" valor={contagem.ok} />
        <Stat icone={Clock} rotulo="Horas livres" valor={formatHoras(Math.round(livres))} detalhe={PERIODOS.find((x) => x.semanas === semanas)?.rotulo.toLowerCase()} />
      </div>

      <div className="space-y-5">
        {global.regras && <RegrasGeraisCard geral={global.regras.geral} />}
        <Card className="min-w-0">
          <CardTitulo
            icone={Gauge}
            titulo="Ocupação por pessoa, todos os projetos"
            descricao={`${fmtData(periodo.inicio)} a ${fmtData(periodo.fim)} · edite a jornada ou o foco de alguém direto na linha`}
          />
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
              {PERIODOS.map((x) => (
                <button
                  key={x.semanas}
                  type="button"
                  onClick={() => setSemanas(x.semanas)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium",
                    semanas === x.semanas
                      ? "bg-brand-700 text-white dark:bg-brand-600"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                >
                  {x.rotulo}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["todos", "Todos", linhas.length],
                  ["alerta", "Sobrecarregados", contagem.alerta],
                  ["limite", "No limite", contagem.limite],
                  ["ok", "Com folga", contagem.ok],
                ] as const
              ).map(([f, rotulo, n]) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFiltro(f)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    filtro === f
                      ? "border-brand-500 bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                >
                  {rotulo} <span className="tabular-nums opacity-60">{n}</span>
                </button>
              ))}
            </div>
            <div className="relative ml-auto w-full max-w-[220px]">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-400" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa" className="h-8 pl-8 text-xs" />
            </div>
          </div>

          {membros.isLoading || global.carregando ? (
            <div className="m-5 h-64 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
          ) : membros.error || global.erro ? (
            <p className="m-5 text-sm text-red-700 dark:text-red-400">Erro ao carregar: {(membros.error ?? global.erro)?.message}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                    <th className="px-5 py-2.5">Pessoa</th>
                    <th className="w-24 px-2 py-2.5 text-right" title="Horas de trabalho por dia">Jornada</th>
                    <th className="w-24 px-2 py-2.5 text-right" title="Parte da jornada que vira trabalho de task">Foco</th>
                    <th className="px-3 py-2.5 text-right">Produtivas</th>
                    <th className="px-3 py-2.5 text-right">Carga / capacidade</th>
                    <th className="w-52 px-5 py-2.5">Ocupação</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(({ p, c }) => (
                    <LinhaPessoa key={p.id} p={p} c={c} regras={global.regras!} nomesProjeto={nomesProjeto} />
                  ))}
                  {visiveis.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                        Ninguém nesse filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <ComoCalculamos />
      </div>
    </div>
  );
}

function LinhaPessoa({
  p,
  c,
  regras,
  nomesProjeto,
}: {
  p: PessoaLinha;
  c: CelulaGlobal;
  regras: Regras;
  nomesProjeto: Map<string, string>;
}) {
  const salvar = useSalvarRegraPessoa();
  const propria = regras.pessoas.get(p.id);
  const h = regras.horas(p.id);
  const gravar = (campo: "jornadaDia" | "foco", v: number | null) =>
    salvar.mutate({
      pessoaId: p.id,
      jornadaDia: campo === "jornadaDia" ? v : (propria?.jornadaDia ?? null),
      foco: campo === "foco" ? v : (propria?.foco ?? null),
    });
  const totalCarga = c.porProjeto.reduce((n, x) => n + x.cargaH, 0);

  return (
    <tr className="border-b border-slate-100 align-middle last:border-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/30">
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar nome={p.nome} tamanho="sm" className="ring-0" />
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-800 dark:text-slate-100">{p.nome}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {p.projetos.size} {p.projetos.size === 1 ? "projeto" : "projetos"} · {c.itens} {c.itens === 1 ? "task" : "tasks"} no período
            </div>
            {c.porProjeto.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {c.porProjeto.map((x) => (
                  <Link
                    key={x.projetoId}
                    to="/projetos/$projetoId/capacidade"
                    params={{ projetoId: x.projetoId }}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-brand-50 hover:text-brand-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-brand-900/40"
                    title={`${Math.round((x.cargaH / (totalCarga || 1)) * 100)}% da carga desta pessoa vem deste projeto`}
                  >
                    <span className="max-w-[140px] truncate">{nomesProjeto.get(x.projetoId) ?? "Outro projeto"}</span>
                    <span className="font-semibold tabular-nums">{formatHoras(x.cargaH)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5">
        <CampoRegra rotulo={`Jornada de ${p.nome}`} unidade="h" min={1} max={24} valor={propria?.jornadaDia ?? null} herdado={regras.geral.jornadaDia} onSalvar={(v) => gravar("jornadaDia", v)} />
      </td>
      <td className="px-2 py-2.5">
        <CampoRegra rotulo={`Foco de ${p.nome}`} unidade="%" min={10} max={100} valor={propria?.foco ?? null} herdado={regras.geral.foco} onSalvar={(v) => gravar("foco", v)} />
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <div className="font-medium tabular-nums text-slate-800 dark:text-slate-100">{formatHoras(h.horasDia)}/dia</div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400" title={ORIGEM_CAPACIDADE[c.origemCapacidade].detalhe}>
          {h.origem === "gestor" ? "definido por você" : "regra geral"}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        <span className="font-semibold text-slate-800 dark:text-slate-100">{formatHoras(c.cargaH)}</span>
        <span className="text-slate-500 dark:text-slate-400"> / {formatHoras(c.capacidadeH)}</span>
        <div className={cn("text-[11px]", c.livreH < 0 ? "font-medium text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400")}>
          {c.livreH < 0 ? `${formatHoras(-c.livreH)} acima` : `${formatHoras(c.livreH)} livres`}
        </div>
      </td>
      <td className="px-5 py-2.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <StatusCargaTag status={c.status} />
          <span className="text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">{pct(c.utilizacao)}</span>
        </div>
        <MedidorCarga celula={c} compacto />
      </td>
    </tr>
  );
}

function RegrasGeraisCard({ geral }: { geral: RegrasGerais }) {
  const salvar = useSalvarRegrasGerais();
  const gravar = (parcial: Partial<RegrasGerais>) => {
    const novo = { ...geral, ...parcial };
    if (novo.atencao >= novo.sobrecarga) {
      toast.error("O alerta de atenção precisa ser menor que o de sobrecarga.");
      return;
    }
    salvar.mutate(novo);
  };
  const mudou = personalizadas(geral);

  return (
    <Card>
      <CardTitulo
        icone={Scale}
        titulo="Regras gerais"
        descricao={
          <>
            Valem para quem não tiver regra própria. Hoje: <strong className="tabular-nums text-slate-700 dark:text-slate-200">{formatHoras(Math.round(geral.jornadaDia * geral.foco * 100) / 100)} produtivas por dia</strong>{" "}
            por pessoa. A Capacity do DevOps e as horas por projeto nunca passam disso no total.
          </>
        }
        acao={
          mudou ? (
            <Button variant="ghost" size="sm" title="Voltar ao padrão de mercado" onClick={() => salvar.mutate(PADRAO_MERCADO)}>
              <RotateCcw className="size-3.5" /> Padrão
            </Button>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Padrão de mercado
            </span>
          )
        }
      />
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
        <Linha rotulo="Jornada por dia" ajuda="Horas de trabalho contratadas. CLT: 8h.">
          <CampoRegra obrigatorio rotulo="Jornada geral" unidade="h" min={1} max={24} valor={geral.jornadaDia} onSalvar={(v) => v !== null && gravar({ jornadaDia: v })} className="w-24" />
        </Linha>
        <Linha rotulo="Foco" ajuda="Parte da jornada que vira trabalho de task. Reuniões, e-mail e interrupções ficam fora. Mercado: 70–80%.">
          <CampoRegra obrigatorio rotulo="Foco geral" unidade="%" min={10} max={100} valor={geral.foco} onSalvar={(v) => v !== null && gravar({ foco: v })} className="w-24" />
        </Linha>
        <Linha rotulo={STATUS_CARGA.limite.rotulo} icone={STATUS_CARGA.limite} ajuda="Acende o alerta amarelo acima deste uso. Mercado: 80%.">
          <CampoRegra obrigatorio rotulo="Limite de atenção" unidade="%" min={10} max={300} valor={geral.atencao} onSalvar={(v) => v !== null && gravar({ atencao: v })} className="w-24" />
        </Linha>
        <Linha rotulo={STATUS_CARGA.sobrecarga.rotulo} icone={STATUS_CARGA.sobrecarga} ajuda="Sobrecarga acima deste uso. Mercado: 100%.">
          <CampoRegra obrigatorio rotulo="Limite de sobrecarga" unidade="%" min={10} max={300} valor={geral.sobrecarga} onSalvar={(v) => v !== null && gravar({ sobrecarga: v })} className="w-24" />
        </Linha>
      </div>
    </Card>
  );
}

function Linha({
  rotulo,
  ajuda,
  icone,
  children,
}: {
  rotulo: string;
  ajuda: string;
  icone?: (typeof STATUS_CARGA)[StatusCarga];
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
          {icone && <icone.icone className="size-3.5" style={{ color: icone.cor }} />}
          {rotulo}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{ajuda}</p>
      </div>
      {children}
    </div>
  );
}

function ComoCalculamos() {
  return (
    <Card className="px-5 py-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <Info className="size-4 text-brand-700 dark:text-brand-300" /> Como calculamos
      </div>
      <ul className="grid list-disc gap-x-8 gap-y-1.5 pl-4 lg:grid-cols-2">
        <li>
          <strong>Capacidade da pessoa</strong>: jornada × foco por dia útil, sem feriados e days off. Pode ser definida para
          alguém específico aqui na tabela.
        </li>
        <li>
          <strong>Em cada projeto</strong> vale, nesta ordem: as horas que você dedicou na aba <em>Capacidade</em> do projeto,
          a Capacity do Azure DevOps, ou as horas produtivas da pessoa.
        </li>
        <li>
          <strong>Ocupação geral</strong>: horas restantes das tasks abertas da pessoa em <em>todos</em> os projetos ÷ a
          capacidade dela no período. É essa que as sugestões de alocação usam.
        </li>
        <li>
          Os limites de um projeto valem só nas telas daquele projeto. Aqui valem os <strong>limites gerais</strong>.
        </li>
      </ul>
    </Card>
  );
}
