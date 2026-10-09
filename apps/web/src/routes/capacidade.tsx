// Ajustes › Regras de capacidade: tudo o que o gestor configura (raramente) num lugar só.
// Regras gerais → exceções por pessoa → alertas por projeto. O dia a dia (ocupação) fica em
// Início e Equipe. Cascata e padrão de mercado em @shared/capacidade/regras.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { FolderKanban, Info, RotateCcw, Scale, Search, UserCog } from "lucide-react";
import type { StatusCarga } from "@shared/capacidade/motor";
import { PADRAO_MERCADO, personalizadas, type RegrasGerais } from "@shared/capacidade/regras";
import { agruparMembros } from "@/lib/membros";
import { useMembros } from "@/lib/queries";
import { type Regras, useRegras, useSalvarRegraPessoa, useSalvarRegraProjeto, useSalvarRegrasGerais } from "@/lib/regras";
import { cn, formatHoras } from "@/lib/utils";
import { Avatar, MarcaProjeto } from "@/components/avatar";
import { STATUS_CARGA } from "@/components/carga";
import { CampoRegra } from "@/components/campo-regra";
import { Button } from "@/components/ui/button";
import { Card, CardTitulo } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function CapacidadePage() {
  const { regras, carregando, erro } = useRegras();
  const membrosQ = useMembros();
  const membros = useMemo(() => agruparMembros(membrosQ.data ?? []), [membrosQ.data]);
  const projetos = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of membros) for (const p of x.projetos) m.set(p.id, p.nome);
    return [...m].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [membros]);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <header className="mb-6">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Ajustes</div>
        <h1 className="text-2xl font-semibold tracking-tight dark:text-slate-100">Regras de capacidade</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Aqui você diz ao sistema quantas horas cada pessoa trabalha e a partir de quando alguém está ocupado demais.
          Configure uma vez e todas as telas passam a usar. O que você não mudar segue o{" "}
          <strong className="font-medium text-slate-700 dark:text-slate-200">padrão de mercado</strong>.
        </p>
      </header>

      {carregando || !regras ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
      ) : erro ? (
        <p className="text-sm text-red-700 dark:text-red-400">Erro ao carregar: {erro.message}</p>
      ) : (
        <div className="space-y-5">
          <RegrasGeraisCard geral={regras.geral} />
          <JornadaPorPessoa regras={regras} membros={membros} carregando={membrosQ.isLoading} />
          <AlertasPorProjeto regras={regras} projetos={projetos} />
          <ComoCalculamos />
        </div>
      )}
    </div>
  );
}

