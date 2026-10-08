// Squad: quem está no projeto (times do DevOps + quem tem task), com skills/tags e a carga
// na sprint escolhida (motor de capacidade). Clique abre o perfil para editar skills/tags.

import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Clock, Gauge, UserRoundX, Users } from "lucide-react";
import { type PessoaProjeto, useCapacidadeProjeto } from "@/lib/capacidade-projeto";
import { useFuncaoTags, useProjeto, useSkillsCatalogo } from "@/lib/queries";
import { cn, formatData, formatHoras, hashTexto } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { MedidorCarga, pct } from "@/components/carga";
import { Badge } from "@/components/ui/badge";
import { Card, Stat } from "@/components/ui/card";
import { PainelMembro } from "@/routes/membros";

const TONS_TAG = ["teal", "blue", "amber", "green", "red", "violet"] as const;
const tom = (t: string) => TONS_TAG[hashTexto(t) % TONS_TAG.length]!;

export function SquadPage() {
  const { projetoId } = useParams({ strict: false }) as { projetoId: string };
  const cap = useCapacidadeProjeto(projetoId);
  const projeto = useProjeto(projetoId);
  const funcaoTags = useFuncaoTags();
  const skills = useSkillsCatalogo();
  const [sprintId, setSprintId] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const sprint = cap.sprints.find((s) => s.id === sprintId) ?? cap.sprintAtual;

  const grupos = useMemo(() => {
    const m = new Map<string, PessoaProjeto[]>();
    for (const p of cap.pessoas) {
      const chaves = p.foraDoTime ? ["Com tasks, fora dos times"] : p.times.length ? p.times : ["Sem time"];
      for (const k of chaves) m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m];
  }, [cap.pessoas]);

  const totais = useMemo(() => {
    if (!sprint) return null;
    let capacidade = 0;
    let carga = 0;
    let sobre = 0;
    for (const p of cap.pessoas) {
      const c = cap.celula(sprint.id, p.id);
      if (!c) continue;
      capacidade += c.capacidadeH;
      carga += c.cargaH;
      if (c.status === "sobrecarga" || c.status === "sem-capacidade") sobre++;
    }
    return { capacidade, carga, sobre, utilizacao: capacidade > 0 ? carga / capacidade : null };
  }, [cap, sprint]);

  const selecionado = cap.pessoas.find((p) => p.id === aberto);

  if (cap.carregando) return <div className="h-96 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />;
  if (cap.erro) return <p className="text-sm text-red-600">Erro ao carregar: {cap.erro.message}</p>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Equipe do projeto</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Times do Azure DevOps e quem tem tasks aqui. Clique numa pessoa para editar skills e tags.
          </p>
        </div>
        {cap.sprints.length > 0 && (
          <select
            value={sprint?.id ?? ""}
            onChange={(e) => setSprintId(e.target.value)}
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

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icone={Users} rotulo="Pessoas" valor={cap.pessoas.length} detalhe={`${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}`} />
        <Stat icone={Clock} rotulo="Capacidade na sprint" valor={totais ? formatHoras(totais.capacidade) : "—"} />
        <Stat icone={Gauge} rotulo="Carga alocada" valor={totais ? formatHoras(totais.carga) : "—"} detalhe={totais ? pct(totais.utilizacao) : undefined} />
        <Stat icone={UserRoundX} rotulo="Acima da capacidade" valor={totais?.sobre ?? 0} alerta={(totais?.sobre ?? 0) > 0} />
      </div>

      {cap.pessoas.length === 0 && (
        <Card className="grid place-items-center px-6 py-16 text-center">
          <Users className="mb-3 size-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Ninguém neste projeto ainda</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Adicione pessoas ao time do projeto no Azure DevOps.</p>
        </Card>
      )}

      <div className="space-y-6">
        {grupos.map(([grupo, pessoas]) => (
          <section key={grupo}>
            <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              {grupo}
              <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {pessoas.length}
              </span>
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {pessoas.map((p) => {
                const c = sprint ? cap.celula(sprint.id, p.id) : undefined;
                return (
                  <button
                    key={p.id}
                    onClick={() => setAberto(p.id)}
                    className="group flex cursor-pointer flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-500/60"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar nome={p.nome} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-900 dark:text-slate-100">{p.nome}</div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{p.uniqueName ?? "Fora dos times do DevOps"}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex min-h-5 flex-wrap gap-1">
                      {p.tags.map((t) => (
                        <Badge key={t.id} tone={tom(t.nome)}>
                          {t.nome}
                        </Badge>
                      ))}
                      {p.skills.slice(0, 4).map((s) => (
                        <Badge key={s} tone="slate" className="font-normal">
                          {s}
                        </Badge>
                      ))}
                      {p.skills.length > 4 && <span className="text-[11px] text-slate-400">+{p.skills.length - 4}</span>}
                      {p.tags.length === 0 && p.skills.length === 0 && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Sem skills nem tags</span>
                      )}
                    </div>
                    {c && (
                      <div className={cn("mt-3 border-t border-slate-100 pt-3 dark:border-slate-800")}>
                        <MedidorCarga celula={c} />
                        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                          {c.itens} {c.itens === 1 ? "task" : "tasks"} · {c.diasUteis} dias úteis × {formatHoras(c.capacidadeDia)}/dia
                          {c.capacidadePadrao && " (padrão: sem Capacity no DevOps)"}
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {selecionado && (
        <PainelMembro
          membro={{
            pessoaId: selecionado.id,
            nome: selecionado.nome,
            uniqueName: selecionado.uniqueName,
            projetos: [{ id: projetoId, nome: projeto.data?.nome ?? "Projeto", times: selecionado.times }],
            skills: selecionado.skills,
            skillsInfo: selecionado.skillsInfo,
            tags: selecionado.tags,
          }}
          funcaoTags={funcaoTags.data ?? []}
          skillsCatalogo={skills.data ?? []}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}
