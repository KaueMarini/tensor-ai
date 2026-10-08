// Painel "Equipe sugerida": para projeto novo sem pessoas (ou para reforço), mostra o que o
// projeto pede (tags + descrição), o squad de um projeto parecido que pode assumir e uma
// montagem com pessoas avulsas que têm as skills e tempo livre. Só sugere: quem decide e
// coloca as pessoas no time do Azure DevOps é o gestor.

import { useState } from "react";
import { toast } from "sonner";
import { CircleAlert, Copy, ExternalLink, Info, Puzzle, Sparkles, UsersRound, UserRoundPlus } from "lucide-react";
import type { SquadSugerido, Termo } from "@shared/capacidade/equipe-sugerida";
import { HORIZONTE_EQUIPE, useEquipeSugerida } from "@/lib/equipe-sugerida";
import type { Membro } from "@/lib/membros";
import { useFuncaoTags, useSkillsCatalogo } from "@/lib/queries";
import { cn, formatHoras } from "@/lib/utils";
import { Avatar, MarcaProjeto } from "@/components/avatar";
import { STATUS_CARGA, StatusCargaTag } from "@/components/carga";
import { Card } from "@/components/ui/card";
import { PainelMembro } from "@/routes/membros";

const AZDO_ORG_URL = (import.meta.env.VITE_AZDO_ORG_URL as string | undefined)?.replace(/\/$/, "");
const pct = (n: number) => `${Math.round(n * 100)}%`;

const ORIGEM: Record<Termo["origem"], string> = {
  tag: "Tag do projeto no Azure DevOps",
  descricao: "Citado na descrição do projeto",
  sinonimo: "Deduzido da descrição (ex.: React → front-end)",
};