function JornadaPorPessoa({
  regras,
  membros,
  carregando,
}: {
  regras: Regras;
  membros: ReturnType<typeof agruparMembros>;
  carregando: boolean;
}) {
  const salvar = useSalvarRegraPessoa();
  const [busca, setBusca] = useState("");
  const [soExcecoes, setSoExcecoes] = useState(false);
  const termo = busca.trim().toLowerCase();
  const visiveis = membros.filter((m) => (!soExcecoes || regras.pessoas.has(m.pessoaId)) && (!termo || m.nome.toLowerCase().includes(termo)));
  const excecoes = membros.filter((m) => regras.pessoas.has(m.pessoaId)).length;

  return (
    <Card className="min-w-0">
      <CardTitulo
        icone={UserCog}
        titulo="2. Exceções por pessoa"
        descricao="Só para quem foge da regra geral (meio período, outras funções). Deixe em branco para usar a regra geral."
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <div className="relative w-full max-w-[220px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-400" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa" className="h-8 pl-8 text-xs" />
        </div>
        <button
          type="button"
          onClick={() => setSoExcecoes((v) => !v)}
          className={cn(
            "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs",
            soExcecoes
              ? "border-brand-500 bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
              : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
          )}
        >
          Só com regra própria <span className="tabular-nums opacity-60">{excecoes}</span>
        </button>
      </div>
      {carregando ? (
        <div className="m-5 h-48 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      ) : (
        <div className="max-h-[560px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900">
              <tr className="text-left text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                <th className="px-5 py-2">Pessoa</th>
                <th className="w-28 px-2 py-2 text-right">Jornada</th>
                <th className="w-28 px-2 py-2 text-right">Foco</th>
                <th className="w-28 px-5 py-2 text-right">Produtivas</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((m) => {
                const propria = regras.pessoas.get(m.pessoaId);
                const h = regras.horas(m.pessoaId);
                const gravar = (campo: "jornadaDia" | "foco", v: number | null) =>
                  salvar.mutate({
                    pessoaId: m.pessoaId,
                    jornadaDia: campo === "jornadaDia" ? v : (propria?.jornadaDia ?? null),
                    foco: campo === "foco" ? v : (propria?.foco ?? null),
                  });
                return (
                  <tr key={m.pessoaId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar nome={m.nome} tamanho="sm" className="ring-0" />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-800 dark:text-slate-100">{m.nome}</div>
                          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{m.projetos.map((p) => p.nome).join(", ")}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <CampoRegra rotulo={`Jornada de ${m.nome}`} unidade="h" min={1} max={24} valor={propria?.jornadaDia ?? null} herdado={regras.geral.jornadaDia} onSalvar={(v) => gravar("jornadaDia", v)} />
                    </td>
                    <td className="px-2 py-2">
                      <CampoRegra rotulo={`Foco de ${m.nome}`} unidade="%" min={10} max={100} valor={propria?.foco ?? null} herdado={regras.geral.foco} onSalvar={(v) => gravar("foco", v)} />
                    </td>
                    <td className="px-5 py-2 text-right whitespace-nowrap">
                      <div className="font-medium tabular-nums text-slate-800 dark:text-slate-100">{formatHoras(h.horasDia)}/dia</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{h.origem === "gestor" ? "própria" : "regra geral"}</div>
                    </td>
                  </tr>
                );
              })}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    {soExcecoes ? "Ninguém com regra própria: todos seguem a regra geral." : "Ninguém encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AlertasPorProjeto({ regras, projetos }: { regras: Regras; projetos: { id: string; nome: string }[] }) {
  const salvar = useSalvarRegraProjeto();
  return (
    <Card className="min-w-0">
      <CardTitulo
        icone={FolderKanban}
        titulo="3. Alertas por projeto"
        descricao="Opcional: um projeto mais crítico pode avisar mais cedo. Vale só nas telas daquele projeto."
      />
      <ul className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {projetos.map((p) => {
          const propria = regras.projetos.get(p.id);
          const gravar = (campo: "atencao" | "sobrecarga", v: number | null) => {
            const novo = {
              projetoId: p.id,
              atencao: campo === "atencao" ? v : (propria?.atencao ?? null),
              sobrecarga: campo === "sobrecarga" ? v : (propria?.sobrecarga ?? null),
            };
            if ((novo.atencao ?? regras.geral.atencao) >= (novo.sobrecarga ?? regras.geral.sobrecarga)) {
              toast.error("O alerta de atenção precisa ser menor que o de sobrecarga.");
              return;
            }
            salvar.mutate(novo);
          };
          return (
            <li key={p.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <Link
                to="/projetos/$projetoId/equipe"
                params={{ projetoId: p.id }}
                className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800 hover:text-brand-700 dark:text-slate-100 dark:hover:text-brand-300"
              >
                <MarcaProjeto nome={p.nome} className="size-6 rounded text-[11px]" /> {p.nome}
              </Link>
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                  <STATUS_CARGA.limite.icone className="size-3.5" style={{ color: STATUS_CARGA.limite.cor }} /> Atenção a partir de
                  </span>
                  <CampoRegra rotulo={`Atenção em ${p.nome}`} unidade="%" min={10} max={300} valor={propria?.atencao ?? null} herdado={regras.geral.atencao} onSalvar={(v) => gravar("atencao", v)} className="w-24" />
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <STATUS_CARGA.sobrecarga.icone className="size-3.5" style={{ color: STATUS_CARGA.sobrecarga.cor }} /> Sobrecarga a partir de
                  </span>
                  <CampoRegra rotulo={`Sobrecarga em ${p.nome}`} unidade="%" min={10} max={300} valor={propria?.sobrecarga ?? null} herdado={regras.geral.sobrecarga} onSalvar={(v) => gravar("sobrecarga", v)} className="w-24" />
                </span>
              </div>
            </li>
          );
        })}
        {projetos.length === 0 && <li className="col-span-full py-8 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum projeto com equipe.</li>}
      </ul>
    </Card>
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
        titulo="1. Regra geral (vale para todos)"
        descricao={
          <>
            Com estes valores, cada pessoa tem{" "}
            <strong className="tabular-nums text-slate-700 dark:text-slate-200">{formatHoras(Math.round(geral.jornadaDia * geral.foco * 100) / 100)} por dia para tarefas</strong>.
            Ninguém recebe mais do que isso no total, somando todos os projetos.
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
      <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
        <Linha rotulo="Jornada por dia" ajuda="Quantas horas a pessoa trabalha por dia. Contrato CLT comum: 8h.">
          <CampoRegra obrigatorio rotulo="Jornada geral" unidade="h" min={1} max={24} valor={geral.jornadaDia} onSalvar={(v) => v !== null && gravar({ jornadaDia: v })} className="w-24" />
        </Linha>
        <Linha rotulo="Foco" ajuda="Quanto da jornada sobra para as tarefas, tirando reuniões, e-mails e interrupções. O comum é 70% a 80%.">
          <CampoRegra obrigatorio rotulo="Foco geral" unidade="%" min={10} max={100} valor={geral.foco} onSalvar={(v) => v !== null && gravar({ foco: v })} className="w-24" />
        </Linha>
        <Linha rotulo={STATUS_CARGA.limite.rotulo} icone={STATUS_CARGA.limite} ajuda="Quando a pessoa passa deste nível de ocupação, o sistema mostra um aviso amarelo. O comum é 80%.">
          <CampoRegra obrigatorio rotulo="Limite de atenção" unidade="%" min={10} max={300} valor={geral.atencao} onSalvar={(v) => v !== null && gravar({ atencao: v })} className="w-24" />
        </Linha>
        <Linha rotulo={STATUS_CARGA.sobrecarga.rotulo} icone={STATUS_CARGA.sobrecarga} ajuda="A partir daqui a pessoa tem mais trabalho do que horas (aviso vermelho). O comum é 100%.">
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
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
          {icone && <icone.icone className="size-3.5" style={{ color: icone.cor }} />}
          {rotulo}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{ajuda}</p>
      </div>
      <div className="shrink-0">{children}</div>
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
          <strong>Capacidade da pessoa</strong>: jornada × foco em cada dia útil, sem contar feriados, folgas e ausências. Pode ser ajustada para
          alguém específico em “Exceções por pessoa”.
        </li>
        <li>
          <strong>Em cada projeto</strong> vale, nesta ordem: as horas que você dedicou na aba <em>Equipe</em> do projeto,
          a Capacity do Azure DevOps, ou as horas produtivas da pessoa.
        </li>
        <li>
          <strong>Ocupação geral</strong>: horas restantes das tasks abertas da pessoa em <em>todos</em> os projetos ÷ a
          capacidade dela no período. É essa que as sugestões de alocação usam.
        </li>
        <li>
          Os alertas de um projeto valem só nas telas dele. Início e Equipe usam os <strong>limites gerais</strong>.
        </li>
      </ul>
    </Card>
  );
}
