import type { Candidato, RotaAusencia } from "./candidatos.ts";
import type { Ferramenta } from "./explicacao.ts";

export const VERSAO_PROMPT = "agente-ts.v1";

export interface TextoSugestao {
  prioridade: 1 | 2 | 3;
  titulo: string;
  texto: string;
}

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

export function despseudonimizar(texto: string, apelidos: Map<string, string>, nomeDe: (id: string) => string): string {
  const pares = [...apelidos].sort((a, b) => b[1].length - a[1].length);
  let out = semArtigo(texto);
  for (const [id, apelido] of pares) out = out.split(apelido).join(nomeDe(id));
  return out;
}

const h = (n: unknown) => `${String(n).replace(".", ",")}h`;
const tasks = (n: number) => (n === 1 ? "1 task" : `${n} tasks`);

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
    case "ausencia": {
      const rotas = ((c.detalhe.rotas ?? []) as RotaAusencia[]).filter((r) => r.para_pessoa_id && !r.fora_do_time);
      const porPessoa = new Map<string, { n: number; h: number }>();
      for (const r of rotas) {
        const x = porPessoa.get(r.para_pessoa_id!) ?? { n: 0, h: 0 };
        porPessoa.set(r.para_pessoa_id!, { n: x.n + 1, h: x.h + r.horas });
      }
      const papelDe = new Map(Object.entries(c.papeis).map(([papel, id]) => [id, papel]));
      const dist = [...porPessoa.entries()].map(([id, x]) => `${nome(papelDe.get(id) ?? "")} assume ${tasks(x.n)} (${h(x.h)})`).join(", ");
      const n = Number(f.n_tasks);
      const partes = [
        `${nome("de")} fica ${f.dias_ausente} dias úteis fora (${f.sprints}) e tem ${tasks(n)} abertas (${h(f.horas_total)}).`,
        dist ? `Pela folga, skills e projetos parecidos: ${dist}.` : "",
        Number(f.n_fora_do_time) ? `${tasks(Number(f.n_fora_do_time))} só tem quem assuma fora do time (inclua a pessoa no time antes).` : "",
        Number(f.n_sem_destino) ? `${tasks(Number(f.n_sem_destino))} sem ninguém com folga no período.` : "",
        Number(f.n_roteaveis) ? "Aprove para rotear tudo de uma vez." : "",
      ];
      return {
        prioridade: 1,
        titulo: `${nome("de")} estará de ${f.tipo_ausencia} ${f.periodo}: ${tasks(n)} para redistribuir`,
        texto: partes.filter(Boolean).join(" "),
      };
    }
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
    case "portfolio":
      return f.leitura === "esforco-alto-impacto-baixo"
        ? {
            prioridade: 2,
            titulo: `Rever o esforço em ${f.projeto}`,
            texto:
              `${f.projeto} tem impacto ${f.impacto} (${f.impacto_fonte}), mas consome ${f.pct_equipe}% da capacidade da equipe nas próximas 4 semanas ` +
              `(${h(f.horas_4sem)}, ${f.pessoas} pessoas; média dos projetos: ${f.media_pct}%). Vale confirmar se esse investimento se justifica ou se parte dele deve ir para projetos de impacto maior.`,
          }
        : {
            prioridade: 2,
            titulo: `${f.projeto} é importante, mas está com pouca gente`,
            texto:
              `${f.projeto} tem impacto ${f.impacto} (${f.impacto_fonte}) e ${h(f.horas_abertas)} de trabalho aberto, mas recebe só ${f.pct_equipe}% da capacidade da equipe ` +
              `nas próximas 4 semanas (média dos projetos: ${f.media_pct}%). Vale reforçar antes que atrase.`,
          };
    case "gargalo":
      return {
        prioridade: c.gravidade === "critico" ? 1 : 2,
        titulo: `Gargalo em ${f.projeto}: ${f.parados} tasks paradas`,
        texto:
          `${f.parados} de ${f.abertos} tasks abertas estão paradas há mais de ${f.limite_dias} dias (a mediana do projeto é ${f.mediana_parado_dias}), ` +
          `a maioria em "${f.estado_gargalo}". Elas somam ${f.pct_dias_parados}% de todo o tempo parado; a mais antiga é ${f.task_mais_parada} (${f.max_parado_dias} dias). Vale destravar essas antes de puxar trabalho novo.`,
      };
    case "wip":
      return {
        prioridade: 2,
        titulo: `${nome("de")} tem ${f.em_andamento} tasks em andamento ao mesmo tempo`,
        texto:
          `O limite saudável é ${f.limite_wip} em andamento por pessoa; ${nome("de")} tem ${f.em_andamento} (${h(f.horas_em_andamento)}, em ${f.projetos} projetos). ` +
          `Muita coisa aberta ao mesmo tempo atrasa todas: vale terminar ${f.mais_antiga}, parada há ${f.mais_antiga_dias} dias, antes de começar outra.`,
      };
    case "similares":
      return {
        prioridade: 3,
        titulo: `${f.projeto_a} e ${f.projeto_b} são parecidos`,
        texto:
          `As descrições dos dois projetos são ${f.descricao_pct}% parecidas (falam de ${f.palavras_em_comum}) e as tags em comum são ${f.em_comum}: ${f.parecido_pct}% de semelhança no total. ` +
          `Vale checar se há trabalho duplicado, componentes que podem ser compartilhados ou um squad que possa atender os dois.`,
      };
  }
}

