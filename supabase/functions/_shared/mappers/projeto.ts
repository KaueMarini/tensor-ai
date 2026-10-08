// Projeto do DevOps → linha da tabela projeto.
// O DevOps não tem tags de projeto; convencionamos uma linha "Tags: a, b, c" na descrição
// (visível e editável por qualquer um na UI do DevOps). O agente usa descrição + tags.

import type { AzdoProject } from "../azdo/types.ts";

const LINHA_TAGS = /^\s*tags?\s*:\s*(.+)$/im;

export function lerDescricaoProjeto(descricao: string | null | undefined): { descricao: string | null; tags: string[] } {
  const texto = (descricao ?? "").replace(/\r\n/g, "\n");
  const m = texto.match(LINHA_TAGS);
  const tags = m
    ? [...new Set(m[1]!.split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean))]
    : [];
  const semTags = (m ? texto.replace(m[0], "") : texto).replace(/\n{3,}/g, "\n\n").trim();
  return { descricao: semTags || null, tags };
}

export function mapProjeto(p: AzdoProject) {
  const { descricao, tags } = lerDescricaoProjeto(p.description);
  return {
    id: p.id,
    nome: p.name,
    descricao,
    tags_requeridas: tags,
    processo: p.capabilities?.processTemplate?.templateName ?? null,
  };
}
