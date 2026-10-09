// Agente, parte de linguagem: o LLM recebe as candidatas com PSEUDÔNIMOS (LGPD: nomes reais
// nunca saem do sistema), devolve prioridade + título + explicação, e um validador garante que
// ele não inventou números nem pessoas. Se reprovar, vale o template determinístico.

import type { Candidato } from "./candidatos.ts";

export const VERSAO_PROMPT = "agente-ts.v1";

export interface TextoSugestao {
  prioridade: 1 | 2 | 3;
  titulo: string;
  texto: string;
}

// ---------------------------------------------------------------------------
// Pseudônimos
// ---------------------------------------------------------------------------

export function pseudonimos(candidatos: Candidato[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of candidatos)
    for (const id of Object.values(c.papeis))
      if (!m.has(id)) {
        const i = m.size;
        const letra = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : "");
        m.set(id, `Pessoa ${letra}`);
      }
  return m;
}

/**
 * Tira artigo/contração antes do pseudônimo ("à Pessoa B" → "para Pessoa B", "da Pessoa A" →
 * "de Pessoa A"): "Pessoa" é feminino, o nome real pode não ser. Rode ANTES de despseudonimizar.
 */
export function semArtigo(texto: string): string {
  return texto
    .replace(/(^|[\s(])para a (Pessoa [A-Z]\d*)/g, "$1para $2")
    .replace(/(^|[\s(])à (Pessoa [A-Z]\d*)/g, "$1para $2")
    .replace(/(^|[\s(])À (Pessoa [A-Z]\d*)/g, "$1Para $2")
    .replace(/(^|[\s(])da (Pessoa [A-Z]\d*)/g, "$1de $2")
    .replace(/(^|[\s(])Da (Pessoa [A-Z]\d*)/g, "$1De $2")
    .replace(/(^|[\s(])na (Pessoa [A-Z]\d*)/g, "$1em $2")
    .replace(/(^|[\s(])pela (Pessoa [A-Z]\d*)/g, "$1por $2")
    .replace(/(^|[.!?]\s+)A (Pessoa [A-Z]\d*)/g, "$1$2")
    .replace(/(^|\s)a (Pessoa [A-Z]\d*)/g, "$1$2");
}

/** Troca "Pessoa A" pelo nome real (do maior para o menor, para "Pessoa A1" não virar "Pessoa A"+"1"). */
export function despseudonimizar(texto: string, apelidos: Map<string, string>, nomeDe: (id: string) => string): string {
  const pares = [...apelidos].sort((a, b) => b[1].length - a[1].length);
  let out = semArtigo(texto);
  for (const [id, apelido] of pares) out = out.split(apelido).join(nomeDe(id));
  return out;
}

// ---------------------------------------------------------------------------
// Template (sem LLM, e fallback quando o LLM reprova)
// ---------------------------------------------------------------------------

const h = (n: unknown) => `${String(n).replace(".", ",")}h`;

export function template(c: Candidato, nome: (papel: string) => string): TextoSugestao {
  const f = c.fatos;
  const skills = f.skills ? ` Encaixe pelas skills: ${f.skills}.` : "";
  switch (c.tipo) {
    case "atribuir":
      return {
        prioridade: 2,
        titulo: `Atribuir #${f.task_id} a ${nome("para")}`,
        texto:
          f.sem_estimativa === "sim"
            ? `“${f.task}” (${f.sprint}, ${f.projeto}) está sem responsável e sem estimativa de horas. ` +
              `${nome("para")} tem folga (${f.para_antes_pct}% de ocupação). Vale estimar a task ao atribuir.${skills}`
            : `“${f.task}” (${f.sprint}, ${f.projeto}) está sem responsável, com ${h(f.horas)}. ` +
              `${nome("para")} vai de ${f.para_antes_pct}% para ${f.para_depois_pct}% de ocupação.${skills}`,
      };
    case "rebalancear":
      return {
        prioridade: 1,
        titulo: `Passar #${f.task_id} de ${nome("de")} para ${nome("para")}`,
        texto:
          `${nome("de")} está a ${f.de_pct_horizonte}% nas próximas 2 semanas (${h(f.de_acima_h)} acima). ` +
          `Passar “${f.task}” (${h(f.horas)}) leva ${nome("de")} de ${f.de_antes_pct}% para ${f.de_depois_pct}% na ${f.sprint}; ` +
          `${nome("para")} vai de ${f.para_antes_pct}% para ${f.para_depois_pct}%.${skills}`,
      };
    case "ausencia":
      return {
        prioridade: 1,
        titulo: `${nome("de")} está ausente: passar #${f.task_id} para ${nome("para")}`,
        texto:
          `${nome("de")} não tem horas disponíveis nas próximas 2 semanas, mas tem “${f.task}” (${h(f.horas)}) na ${f.sprint}. ` +
          `${nome("para")} pode assumir e vai de ${f.para_antes_pct}% para ${f.para_depois_pct}%.${skills}`,
      };
    case "equipe": {
      const pessoas = Object.keys(c.papeis).map(nome).join(", ");
      return {
        prioridade: 2,
        titulo: `Montar a equipe de ${f.projeto}`,
        texto:
          `O projeto pede ${f.necessidades}. ${pessoas} cobrem ${f.montagem_cobre} de ${f.total_necessidades} necessidades, com ${h(f.montagem_livre_h)} livres nas próximas 2 semanas.` +
          (f.squad !== "nenhum" ? ` Alternativa: o ${f.squad} (${f.squad_projeto}) cobre ${f.squad_cobre_pct}%.` : "") +
          (f.sem_ninguem !== "nenhuma" ? ` Ninguém na empresa tem: ${f.sem_ninguem}.` : ""),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Pedido ao LLM
// ---------------------------------------------------------------------------

export const SISTEMA = `Você é o agente do Radar de Capacidade, que ajuda um gestor de projetos de software MUITO ocupado a decidir alocações antes que virem problema.
Você recebe AÇÕES CANDIDATAS já calculadas por um motor determinístico, com todos os números prontos. Seu trabalho:
1. Dar prioridade a cada uma: 1 = fazer hoje (alguém acima da capacidade ou ausente com trabalho), 2 = esta semana, 3 = quando der.
2. Escrever um título curto (até 70 caracteres, verbo no início) e uma explicação de 1 a 2 frases em português do Brasil, direta, dizendo o problema, a ação e o efeito.

Regras obrigatórias:
- Use SÓ números que aparecem nos fatos da candidata, exatamente como estão (pode acrescentar % ou h). Nunca calcule, arredonde ou invente números.
- Refira-se às pessoas SÓ pelos pseudônimos dados (ex.: "Pessoa A"). Não invente pessoas.
- NUNCA use artigo nem contração antes do pseudônimo (o nome real pode ser de qualquer gênero): escreva "Pessoa A está", "passar para Pessoa B", "a carga de Pessoa A"; nunca "a Pessoa A", "à Pessoa B", "da Pessoa A".
- Fale de carga, disponibilidade e encaixe de skills. NUNCA de desempenho, produtividade ou de quem "rende" mais.
- Não prometa resultados nem dê ordens; é uma sugestão que o gestor aprova.
- Sem markdown, sem emojis.`;

export const FERRAMENTA = {
  name: "registrar_sugestoes",
  description: "Registra prioridade, título e explicação de cada ação candidata.",
  input_schema: {
    type: "object",
    properties: {
      sugestoes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer", description: "id da candidata" },
            prioridade: { type: "integer", enum: [1, 2, 3] },
            titulo: { type: "string" },
            texto: { type: "string" },
          },
          required: ["id", "prioridade", "titulo", "texto"],
        },
      },
    },
    required: ["sugestoes"],
  },
} as const;

/** Mensagem do usuário: candidatas com pseudônimos e fatos (sem nomes reais). */
export function mensagemCandidatas(candidatos: Candidato[], apelidos: Map<string, string>): string {
  const lista = candidatos.map((c, id) => ({
    id,
    tipo: c.tipo,
    gravidade: c.gravidade,
    pessoas: Object.fromEntries(Object.entries(c.papeis).map(([papel, pid]) => [papel, apelidos.get(pid)])),
    fatos: c.fatos,
  }));
  return (
    "Tipos: atribuir = task sem responsável; rebalancear = tirar uma task de quem está acima da capacidade (de) e passar para quem tem folga (para); " +
    "ausencia = quem está ausente (de) tem task no período; equipe = projeto novo sem pessoas (m1, m2... = montagem sugerida). " +
    "Os percentuais _antes/_depois são de ocupação na sprint da task; de_pct_horizonte é nas próximas 2 semanas.\n\n" +
    JSON.stringify(lista)
  );
}

// ---------------------------------------------------------------------------
// Validador anti-alucinação
// ---------------------------------------------------------------------------

const PROIBIDAS = /desempenh|produtividad|\brend[ae]\b|preguiç|lent[oa] demais|baixa performance/i;
const numeros = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => String(Number(x.replace(",", "."))));

export function validar(t: { titulo: string; texto: string }, c: Candidato, apelidos: Map<string, string>): string | null {
  const tudo = `${t.titulo} ${t.texto}`;
  if (!t.titulo.trim() || !t.texto.trim()) return "vazio";
  if (t.titulo.length > 90 || t.texto.length > 420) return "longo demais";
  if (PROIBIDAS.test(tudo)) return "fala de desempenho";
  if (/[*#`_]{2,}|^\s*[-*] /m.test(tudo)) return "markdown";

  const permitidos = new Set<string>(["2"]); // "próximas 2 semanas" está no contexto
  for (const v of Object.values(c.fatos)) for (const x of numeros(String(v))) permitidos.add(x);
  for (const x of numeros(tudo.replace(/Pessoa [A-Z]\d*/g, ""))) if (!permitidos.has(x)) return `número inventado: ${x}`;

  const meus = new Set(Object.values(c.papeis).map((id) => apelidos.get(id)));
  for (const a of tudo.match(/Pessoa [A-Z]\d*/g) ?? []) if (!meus.has(a)) return `pessoa fora da candidata: ${a}`;
  return null;
}