export const SISTEMA = `Você é o agente do Radar de Capacidade, que ajuda um gestor de projetos de software MUITO ocupado a decidir alocações antes que virem problema.
Você recebe AÇÕES CANDIDATAS já calculadas por um motor determinístico, com todos os números prontos. Seu trabalho:
1. Dar prioridade a cada uma: 1 = fazer hoje (alguém acima da capacidade ou ausente com trabalho), 2 = esta semana (inclui esforço desproporcional ao impacto), 3 = quando der (ex.: projetos parecidos).
2. Escrever um título curto (até 70 caracteres, verbo no início) e uma explicação de 1 a 2 frases em português do Brasil, direta, dizendo o problema, a ação e o efeito.

Regras obrigatórias:
- Use SÓ números que aparecem nos fatos da candidata, exatamente como estão (pode acrescentar % ou h). Nunca calcule, arredonde ou invente números.
- Refira-se às pessoas SÓ pelos pseudônimos dados (ex.: "Pessoa A"). Não invente pessoas.
- NUNCA use artigo nem contração antes do pseudônimo (o nome real pode ser de qualquer gênero): escreva "Pessoa A está", "passar para Pessoa B", "a carga de Pessoa A"; nunca "a Pessoa A", "à Pessoa B", "da Pessoa A".
- Fale de carga, disponibilidade e encaixe de skills. NUNCA de desempenho, produtividade ou de quem "rende" mais.
- Em gargalo e wip fale do FLUXO (trabalho parado, muita coisa aberta ao mesmo tempo), nunca de quem é lento; sugira destravar ou terminar antes de começar.
- Nas candidatas de PROJETO (portfolio, similares) você avalia o projeto, não pessoas: aponte com clareza quando há muito esforço para pouco impacto, ou um projeto importante com pouca gente, e quando dois projetos se sobrepõem (risco de retrabalho, chance de compartilhar código ou squad). Seja direto, mas deixe claro que a decisão é do gestor.
- Não prometa resultados nem dê ordens; é uma sugestão que o gestor aprova.
- Escreva em português do Brasil com acentuação e cedilha corretas (estará, férias, ausência, atribuição).
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
    "ausencia = quem vai estar de férias/folga (de) tem n_tasks tasks nas sprints do período; o motor já dividiu entre para1, para2... (tempo livre, skills e projetos parecidos); n_roteaveis podem ser roteadas com um clique, n_fora_do_time precisam de alguém de fora do time e n_sem_destino não têm ninguém com folga; equipe = projeto novo sem pessoas (m1, m2... = montagem sugerida); " +
    "portfolio = esforço × impacto de um projeto (leitura esforco-alto-impacto-baixo ou impacto-alto-pouco-esforco; pct_equipe = % da capacidade da equipe nas próximas 4 semanas; impacto_fonte diz quem definiu o impacto); " +
    "similares = dois projetos parecidos pela descrição (descricao_pct, palavras_em_comum) e pelas tags (em_comum); parecido_pct é o total; " +
    "gargalo = tasks paradas além do normal num projeto (fluxo travado; parados, mediana_parado_dias, estado_gargalo); " +
    "wip = pessoa (de) com trabalho demais em andamento ao mesmo tempo (em_andamento acima de limite_wip). " +
    "Os percentuais _antes/_depois são de ocupação na sprint da task; de_pct_horizonte é nas próximas 2 semanas.\n\n" +
    JSON.stringify(lista)
  );
}

export const SISTEMA_IMPACTO = `Você avalia a IMPORTÂNCIA para o negócio de projetos de software de uma empresa de tecnologia que atende o setor portuário e de logística.
Para cada projeto, a partir só do nome, da descrição e das tags, dê o impacto:
3 = alto: atende clientes externos ou a operação crítica, gera receita, tem obrigação legal/fiscal ou risco grande se atrasar;
2 = médio: melhora processos ou produtos existentes, impacto importante mas não crítico;
1 = baixo: experimento, prova de conceito, teste, uso interno de apoio, ou descrição vaga demais para justificar mais.
Escreva uma justificativa de 1 frase em português do Brasil, citando o que na descrição levou à nota. Não invente fatos que não estão na descrição. Sem markdown.`;

export const FERRAMENTA_IMPACTO = {
  name: "registrar_impactos",
  description: "Registra o impacto estimado (1 a 3) e a justificativa de cada projeto.",
  input_schema: {
    type: "object",
    properties: {
      projetos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            impacto: { type: "integer", enum: [1, 2, 3] },
            justificativa: { type: "string" },
          },
          required: ["id", "impacto", "justificativa"],
        },
      },
    },
    required: ["projetos"],
  },
} as const;

const PROIBIDAS = /desempenh|produtividad|\brend[ae]\b|preguiç|lent[oa] demais|baixa performance/i;
const SEM_ACENTO = /\b(estara|ferias|ausencia|atribuicao|alocacao|disponivel|tambem|ninguem|uteis|esforco|integracao|sera|nao|voce|apos|ate|ja|periodo|proxim[oa]s?|unic[oa]s?|area|tera|ficara|deixara|usuario|analise|critico|responsavel)\b/i;
export const semAcentuacao = (s: string) => SEM_ACENTO.test(s.replace(/[“"][^”"]*[”"]/g, ""));
const numeros = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => String(Number(x.replace(",", "."))));

export function validar(t: { titulo: string; texto: string }, c: Candidato, apelidos: Map<string, string>): string | null {
  const tudo = `${t.titulo} ${t.texto}`;
  if (!t.titulo.trim() || !t.texto.trim()) return "vazio";
  if (t.titulo.length > 90 || t.texto.length > 420) return "longo demais";
  if (PROIBIDAS.test(tudo)) return "fala de desempenho";
  if (semAcentuacao(tudo)) return "sem acentuação";
  if (/[*#`_]{2,}|^\s*[-*] /m.test(tudo)) return "markdown";

  const permitidos = new Set<string>(["2"]);
  for (const v of Object.values(c.fatos)) for (const x of numeros(String(v))) permitidos.add(x);
  for (const x of numeros(tudo.replace(/Pessoa [A-Z]\d*/g, ""))) if (!permitidos.has(x)) return `número inventado: ${x}`;

  const meus = new Set(Object.values(c.papeis).map((id) => apelidos.get(id)));
  for (const a of tudo.match(/Pessoa [A-Z]\d*/g) ?? []) if (!meus.has(a)) return `pessoa fora da candidata: ${a}`;
  return null;
}