export function EquipeSugeridaPainel({ projetoId, projetoNome, motivo }: { projetoId: string; projetoNome: string; motivo?: string }) {
  const { carregando, erro, resultado, membrosPorId, nomeProjeto } = useEquipeSugerida(projetoId);
  const funcaoTags = useFuncaoTags();
  const skills = useSkillsCatalogo();
  const [aberto, setAberto] = useState<string | null>(null);
  const membroAberto = aberto ? membrosPorId.get(aberto) : undefined;
  const nome = (id: string) => membrosPorId.get(id)?.nome ?? "Pessoa";

  return (
    <Card className="overflow-hidden border-brand-300/70 dark:border-brand-700/60">
      <div className="relative border-b border-brand-200/60 bg-gradient-to-r from-brand-50 to-white px-5 py-4 dark:border-brand-800/60 dark:from-brand-900/40 dark:to-slate-900">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-700 text-white dark:bg-brand-600">
            <UserRoundPlus className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Equipe sugerida para {projetoNome}</h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              {motivo ?? "Este projeto ainda não tem equipe."} Com base na descrição e nas tags, estas são as pessoas com as skills certas e tempo livre{" "}
              <strong className="font-medium">nas próximas 4 semanas</strong>, somando todos os projetos.
            </p>
          </div>
        </div>
        {resultado && resultado.termos.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-slate-500 dark:text-slate-400">O projeto pede:</span>
            {resultado.termos.map((t) => (
              <span
                key={t.chave}
                title={ORIGEM[t.origem]}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs",
                  t.origem === "tag"
                    ? "bg-brand-700 font-medium text-white dark:bg-brand-600"
                    : "border border-brand-300 text-brand-800 dark:border-brand-700 dark:text-brand-200",
                )}
              >
                {t.termo}
              </span>
            ))}
          </div>
        )}
      </div>

      {carregando || !resultado ? (
        erro ? (
          <p className="px-5 py-6 text-sm text-red-700 dark:text-red-400">Erro ao carregar: {erro.message}</p>
        ) : (
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <div className="h-56 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-56 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
          </div>
        )
      ) : resultado.termos.length === 0 ? (
        <div className="flex items-start gap-3 px-5 py-6 text-sm text-slate-600 dark:text-slate-300">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-700 dark:text-brand-300" />
          <p>
            O projeto ainda não tem descrição nem tags para comparar. No Azure DevOps, escreva uma descrição do projeto e termine com uma linha como{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">Tags: front-end, integracao-fiscal, mobile</code>. A sugestão aparece
            aqui na próxima sincronização.
          </p>
        </div>
      ) : (
        <div className="grid gap-px bg-slate-100 lg:grid-cols-2 dark:bg-slate-800">
          {/* Squad pronto */}
          <section className="bg-white p-5 dark:bg-slate-900">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <UsersRound className="size-4 text-brand-700 dark:text-brand-300" /> Um squad que já atua em algo parecido
            </h3>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Time inteiro, já entrosado. Vale quando o projeto de origem pode ceder gente.</p>
            {resultado.squads.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Nenhum squad com projeto ou skills parecidas.
              </p>
            ) : (
              <ul className="space-y-3">
                {resultado.squads.map((s, i) => (
                  <CartaoSquad key={s.squadId} s={s} melhor={i === 0} total={resultado.termos.length} nome={nome} nomeProjeto={nomeProjeto} onPessoa={setAberto} />
                ))}
              </ul>
            )}
          </section>

          {/* Pessoas avulsas */}
          <section className="bg-white p-5 dark:bg-slate-900">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Puzzle className="size-4 text-brand-700 dark:text-brand-300" /> Ou monte com pessoas de vários squads
            </h3>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">O menor grupo disponível que cobre o que o projeto pede, sem tirar ninguém sobrecarregado.</p>

            {resultado.montagem.pessoaIds.length > 0 ? (
              <div className="rounded-xl border border-brand-300/70 bg-brand-50/50 p-3.5 dark:border-brand-700/60 dark:bg-brand-900/20">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-800 dark:text-brand-200">
                    <Sparkles className="size-3.5" /> Montagem sugerida
                  </span>
                  <span className="text-xs text-slate-600 tabular-nums dark:text-slate-300">
                    cobre {resultado.montagem.cobertos.length} de {resultado.termos.length} · {formatHoras(resultado.montagem.livreH)} livres
                  </span>
                </div>
                <ul className="space-y-2">
                  {resultado.montagem.pessoas.map(({ pessoaId: id, cobre, livreH, status }) => {
                    const m = membrosPorId.get(id);
                    return (
                      <li key={id}>
                        <button type="button" onClick={() => setAberto(id)} className="group flex w-full cursor-pointer items-center gap-2.5 text-left">
                          <Avatar nome={nome(id)} tamanho="sm" className="ring-0" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-800 group-hover:text-brand-700 dark:text-slate-100 dark:group-hover:text-brand-300">{nome(id)}</div>
                            <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {cobre.join(" · ")}
                              {m && ` · hoje em ${m.projetos.map((x) => x.nome).join(", ")}`}
                            </div>
                          </div>
                          <span className="shrink-0 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                            <strong className="text-slate-900 dark:text-slate-100">{formatHoras(livreH)}</strong> livres
                            {status !== "ok" && <StatusCargaTag status={status} className="block text-[10px]" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {resultado.montagem.faltando.length > 0 && (
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Ainda descoberto: {resultado.montagem.faltando.join(", ")}</p>
                )}
                <Acoes projetoNome={projetoNome} membros={resultado.montagem.pessoaIds.map((id) => membrosPorId.get(id)).filter((m): m is Membro => !!m)} />
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Ninguém disponível com as skills que o projeto pede.
              </p>
            )}

            {resultado.pessoas.length > 0 && (
              <>
                <div className="mt-4 mb-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Melhor encaixe individual</div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {resultado.pessoas.map((p) => (
                    <li key={p.pessoaId}>
                      <button type="button" onClick={() => setAberto(p.pessoaId)} className="group flex w-full cursor-pointer items-center gap-2.5 py-2 text-left">
                        <Avatar nome={nome(p.pessoaId)} tamanho="xs" className="ring-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-slate-800 group-hover:text-brand-700 dark:text-slate-100 dark:group-hover:text-brand-300">{nome(p.pessoaId)}</span>
                            <span className="shrink-0 text-[11px] text-slate-500 tabular-nums dark:text-slate-400" title="Quanto das necessidades do projeto as skills cobrem">
                              encaixe {pct(p.encaixe)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {p.matches.map((x) => (
                              <span
                                key={x.termo}
                                className={cn(
                                  "rounded px-1.5 text-[10px]",
                                  x.tipo === "confirmada" ? "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100" : "border border-dashed border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300",
                                )}
                                title={x.tipo === "confirmada" ? "Skill confirmada" : x.tipo === "sugerida" ? "Skill sugerida pelas tasks" : "Tag de função"}
                              >
                                {x.termo}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs tabular-nums text-slate-700 dark:text-slate-200">{formatHoras(p.livreH)} livres</div>
                          {p.status !== "ok" && <StatusCargaTag status={p.status} className="text-[10px]" />}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}

      {resultado && resultado.semNinguem.length > 0 && (
        <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Ninguém na empresa tem <strong>{resultado.semNinguem.join(", ")}</strong> como skill. Pode ser treinamento, contratação ou só falta
            cadastrar a skill em alguém (Equipe › Skills e tags).
          </span>
        </div>
      )}

      {membroAberto && (
        <PainelMembro
          membro={membroAberto}
          funcaoTags={funcaoTags.data ?? []}
          skillsCatalogo={skills.data ?? []}
          nomeProjeto={nomeProjeto}
          onClose={() => setAberto(null)}
        />
      )}
    </Card>
  );
}

function CartaoSquad({
  s,
  melhor,
  total,
  nome,
  nomeProjeto,
  onPessoa,
}: {
  s: SquadSugerido;
  melhor: boolean;
  total: number;
  nome: (id: string) => string;
  nomeProjeto: (id: string) => string;
  onPessoa: (id: string) => void;
}) {
  const origem = nomeProjeto(s.projetoId);
  return (
    <li className={cn("rounded-xl border p-3.5", melhor ? "border-brand-300/70 bg-brand-50/40 dark:border-brand-700/60 dark:bg-brand-900/20" : "border-slate-200 dark:border-slate-800")}>
      <div className="flex items-start gap-2.5">
        <MarcaProjeto nome={origem} className="size-8 rounded-md text-xs" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{s.nome}</span>
            {melhor && <span className="rounded-full bg-brand-700 px-1.5 py-px text-[10px] font-semibold text-white uppercase dark:bg-brand-600">mais parecido</span>}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            atua em {origem}
            {s.emComum.length > 0 && <> · em comum: {s.emComum.slice(0, 4).join(", ")}</>}
          </div>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-slate-600 dark:text-slate-300">
          <strong className="text-slate-900 dark:text-slate-100">{formatHoras(s.livreH)}</strong> livres
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
        <Medida rotulo="Projeto parecido" valor={s.similaridade} />
        <Medida rotulo={`Cobre ${s.cobertos.length} de ${total}`} valor={s.cobertura} />
        <Medida rotulo="Disponibilidade" valor={s.disponibilidade} />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {s.pessoaIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onPessoa(id)}
            title={nome(id)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-2 pl-0.5 text-[11px] text-slate-700 hover:bg-brand-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-brand-900/50"
          >
            <Avatar nome={nome(id)} tamanho="xs" className="ring-0" /> {nome(id).split(" ")[0]}
          </button>
        ))}
      </div>
      {s.faltando.length > 0 && <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Falta no squad: {s.faltando.join(", ")}</p>}
    </li>
  );
}

function Medida({ rotulo, valor }: { rotulo: string; valor: number }) {
  const cor = valor >= 0.6 ? STATUS_CARGA.ok.cor : valor >= 0.3 ? STATUS_CARGA.limite.cor : "var(--color-slate-400)";
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${Math.round(valor * 100)}%`, background: cor }} />
      </div>
      <div className="mt-1 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
        {rotulo} <strong className="text-slate-700 tabular-nums dark:text-slate-200">{pct(valor)}</strong>
      </div>
    </div>
  );
}

function Acoes({ projetoNome, membros }: { projetoNome: string; membros: Membro[] }) {
  const emails = membros.map((m) => m.uniqueName).filter((e): e is string => !!e);
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-brand-200/60 pt-3 dark:border-brand-800/60">
      {AZDO_ORG_URL && (
        <a
          href={`${AZDO_ORG_URL}/${encodeURIComponent(projetoNome)}/_settings/teams`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md bg-brand-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-900 dark:bg-brand-600 dark:hover:bg-brand-500"
        >
          Montar o time no DevOps <ExternalLink className="size-3" />
        </a>
      )}
      {emails.length > 0 && (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(emails.join("; "))
              .then(() => toast.success(`${emails.length} e-mails copiados — cole em "Add" no time do DevOps`))
              .catch(() => toast.error("Não foi possível copiar"));
          }}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Copy className="size-3" /> Copiar e-mails
        </button>
      )}
      <span className="self-center text-[10px] text-slate-500 dark:text-slate-400">Período: {HORIZONTE_EQUIPE.rotulo}</span>
    </div>
  );
}
