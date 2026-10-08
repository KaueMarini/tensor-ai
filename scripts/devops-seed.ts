// pnpm devops:seed [--reset]
// Completa o projeto de demo (IportJLKN12) que já tem 3 sprints, 6 Features e 21 Tasks:
//   - responsáveis por skill, com uma pessoa sobrecarregada na Sprint 1 (~117%)
//   - capacidade de 6h/dia para todos nas 3 sprints
//   - férias de uma pessoa na Sprint 2 (com tasks atribuídas no período) e feriado do time na Sprint 3
//   - uma cadeia Feature -> User Story -> Task (testa a hierarquia genérica)
//   - mantém "Testes de carga do websocket" sem estimativa
// Idempotente: compara antes de escrever. --reset desfaz (remove responsáveis, capacidade, folgas e itens seed-radar).

import { chunk, createAzdoClient } from "../supabase/functions/_shared/azdo/client.ts";
import type { AzdoTeamMember, AzdoWorkItem } from "../supabase/functions/_shared/azdo/types.ts";

const need = (k: string) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Defina ${k} no .env.local`);
  return v;
};

const azdo = createAzdoClient({ orgUrl: need("AZDO_ORG_URL"), pat: need("AZDO_PAT") });
// ID do projeto de pátio (antigo IportJLKN12): estável se ele for renomeado no DevOps
const PROJETO = process.env.SEED_PROJETO?.trim() || "badd3c28-2533-4e04-9239-e79fa7f520f0";
const RESET = process.argv.includes("--reset");
const SEED_TAG = "seed-radar";
const HORAS_DIA = 6;
const enc = encodeURIComponent;

type Pessoa = "kaue" | "laryssa" | "nicolas" | "julliano";

// Distribuição por skill. Kauê: 16+20+16+10+8 = 70h na Sprint 1 contra 60h de capacidade.
const RESPONSAVEIS: Record<string, Pessoa> = {
  "API de janelas disponíveis": "kaue",
  "Autenticação de transportadoras": "kaue",
  "Ajustes de performance na consulta de docas": "kaue",
  "Leitura de XML da NF-e": "kaue",
  "Validação de CT-e": "kaue",
  "Tela de agendamento": "laryssa",
  "Componente de calendário reutilizável": "laryssa",
  "Testes de regressão do agendamento": "nicolas",
  "Documentação da integração fiscal": "julliano",
  "Mapa do pátio": "laryssa",
  "Websocket de status das vagas": "nicolas",
  "Alertas de fila": "nicolas",
  "Testes de carga do websocket": "nicolas", // continua sem estimativa
  "Tópicos do bot de atendimento": "kaue",
  "Base de conhecimento do bot": "kaue",
  "Conector Power Automate com a API de agendamento": "julliano", // Julliano de férias 19-23/10
  "Modelo de dados analítico": "julliano",
  "Dashboard de indicadores": "julliano",
  "Validação dos indicadores com a operação": "julliano",
  "POC de OCR no gate": "nicolas",
  "Integração do OCR com o agendamento": "kaue",
};

const FERIAS: Record<string, { pessoa: Pessoa; start: string; end: string }[]> = {
  "Sprint 2": [{ pessoa: "julliano", start: "2026-10-19T00:00:00Z", end: "2026-10-23T00:00:00Z" }],
};
const FOLGA_TIME: Record<string, { start: string; end: string }[]> = {
  "Sprint 3": [{ start: "2026-11-02T00:00:00Z", end: "2026-11-02T00:00:00Z" }], // Finados
};
const SPRINTS = ["Sprint 1", "Sprint 2", "Sprint 3"];
const ITERACOES_PADRAO = ["Iteration 1", "Iteration 2", "Iteration 3"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function patch(ops: { op: string; path: string; value?: unknown }[]) {
  return { body: ops, contentType: "application/json-patch+json" };
}

async function main() {
  const projeto = await azdo.getProject(PROJETO);
  const time = (await azdo.listTeams(projeto.id))[0]!;
  const membros = await azdo.listTeamMembers(projeto.id, time.id);
  const pessoa = (p: Pessoa): AzdoTeamMember["identity"] => {
    const m = membros.find((m) => norm(m.identity.displayName ?? "").startsWith(p));
    if (!m) throw new Error(`Membro "${p}" não encontrado no time ${time.name}`);
    return m.identity;
  };
  console.log(`Projeto ${projeto.name} / time ${time.name} / ${membros.length} membros${RESET ? " / MODO RESET" : ""}`);

  const itens = await todosItens(projeto.id);
  const porTitulo = new Map(itens.map((i) => [String(i.fields["System.Title"]), i]));

  // 1. Responsáveis
  for (const [titulo, p] of Object.entries(RESPONSAVEIS)) {
    const item = porTitulo.get(titulo);
    if (!item) {
      console.warn(`! task não encontrada: ${titulo}`);
      continue;
    }
    const atual = (item.fields["System.AssignedTo"] as { uniqueName?: string } | undefined)?.uniqueName;
    const alvo = RESET ? undefined : pessoa(p).uniqueName;
    if (atual === alvo) continue;
    await azdo.request("PATCH", `_apis/wit/workitems/${item.id}`, patch(
      alvo ? [{ op: "add", path: "/fields/System.AssignedTo", value: alvo }] : [{ op: "remove", path: "/fields/System.AssignedTo" }],
    ));
    console.log(`${alvo ? "→" : "×"} #${item.id} ${titulo}${alvo ? ` → ${pessoa(p).displayName}` : ""}`);
  }

  // 2. Capacidade, férias e folga do time
  const iteracoesTime = await azdo.listTeamIterations(projeto.id, time.id);
  for (const nome of SPRINTS) {
    const it = iteracoesTime.find((i) => i.name === nome);
    if (!it) {
      console.warn(`! sprint ${nome} não está associada ao time`);
      continue;
    }
    const base = `${enc(projeto.id)}/${enc(time.id)}/_apis/work/teamsettings/iterations/${it.id}`;
    for (const m of membros) {
      const ferias = (FERIAS[nome] ?? []).filter((f) => pessoa(f.pessoa).id === m.identity.id);
      await azdo.request("PATCH", `${base}/capacities/${m.identity.id}`, {
        body: {
          activities: [{ name: "Development", capacityPerDay: RESET ? 0 : HORAS_DIA }],
          daysOff: RESET ? [] : ferias.map(({ start, end }) => ({ start, end })),
        },
      });
    }
    await azdo.request("PATCH", `${base}/teamdaysoff`, { body: { daysOff: RESET ? [] : FOLGA_TIME[nome] ?? [] } });
    console.log(`✓ capacidade ${nome}: ${RESET ? 0 : HORAS_DIA}h/dia x ${membros.length}`);
  }

  // 3. Cadeia Feature -> User Story -> Task
  const feature = porTitulo.get("Painel de pátio em tempo real");
  const story = await garantirItem(projeto.id, porTitulo, {
    tipo: "User Story",
    titulo: "Visão do operador no pátio",
    parent: feature?.id,
    iteracao: `${projeto.name}\\Sprint 2`,
    responsavel: pessoa("laryssa").uniqueName,
    tags: `front-end; ${SEED_TAG}`,
    descricao: "Como operador, quero filtrar as vagas do pátio para achar rápido onde descarregar.",
  });
  await garantirItem(projeto.id, porTitulo, {
    tipo: "Task",
    titulo: "Filtro por status de vaga",
    parent: story,
    iteracao: `${projeto.name}\\Sprint 2`,
    responsavel: pessoa("laryssa").uniqueName,
    tags: `front-end; react; ${SEED_TAG}`,
    descricao: "Filtro no mapa do pátio por livre / ocupada / reservada.",
    horas: 6,
  });

  // 4. Iterações padrão sem data (Iteration 1..3) saem do time para não poluir
  if (!RESET) {
    for (const it of iteracoesTime.filter((i) => ITERACOES_PADRAO.includes(i.name))) {
      await azdo.request("DELETE", `${enc(projeto.id)}/${enc(time.id)}/_apis/work/teamsettings/iterations/${it.id}`);
      console.log(`× iteração ${it.name} removida do time`);
    }
  }
  console.log("Seed concluído.");
}

