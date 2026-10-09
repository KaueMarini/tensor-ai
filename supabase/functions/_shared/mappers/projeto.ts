// Projeto do DevOps → linha da tabela projeto.
// O DevOps não tem tags de projeto; convencionamos uma linha "Tags: a, b, c" na descrição
// (visível e editável por qualquer um na UI do DevOps), e opcionalmente "Impacto: alto|médio|baixo".
// O agente usa descrição + tags + impacto.

import type { AzdoProject } from "../azdo/types.ts";

const LINHA_TAGS = /^\s*tags?\s*:\s*(.+)$/im;
// "Impacto: alto" (ou Relevância / Importância / Prioridade) → 3 | 2 | 1
const LINHA_IMPACTO = /^\s*(?:impacto|relev[âa]ncia|import[âa]ncia|prioridade)\s*:\s*(.+)$/im;

export function lerImpacto(valor: string): 1 | 2 | 3 | null {
  const v = valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (/^(alt[oa]|critic[oa]|3)\b/.test(v)) return 3;
  if (/^(medi[oa]|normal|2)\b/.test(v)) return 2;
  if (/^(baix[oa]|1)\b/.test(v)) return 1;
  return null;
}

export function lerDescricaoProjeto(descricao: string | null | undefined): {
  descricao: string | null;
  tags: string[];
  impacto: 1 | 2 | 3 | null;
} {
  let texto = (descricao ?? "").replace(/\r\n/g, "\n");
  const mi = texto.match(LINHA_IMPACTO);
  const impacto = mi ? lerImpacto(mi[1]!) : null;
  if (mi && impacto !== null) texto = texto.replace(mi[0], "");
  const m = texto.match(LINHA_TAGS);
  const tags = m
    ? [...new Set(m[1]!.split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean))]
    : [];
  const semTags = (m ? texto.replace(m[0], "") : texto).replace(/\n{3,}/g, "\n\n").trim();
  return { descricao: semTags || null, tags, impacto };
}

export function mapProjeto(p: AzdoProject) {
  const { descricao, tags, impacto } = lerDescricaoProjeto(p.description);
  return {
    id: p.id,
    nome: p.name,
    descricao,
    tags_requeridas: tags,
    impacto_devops: impacto,
    processo: p.capabilities?.processTemplate?.templateName ?? null,
  };
}
