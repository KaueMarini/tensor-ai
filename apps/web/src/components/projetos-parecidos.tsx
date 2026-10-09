import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, GitCompareArrows } from "lucide-react";
import { projetosParecidos } from "@shared/capacidade/portfolio";
import { usePerfisProjetos } from "@/lib/equipe-sugerida";
import { useMembros } from "@/lib/queries";
import { lerSkills } from "@/lib/skills";
import { MarcaProjeto } from "@/components/avatar";
import { Card, CardTitulo } from "@/components/ui/card";

export function ProjetosParecidos({ projetoId }: { projetoId: string }) {
  const perfis = usePerfisProjetos();
  const membros = useMembros();

  const pares = useMemo(() => {
    if (!perfis.data || !membros.data) return [];
    const catalogo = [
      ...new Set([
        ...membros.data.flatMap((m) => lerSkills(m.skills).skills),
        ...perfis.data.flatMap((p) => p.tags ?? []),
      ]),
    ];
    const projetos = perfis.data.map((p) => ({
      id: p.id!,
      nome: p.nome ?? "",
      descricao: p.descricao,
      tags: p.tags ?? [],
      impacto: null,
      impactoOrigem: null,
    }));
    const nome = new Map(projetos.map((p) => [p.id, p.nome]));
    return projetosParecidos(projetos, catalogo)
      .filter((x) => x.a === projetoId || x.b === projetoId)
      .map((x) => {
        const outro = x.a === projetoId ? x.b : x.a;
        return { ...x, outro, nome: nome.get(outro) ?? "Projeto" };
      });
  }, [perfis.data, membros.data, projetoId]);

  if (pares.length === 0) return null;

  return (
    <Card>
      <CardTitulo
        icone={GitCompareArrows}
        titulo="Projetos parecidos com este"
        descricao="Comparação do texto das descrições e das tags. Pode haver trabalho duplicado, código para reaproveitar ou um squad que atenda os dois."
      />
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {pares.map((x) => (
          <li key={x.outro}>
            <Link
              to="/projetos/$projetoId/resumo"
              params={{ projetoId: x.outro }}
              className="group flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              <MarcaProjeto nome={x.nome} className="size-8 rounded-md text-xs" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{x.nome}</span>
                  <span className="text-xs font-semibold tabular-nums text-brand-700 dark:text-brand-300">{Math.round(x.similaridade * 100)}% parecido</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Descrição {Math.round(x.porDescricao * 100)}%
                  {x.palavras.length > 0 && <> · fala de {x.palavras.join(", ")}</>}
                  {x.emComum.length > 0 && <> · tags em comum: {x.emComum.join(", ")}</>}
                </div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