async function todosItens(projetoId: string): Promise<AzdoWorkItem[]> {
  const ids = await azdo.wiqlIds(projetoId, "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project");
  const out: AzdoWorkItem[] = [];
  for (const lote of chunk(ids, 200)) {
    out.push(...await azdo.getWorkItemsBatch(lote, ["System.Id", "System.Title", "System.AssignedTo", "System.Tags", "System.WorkItemType"]));
  }
  return out;
}

async function garantirItem(
  projetoId: string,
  porTitulo: Map<string, AzdoWorkItem>,
  d: { tipo: string; titulo: string; parent?: number; iteracao: string; responsavel?: string; tags: string; descricao: string; horas?: number },
): Promise<number | undefined> {
  const existente = porTitulo.get(d.titulo);
  if (RESET) {
    if (existente && String(existente.fields["System.Tags"] ?? "").includes(SEED_TAG)) {
      await azdo.request("DELETE", `_apis/wit/workitems/${existente.id}`);
      console.log(`× ${d.tipo} #${existente.id} ${d.titulo} (lixeira)`);
    }
    return undefined;
  }
  if (existente) return existente.id;
  const ops: { op: string; path: string; value?: unknown }[] = [
    { op: "add", path: "/fields/System.Title", value: d.titulo },
    { op: "add", path: "/fields/System.IterationPath", value: d.iteracao },
    { op: "add", path: "/fields/System.Tags", value: d.tags },
    { op: "add", path: "/fields/System.Description", value: d.descricao },
  ];
  if (d.responsavel) ops.push({ op: "add", path: "/fields/System.AssignedTo", value: d.responsavel });
  if (d.horas !== undefined) {
    ops.push({ op: "add", path: "/fields/Microsoft.VSTS.Scheduling.OriginalEstimate", value: d.horas });
    ops.push({ op: "add", path: "/fields/Microsoft.VSTS.Scheduling.RemainingWork", value: d.horas });
    ops.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Activity", value: "Development" });
  }
  if (d.parent) {
    ops.push({
      op: "add",
      path: "/relations/-",
      value: { rel: "System.LinkTypes.Hierarchy-Reverse", url: `${azdo.orgUrl}/_apis/wit/workItems/${d.parent}` },
    });
  }
  const criado = await azdo.request<AzdoWorkItem>("POST", `${enc(projetoId)}/_apis/wit/workitems/$${enc(d.tipo)}`, patch(ops));
  console.log(`+ ${d.tipo} #${criado.id} ${d.titulo}`);
  return criado.id;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
