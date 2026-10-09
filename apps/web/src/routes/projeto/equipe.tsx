import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Clock, Gauge, Settings2, TriangleAlert, UserRoundPlus, Users, X } from "lucide-react";
import type { Celula, StatusCarga } from "@shared/capacidade/motor";
import { resumirSquad } from "@shared/capacidade/squads";
import { type PessoaProjeto, useCapacidadeProjeto } from "@/lib/capacidade-projeto";
import { useCargaGlobal } from "@/lib/carga-global";
import { agruparMembros } from "@/lib/membros";
import { useCapacidades, useFuncaoTags, useMembros, useProjeto, useSkillsCatalogo } from "@/lib/queries";
import { type Regras, useSalvarAlocacao, useSalvarRegraProjeto } from "@/lib/regras";
import { cn, formatData, formatHoras } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { MedidorCarga, ORIGEM_CAPACIDADE, pct, STATUS_CARGA, StatusCargaTag } from "@/components/carga";
import { CampoRegra } from "@/components/campo-regra";
import { Card, Stat } from "@/components/ui/card";
import { PainelMembro } from "@/routes/membros";
import { EquipeSugeridaPainel } from "@/components/equipe-sugerida";

const GRAVIDADE: Record<StatusCarga, number> = { ok: 0, limite: 1, sobrecarga: 2, "sem-capacidade": 3 };

