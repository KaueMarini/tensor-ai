export interface SkillInfo {
  tag: string;
  origem: "ia" | "gestor" | "tasks";
  confirmada: boolean;
  rejeitada: boolean;
  evidencias: number;
}

export interface SkillsPessoa {
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
