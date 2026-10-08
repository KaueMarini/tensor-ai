// Membros: v_membros (uma linha por pessoa × time) agrupado em uma entrada por pessoa.

import type { MembroRow } from "./queries";
import { lerSkills, type SkillsPessoa } from "./skills";
import { normalizarNome } from "./utils";

export interface FuncaoTag {
  id: number;
  nome: string;
}

export interface ProjetoDoMembro {
  id: string;
  nome: string;
  times: string[];
}

export interface Membro {
  pessoaId: string;
  nome: string;
  uniqueName: string | null;
  projetos: ProjetoDoMembro[];
  /** Visíveis: confirmadas + sugeridas pela inferência das tasks. */
  skills: string[];
  skillsInfo: SkillsPessoa;
  tags: FuncaoTag[];
}

/** v_membros tem uma linha por pessoa × time; aqui vira uma entrada por pessoa. */
export function agruparMembros(rows: MembroRow[]): Membro[] {
  const porPessoa = new Map<string, Membro>();
  for (const r of rows) {
    if (!r.pessoa_id) continue;
    let m = porPessoa.get(r.pessoa_id);
    if (!m) {
      const skillsInfo = lerSkills(r.skills);
      m = {
        pessoaId: r.pessoa_id,
        nome: normalizarNome(r.nome ?? "Sem nome"),
        uniqueName: r.unique_name,
        projetos: [],
        skills: skillsInfo.skills,
        skillsInfo,
        tags: (r.tags as unknown as FuncaoTag[] | null) ?? [],
      };
      porPessoa.set(r.pessoa_id, m);
    }
    if (!r.projeto_id) continue;
    let p = m.projetos.find((x) => x.id === r.projeto_id);
    if (!p) {
      p = { id: r.projeto_id, nome: r.projeto_nome ?? "Projeto", times: [] };
      m.projetos.push(p);
    }
    if (r.time_nome && !p.times.includes(r.time_nome)) p.times.push(r.time_nome);
  }
  return [...porPessoa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

