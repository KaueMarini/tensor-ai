// Capacidade do projeto: limites próprios do projeto e quantas horas/dia cada pessoa dedica a
// ele (sobrepõe a Capacity do DevOps). Lado a lado, a ocupação NESTE projeto e a ocupação
// GERAL (todos os projetos): alguém pode estar folgado aqui e sobrecarregado no total.

import { useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowUpRight, Layers, SlidersHorizontal, TriangleAlert } from "lucide-react";
import type { Celula, StatusCarga } from "@shared/capacidade/motor";
import { useCapacidadeProjeto } from "@/lib/capacidade-projeto";
import { useCargaGlobal } from "@/lib/carga-global";
import { useCapacidades } from "@/lib/queries";
import { type Regras, useSalvarAlocacao, useSalvarRegraProjeto } from "@/lib/regras";
import { cn, formatHoras } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { MedidorCarga, ORIGEM_CAPACIDADE, pct, STATUS_CARGA, StatusCargaTag } from "@/components/carga";
import { CampoRegra } from "@/components/campo-regra";
import { Card, CardTitulo } from "@/components/ui/card";

const GRAVIDADE: Record<StatusCarga, number> = { ok: 0, limite: 1, sobrecarga: 2, "sem-capacidade": 3 };

export function CapacidadeProjetoPage() {
  const { projetoId } = useParams({ strict: false }) as { projetoId: string };
  const cap = useCapacidadeProjeto(projetoId);
  const capacidadesDevops = useCapacidades(projetoId);
  const [sprintSel, setSprintSel] = useState<string>();
  const sprint = cap.sprints.find((s) => s.id === sprintSel) ?? cap.sprintAtual;

  const membros = useMemo(() => cap.pessoas.filter((p) => !p.foraDoTime), [cap.pessoas]);
  const global = useCargaGlobal(useMemo(() => membros.map((p) => p.id), [membros]));

  // Capacity do DevOps da sprint (soma dos times), para mostrar o que vale sem a alocação do gestor
  const devops = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of capacidadesDevops.data ?? []) {
      if (c.sprint_id !== sprint?.id) continue;
      m.set(c.pessoa_id, (m.get(c.pessoa_id) ?? 0) + Number(c.capacidade_dia));
    }
    return m;
  }, [capacidadesDevops.data, sprint?.id]);

  if (cap.carregando || !cap.regras) return <div className="m-6 h-72 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />;
  if (cap.erro) return <p className="m-6 text-sm text-red-700 dark:text-red-400">Erro ao carregar: {cap.erro.message}</p>;

  const regras = cap.regras;
  const linhas = membros.map((p) => ({
    p,
    c: sprint ? cap.celula(sprint.id, p.id) : undefined,
    g: sprint && global.celula ? global.celula({ id: sprint.id, inicio: sprint.inicio, fim: sprint.fim }, p.id) : undefined,
  }));
  const escondidos = linhas.filter((l) => l.c && l.g && GRAVIDADE[l.g.status] > GRAVIDADE[l.c.status]).length;

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-w-0">
        <CardTitulo
          icone={Layers}
          titulo="Pessoas: neste projeto × no geral"
          descricao="Horas/dia que cada pessoa dedica a este projeto. Vazio = vale a Capacity do Azure DevOps (ou as horas produtivas da pessoa)."
          acao={
            cap.sprints.length > 0 && (
              <select
                value={sprint?.id ?? ""}
                onChange={(e) => setSprintSel(e.target.value)}
                className="h-8 cursor-pointer rounded-md border border-slate-200 bg-white px-2 text-xs shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {cap.sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                    {s.status === "atual" ? " (atual)" : ""}
                  </option>
                ))}
              </select>
            )
          }
        />
        {escondidos > 0 && (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {escondidos === 1 ? "1 pessoa parece bem" : `${escondidos} pessoas parecem bem`} neste projeto, mas{" "}
              {escondidos === 1 ? "está" : "estão"} pior somando os outros projetos.
            </span>
          </div>
        )}
        {!sprint ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Este projeto não tem sprints com datas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-2.5">Pessoa</th>
                  <th className="w-32 px-2 py-2.5 text-right">Horas/dia aqui</th>
                  <th className="w-[30%] px-4 py-2.5">Neste projeto</th>
                  <th className="w-[30%] px-4 py-2.5">Geral · todos os projetos</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ p, c, g }) => (
                  <LinhaPessoa
                    key={p.id}
                    projetoId={projetoId}
                    pessoaId={p.id}
                    nome={p.nome}
                    times={p.times}
                    c={c}
                    g={g}
                    regras={regras}
                    devopsDia={devops.get(p.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="space-y-5 xl:sticky xl:top-6">
        <LimitesProjeto projetoId={projetoId} regras={regras} />
        <Card className="px-5 py-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          A jornada, o foco e os limites gerais de cada pessoa ficam no painel{" "}
          <Link to="/capacidade" className="inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline dark:text-brand-300">
            Capacidade <ArrowUpRight className="size-3" />
          </Link>
          . A soma das horas por projeto nunca passa das horas produtivas da pessoa.
        </Card>
      </div>
    </div>
  );
}

function LinhaPessoa({
  projetoId,
  pessoaId,
  nome,
  times,
  c,
  g,
  regras,
  devopsDia,
}: {
  projetoId: string;
  pessoaId: string;
  nome: string;
  times: string[];
  c?: Celula;
  g?: Celula;
  regras: Regras;
  devopsDia?: number;
}) {
  const salvar = useSalvarAlocacao();
  const alocacao = regras.alocacoes.find((a) => a.projetoId === projetoId && a.pessoaId === pessoaId);
  const produtivas = regras.horas(pessoaId).horasDia;
  const pior = c && g && GRAVIDADE[g.status] > GRAVIDADE[c.status];

  return (
    <tr className="border-b border-slate-100 align-middle last:border-0 dark:border-slate-800">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar nome={nome} tamanho="sm" className="ring-0" />
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-800 dark:text-slate-100">{nome}</div>
            <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{times.join(", ") || "Sem time"}</div>
          </div>
        </div>
      </td>
      <td className="px-2 py-3">
        <CampoRegra
          rotulo={`Horas por dia de ${nome} neste projeto`}
          unidade="h"
          min={0}
          max={Math.max(produtivas, 24)}
          valor={alocacao?.horasDia ?? null}
          herdado={devopsDia ?? produtivas}
          onSalvar={(v) => {
            if (v !== null && v > produtivas) toast.info(`${nome} tem ${formatHoras(produtivas)} produtivas por dia; no geral conta no máximo isso.`);
            salvar.mutate({ projetoId, pessoaId, horasDia: v });
          }}
        />
        <div className="mt-1 text-right text-[10px] text-slate-400 dark:text-slate-500">
          {c ? ORIGEM_CAPACIDADE[c.origemCapacidade].rotulo : "—"}
          {!alocacao && devopsDia === undefined && " · sem Capacity no DevOps"}
        </div>
      </td>
      <td className="px-4 py-3">{c ? <Ocupacao c={c} /> : <span className="text-xs text-slate-400">—</span>}</td>
      <td className={cn("px-4 py-3", pior && "bg-amber-50/70 dark:bg-amber-950/20")}>
        {g ? (
          <>
            <Ocupacao c={g} />
            {pior && (
              <p className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">Mais ocupado fora deste projeto</p>
            )}
          </>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}

function Ocupacao({ c }: { c: Celula }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <StatusCargaTag status={c.status} />
        <span className="text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">{pct(c.utilizacao)}</span>
      </div>
      <MedidorCarga celula={c} compacto />
      <div className="mt-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        {formatHoras(c.cargaH)} de {formatHoras(c.capacidadeH)}
        {c.livreH < 0 ? ` · ${formatHoras(-c.livreH)} acima` : ` · ${formatHoras(c.livreH)} livres`}
      </div>
    </div>
  );
}

function LimitesProjeto({ projetoId, regras }: { projetoId: string; regras: Regras }) {
  const salvar = useSalvarRegraProjeto();
  const propria = regras.projetos.get(projetoId);
  const gravar = (campo: "atencao" | "sobrecarga", v: number | null) => {
    const novo = {
      projetoId,
      atencao: campo === "atencao" ? v : (propria?.atencao ?? null),
      sobrecarga: campo === "sobrecarga" ? v : (propria?.sobrecarga ?? null),
    };
    const efetivo = { a: novo.atencao ?? regras.geral.atencao, s: novo.sobrecarga ?? regras.geral.sobrecarga };
    if (efetivo.a >= efetivo.s) {
      toast.error("O alerta de atenção precisa ser menor que o de sobrecarga.");
      return;
    }
    salvar.mutate(novo);
  };

  return (
    <Card>
      <CardTitulo icone={SlidersHorizontal} titulo="Limites deste projeto" descricao="Vazio = segue os limites gerais. Valem só nas telas deste projeto." />
      <div className="space-y-3 px-5 py-4">
        {(["atencao", "sobrecarga"] as const).map((campo) => {
          const s = STATUS_CARGA[campo === "atencao" ? "limite" : "sobrecarga"];
          return (
            <div key={campo} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                <s.icone className="size-3.5" style={{ color: s.cor }} /> {s.rotulo} acima de
              </span>
              <CampoRegra
                rotulo={campo === "atencao" ? "Limite de atenção do projeto" : "Limite de sobrecarga do projeto"}
                unidade="%"
                min={10}
                max={300}
                valor={propria?.[campo] ?? null}
                herdado={regras.geral[campo]}
                onSalvar={(v) => gravar(campo, v)}
                className="w-24"
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