export interface Explicacao {
  resumo: string;
  leituras: Partial<Record<Ferramenta["tipo"], string>>;
}

const diasTxt = (v: unknown) => (v === 1 || v === "1" ? "1 dia" : `${String(v).replace(".", ",")} dias`);

export function explicacaoTemplate(fs: Ferramenta[]): Explicacao {
  const leituras: Explicacao["leituras"] = {};
  for (const f of fs) {
    const x = f.fatos;
    if (f.tipo === "tempo")
      leituras.tempo = f.alvo
        ? `A task está há ${diasTxt(x.alvo_parado_dias)} em "${x.alvo_estado}" (criada há ${diasTxt(x.alvo_lead_dias)}), contra uma mediana de ${diasTxt(x.mediana_parado_dias)} parada nas tasks abertas do projeto.` +
          (f.estourado ? " Está bem acima do normal: o fluxo estagnou aqui." : "")
        : `Mediana de ${x.mediana_parado_dias} dias parada entre ${x.itens_analisados} tasks abertas; ${x.parados_15_dias} estão paradas há mais de 15 dias.`;
    if (f.tipo === "pareto")
      leituras.pareto =
        `${x.itens_80} de ${x.itens_total} itens (${x.pct_itens_80}%) concentram 80% do total.` +
        (x.destaque ? ` O item da sugestão responde por ${x.destaque_pct}% e é o ${x.destaque_posicao}º maior${x.destaque_no_80 === "sim" ? ", dentro do grupo que faz 80%" : ""}.` : "");
    if (f.tipo === "matriz")
      leituras.matriz =
        x.projeto !== undefined
          ? `${x.projeto} fica no quadrante "${x.quadrante}" da matriz esforço × impacto do portfólio.`
          : `A ação fica no quadrante "${x.quadrante}": usa ${x.esforco_pct}% da folga de quem recebe, com impacto de ${x.impacto_pct}%.` +
            (x.sobrecarga_resolvida_pct !== undefined ? ` Resolve ${x.sobrecarga_resolvida_pct}% da sobrecarga.` : "");
  }
  const m = fs.find((f) => f.tipo === "matriz");
  return { resumo: m ? `Leitura técnica: a recomendação é um ${m.fatos.quadrante}.` : "Leitura técnica da recomendação.", leituras };
}

