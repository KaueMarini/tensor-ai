// Lê o jsonb de skills da v_membros. Skills inferidas das tasks chegam como sugestão
// (origem 'tasks', não confirmada) até o gestor confirmar; descartadas ficam escondidas.

export interface SkillInfo {
  tag: string;
  origem: "ia" | "gestor" | "tasks";
  confirmada: boolean;
  rejeitada: boolean;
  /** Quantas tasks da pessoa têm essa tag (na task ou na Feature pai). */
  evidencias: number;
}

export interface SkillsPessoa {
  /** Visíveis (confirmadas + sugeridas), na ordem: confirmadas primeiro, depois por evidência. */
  skills: string[];
  sugeridas: string[];
  descartadas: string[];
  info: Record<string, SkillInfo>;
}

export function lerSkills(json: unknown): SkillsPessoa {
  const lista = (Array.isArray(json) ? json : []) as Partial<SkillInfo>[];
  const out: SkillsPessoa = { skills: [], sugeridas: [], descartadas: [], info: {} };
  for (const s of lista) {
    if (!s.tag) continue;
    const info: SkillInfo = {
      tag: s.tag,
      origem: s.origem ?? "gestor",
      // linhas antigas (antes da inferência) não tinham o campo: eram do gestor
      confirmada: s.confirmada ?? true,
      rejeitada: s.rejeitada ?? false,
      evidencias: s.evidencias ?? 0,
    };
    out.info[s.tag] = info;
    if (info.rejeitada) out.descartadas.push(s.tag);
    else {
      out.skills.push(s.tag);
      if (!info.confirmada) out.sugeridas.push(s.tag);
    }
  }
  return out;
}