export function EquipeProjetoPage() {
  const { projetoId } = useParams({ strict: false }) as { projetoId: string };
  const cap = useCapacidadeProjeto(projetoId);
  const projeto = useProjeto(projetoId);
  const capacidadesDevops = useCapacidades(projetoId);
  const membrosQ = useMembros();
  const funcaoTags = useFuncaoTags();
  const skills = useSkillsCatalogo();
  const [sprintSel, setSprintSel] = useState<string>();
  const [aberto, setAberto] = useState<string | null>(null);
  const [reforco, setReforco] = useState(false);
  const sprint = cap.sprints.find((s) => s.id === sprintSel) ?? cap.sprintAtual;

  const global = useCargaGlobal(useMemo(() => cap.pessoas.map((p) => p.id), [cap.pessoas]));

  const devops = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of capacidadesDevops.data ?? []) {
      if (c.sprint_id !== sprint?.id) continue;
      m.set(c.pessoa_id, (m.get(c.pessoa_id) ?? 0) + Number(c.capacidade_dia));
    }
    return m;
  }, [capacidadesDevops.data, sprint?.id]);

  const grupos = useMemo(() => {
    const m = new Map<string, PessoaProjeto[]>();
    for (const p of cap.pessoas) {
      const chaves = p.foraDoTime ? ["Com tasks, fora dos times"] : p.times.length ? p.times : ["Sem time"];
      for (const k of chaves) m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m];
  }, [cap.pessoas]);

  const todosMembros = useMemo(() => agruparMembros(membrosQ.data ?? []), [membrosQ.data]);
  const nomesProjeto = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of membrosQ.data ?? []) if (r.projeto_id) m.set(r.projeto_id, r.projeto_nome ?? "Projeto");
    return m;
  }, [membrosQ.data]);

  if (cap.carregando || !cap.regras) return <div className="h-96 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />;
  if (cap.erro) return <p className="text-sm text-red-600">Erro ao carregar: {cap.erro.message}</p>;

  const regras = cap.regras;
  const periodoSprint = sprint ? { id: sprint.id, inicio: sprint.inicio, fim: sprint.fim } : null;
  const cel = (id: string) => (sprint ? cap.celula(sprint.id, id) : undefined);
  const gcel = (id: string) => (periodoSprint && global.celula ? global.celula(periodoSprint, id) : undefined);

  const resumo = resumirSquad(cap.pessoas.map((p) => cel(p.id)));
  const escondidos = cap.pessoas.filter((p) => {
    const c = cel(p.id);
    const g = gcel(p.id);
    return c && g && g.status !== "ok" && GRAVIDADE[g.status] > GRAVIDADE[c.status];
  });

  const pessoaAberta = cap.pessoas.find((p) => p.id === aberto);
  const membroAberto = pessoaAberta
    ? (todosMembros.find((m) => m.pessoaId === pessoaAberta.id) ?? {
        pessoaId: pessoaAberta.id,
        nome: pessoaAberta.nome,
        uniqueName: pessoaAberta.uniqueName,
        projetos: [{ id: projetoId, nome: projeto.data?.nome ?? "Projeto", times: pessoaAberta.times }],
        skills: pessoaAberta.skills,
        skillsInfo: pessoaAberta.skillsInfo,
        tags: pessoaAberta.tags,
      })
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Equipe do projeto</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ocupação aqui e somando todos os projetos. Ajuste quantas horas por dia cada pessoa dedica a este projeto.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cap.pessoas.length > 0 && (
            <button
              type="button"
              onClick={() => setReforco((v) => !v)}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm shadow-xs",
                reforco
                  ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
              )}
            >
              <UserRoundPlus className="size-4" /> Sugerir reforço
            </button>
          )}
          <LimitesProjeto projetoId={projetoId} regras={regras} />
          {cap.sprints.length > 0 && (
            <select
              value={sprint?.id ?? ""}
              onChange={(e) => setSprintSel(e.target.value)}
              aria-label="Sprint"
              className="h-9 cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {cap.sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                  {s.status === "atual" ? " (atual)" : ""} · {formatData(s.inicio)}–{formatData(s.fim)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icone={Users} rotulo="Pessoas" valor={cap.pessoas.length} detalhe={`${grupos.length} ${grupos.length === 1 ? "squad" : "squads"}`} />
        <Stat icone={Clock} ajuda="capacidade" rotulo="Capacidade na sprint" valor={formatHoras(resumo.capacidadeH)} detalhe={`${formatHoras(resumo.livreH)} livres`} />
        <Stat icone={Gauge} ajuda="ocupacao" rotulo="Uso do time" valor={pct(resumo.utilizacao)} detalhe={`${resumo.porStatus.sobrecarga + resumo.porStatus["sem-capacidade"]} acima`} alerta={resumo.status !== "ok"} />
        <Stat icone={TriangleAlert} rotulo="Mais ocupados fora daqui" valor={escondidos.length} alerta={escondidos.length > 0} />
      </div>

      {reforco && cap.pessoas.length > 0 && (
        <EquipeSugeridaPainel projetoId={projetoId} projetoNome={projeto.data?.nome ?? "o projeto"} motivo="Precisa de reforço?" />
      )}

      {escondidos.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>{escondidos.map((p) => p.nome).join(", ")}</strong> {escondidos.length === 1 ? "parece" : "parecem"} bem neste projeto, mas{" "}
            {escondidos.length === 1 ? "está" : "estão"} pior somando os outros. Pense duas vezes antes de passar mais trabalho.
          </span>
        </div>
      )}

      {cap.pessoas.length === 0 ? (
        <EquipeSugeridaPainel projetoId={projetoId} projetoNome={projeto.data?.nome ?? "o projeto"} />
      ) : !sprint ? (
        <Card className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Este projeto não tem sprints com datas.</Card>
      ) : (
        grupos.map(([grupo, pessoas]) => {
          const r = resumirSquad(pessoas.map((p) => cel(p.id)));
          return (
            <Card key={grupo} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{grupo}</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {pessoas.length} {pessoas.length === 1 ? "pessoa" : "pessoas"} · {formatHoras(r.cargaH)} de {formatHoras(r.capacidadeH)}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <StatusCargaTag status={r.status} />
                  <span className="text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">{pct(r.utilizacao)}</span>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                      <th className="px-5 py-2">Pessoa</th>
                      <th className="w-32 px-2 py-2 text-right">Horas/dia aqui</th>
                      <th className="w-[28%] px-4 py-2">Neste projeto</th>
                      <th className="w-[28%] px-4 py-2">Somando todos os projetos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pessoas.map((p) => (
                      <LinhaPessoa
                        key={p.id}
                        projetoId={projetoId}
                        p={p}
                        c={cel(p.id)}
                        g={gcel(p.id)}
                        regras={regras}
                        devopsDia={devops.get(p.id)}
                        onAbrir={() => setAberto(p.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}

      {membroAberto && (
        <PainelMembro
          membro={membroAberto}
          funcaoTags={funcaoTags.data ?? []}
          skillsCatalogo={skills.data ?? []}
          nomeProjeto={(id) => nomesProjeto.get(id) ?? "Outro projeto"}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}

function LinhaPessoa({
  projetoId,
  p,
  c,
  g,
  regras,
  devopsDia,
  onAbrir,
}: {
  projetoId: string;
  p: PessoaProjeto;
  c?: Celula;
  g?: Celula;
  regras: Regras;
  devopsDia?: number;
  onAbrir: () => void;
}) {
  const salvar = useSalvarAlocacao();
  const alocacao = regras.alocacoes.find((a) => a.projetoId === projetoId && a.pessoaId === p.id);
  const produtivas = regras.horas(p.id).horasDia;
  const pior = !!c && !!g && g.status !== "ok" && GRAVIDADE[g.status] > GRAVIDADE[c.status];
  const etiquetas = [...p.tags.map((t) => t.nome), ...p.skills].slice(0, 4);

  return (
    <tr className="border-t border-slate-100 align-middle dark:border-slate-800">
      <td className="px-5 py-3">
        <button type="button" onClick={onAbrir} className="group flex w-full min-w-0 cursor-pointer items-center gap-2.5 text-left">
          <Avatar nome={p.nome} tamanho="sm" className="ring-0" />
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-800 group-hover:text-brand-700 dark:text-slate-100 dark:group-hover:text-brand-300">{p.nome}</div>
            <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{etiquetas.join(" · ") || "Sem skills nem tags"}</div>
          </div>
        </button>
      </td>
      <td className="px-2 py-3">
        <CampoRegra
          rotulo={`Horas por dia de ${p.nome} neste projeto`}
          unidade="h"
          min={0}
          max={24}
          valor={alocacao?.horasDia ?? null}
          herdado={devopsDia ?? produtivas}
          onSalvar={(v) => {
            if (v !== null && v > produtivas) toast.info(`${p.nome} tem ${formatHoras(produtivas)} produtivas por dia; no geral conta no máximo isso.`);
            salvar.mutate({ projetoId, pessoaId: p.id, horasDia: v });
          }}
        />
        <div className="mt-1 text-right text-[10px] text-slate-400 dark:text-slate-500" title={c ? ORIGEM_CAPACIDADE[c.origemCapacidade].detalhe : undefined}>
          {alocacao ? "definido por você" : devopsDia !== undefined ? "do DevOps" : "regra geral"}
        </div>
      </td>
      <td className="px-4 py-3">{c ? <Ocupacao c={c} /> : <span className="text-xs text-slate-400">—</span>}</td>
      <td className={cn("px-4 py-3", pior && "bg-amber-50/70 dark:bg-amber-950/20")}>
        {g ? <Ocupacao c={g} /> : <span className="text-xs text-slate-400">—</span>}
        {pior && (
          <Link
            to="/projetos/$projetoId/kanban"
            params={{ projetoId }}
            search={{ resp: p.id }}
            className="mt-1 inline-block text-[11px] font-medium text-amber-800 hover:underline dark:text-amber-300"
          >
            Mais ocupado fora deste projeto
          </Link>
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
        <span className="text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">{c.capacidadeH === 0 ? "ausente" : pct(c.utilizacao)}</span>
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
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const salvar = useSalvarRegraProjeto();
  const propria = regras.projetos.get(projetoId);
  const efetivo = regras.limites(projetoId);
  const gravar = (campo: "atencao" | "sobrecarga", v: number | null) => {
    const novo = {
      projetoId,
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
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={cn(
          "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border bg-white px-3 text-sm shadow-xs dark:bg-slate-900",
          propria ? "border-brand-400 text-brand-800 dark:border-brand-600 dark:text-brand-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300",
        )}
        title="Quando acender os alertas neste projeto"
      >
        <Settings2 className="size-4" /> Alertas: {pct(efetivo.atencao)} · {pct(efetivo.sobrecarga)}
      </button>
      {aberto && (
        <div className="anim-fade absolute right-0 z-30 mt-1.5 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Alertas deste projeto</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Vazio = segue as regras gerais. Valem só nas telas deste projeto.</p>
            </div>
            <button type="button" onClick={() => setAberto(false)} className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar">
              <X className="size-4" />
            </button>
          </div>
          {(["atencao", "sobrecarga"] as const).map((campo) => {
            const s = STATUS_CARGA[campo === "atencao" ? "limite" : "sobrecarga"];
            return (
              <div key={campo} className="mb-2 flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-sm text-slate-800 dark:text-slate-100">
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
                />
              </div>
            );
          })}
          <Link to="/capacidade" className="mt-1 inline-block text-[11px] font-medium text-brand-700 hover:underline dark:text-brand-300">
            Regras gerais e jornada das pessoas →
          </Link>
        </div>
      )}
    </div>
  );
}