export const SISTEMA_EXPLICACAO = `Você é a camada de IA EXPLICÁVEL do Radar de Capacidade. O gestor já viu uma sugestão resumida e clicou em "Entender análise" para ver o porquê, em visão técnica.
Você recebe a sugestão e, já calculadas por um motor determinístico, as ferramentas de engenharia de processos que se aplicam ao caso:
- tempo: diagnóstico de tempo (lead time = dias desde a criação; parado = dias no estado atual) e mapa de calor estado × dias parado;
- pareto: análise 80/20 (quantos itens concentram 80% da carga/atraso e onde está o item da sugestão);
- matriz: esforço × impacto (Quick win = pouco esforço e muito impacto; Grande aposta; Preenchimento; Evitar).
Escreva para CADA ferramenta recebida uma leitura de NO MÁXIMO 2 frases curtas que prove com os dados por que a recomendação faz sentido (ou aponte a ressalva, se os dados mostrarem), sem repetir a mesma ideia, e um resumo de 1 frase.
Chaves terminadas em _pct são porcentagens (escreva com %), _h são horas, _dias são dias.
Regras: use SÓ números presentes nos fatos, exatamente como estão (pode acrescentar %, h ou dias); não invente dados; fale de fluxo, carga e encaixe, nunca de desempenho de pessoas; português do Brasil com acentuação correta; sem markdown.`;

export const FERRAMENTA_EXPLICACAO = {
  name: "registrar_explicacao",
  description: "Registra o resumo e a leitura técnica de cada ferramenta.",
  input_schema: {
    type: "object",
    properties: {
      resumo: { type: "string" },
      leituras: {
        type: "array",
        items: {
          type: "object",
          properties: { ferramenta: { type: "string", enum: ["tempo", "pareto", "matriz"] }, texto: { type: "string" } },
          required: ["ferramenta", "texto"],
        },
      },
    },
    required: ["resumo", "leituras"],
  },
} as const;

export function mensagemExplicacao(sugestao: { tipo: string; fatos: Record<string, string | number> }, fs: Ferramenta[]): string {
  return JSON.stringify({
    sugestao,
    ferramentas: fs.map((f) => ({ ferramenta: f.tipo, fatos: f.fatos, ...(f.tipo === "pareto" ? { itens: f.itens.slice(0, 6).map((i) => ({ valor: i.valor, acumulado_pct: i.acumuladoPct, sugerido: i.destaque })) } : {}) })),
  });
}

export function validarExplicacao(texto: string, fs: Ferramenta[], extras: Record<string, string | number>): string | null {
  if (!texto.trim()) return "vazio";
  if (texto.length > 600) return "longo demais";
  if (PROIBIDAS.test(texto)) return "fala de desempenho";
  if (semAcentuacao(texto)) return "sem acentuação";
  const permitidos = new Set<string>(["80", "20", "2"]);
  const fontes: unknown[] = [...Object.values(extras), ...fs.flatMap((f) => Object.values(f.fatos))];
  for (const f of fs) if (f.tipo === "pareto") for (const i of f.itens) fontes.push(i.valor, i.acumuladoPct);
  for (const v of fontes) for (const x of numeros(String(v))) permitidos.add(x);
  for (const x of numeros(texto)) if (!permitidos.has(x)) return `número inventado: ${x}`;
  return null;
}
