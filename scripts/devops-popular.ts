// pnpm devops:popular [--reset] [--projeto "Nome"]
// Popula os projetos do Azure DevOps com sprints, requisitos (Feature; Epic no processo Basic)
// e tasks com tags, horas, responsáveis e capacidade — para a demo ter dados em todos os projetos.
//
// - Sprints "Sprint 1..3" com datas (Sprint 1 = atual), associadas ao time padrão.
// - Requisitos e tasks por tema de cada projeto (ver TEMAS). Responsável = 1ª pessoa preferida
//   que está no time do projeto; sem ninguém, fica sem dono (vira alerta no app).
// - Capacidade 6h/dia para todos os membros nas 3 sprints.
// - Idempotente: procura pelo título antes de criar. Itens marcados com a tag SEED_TAG.
// - --reset manda para a lixeira os itens SEED_TAG (sprints e capacidade ficam).
// - IportJLKN12 fica de fora: já é populado por `pnpm devops:seed`.

import { chunk, createAzdoClient } from "../supabase/functions/_shared/azdo/client.ts";
import type { AzdoTeamMember, AzdoWorkItem } from "../supabase/functions/_shared/azdo/types.ts";

const need = (k: string) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Defina ${k} no .env.local`);
  return v;
};

const azdo = createAzdoClient({ orgUrl: need("AZDO_ORG_URL"), pat: need("AZDO_PAT") });
const RESET = process.argv.includes("--reset");
const SO_PROJETO = (() => {
  const i = process.argv.indexOf("--projeto");
  return i > 0 ? process.argv[i + 1] : undefined;
})();
const SEED_TAG = "seed-popular";
const HORAS_DIA = 6;
const IGNORAR = new Set(["IportJLKN12"]);
const enc = encodeURIComponent;

const SPRINTS = [
  { nome: "Sprint 1", inicio: "2026-10-05", fim: "2026-10-16" },
  { nome: "Sprint 2", inicio: "2026-10-19", fim: "2026-10-30" },
  { nome: "Sprint 3", inicio: "2026-11-02", fim: "2026-11-13" },
];

// ---------------------------------------------------------------------------
// Conteúdo
// ---------------------------------------------------------------------------

type Pessoa = "kaue" | "abner" | "sebastiao" | "aaron" | "laryssa" | "nicolas" | "julliano";
type Estado = "andamento" | "feito";

interface TaskDef {
  titulo: string;
  horas: number | null; // null = sem estimativa
  tags: string[];
  quem: Pessoa[]; // ordem de preferência
  estado?: Estado;
}

interface RequisitoDef {
  titulo: string;
  descricao: string;
  sprint: 1 | 2 | 3;
  tags: string[];
  tasks: TaskDef[];
}

const t = (titulo: string, horas: number | null, tags: string[], quem: Pessoa[], estado?: Estado): TaskDef => ({
  titulo,
  horas,
  tags,
  quem,
  estado,
});

const TEMAS: Record<string, RequisitoDef[]> = {
  // Agile — atendimento automatizado (só o Kauê no time hoje: parte das tasks fica sem dono)
  Teste: [
    {
      titulo: "Bot de atendimento a transportadoras",
      descricao: "Assistente no Teams para transportadoras consultarem agendamentos e status de carga.",
      sprint: 1,
      tags: ["copilot-studio"],
      tasks: [
        t("Mapear intenções mais frequentes do SAC", 8, ["copilot-studio", "analise"], ["kaue"], "feito"),
        t("Tópicos de consulta de agendamento", 12, ["copilot-studio"], ["kaue"], "andamento"),
        t("Fallback para atendente humano", 6, ["copilot-studio"], ["kaue"]),
        t("Publicar o bot no canal do Teams", 4, ["copilot-studio", "infra"], []),
        t("Roteiro de testes de conversa", 6, ["testes"], []),
      ],
    },
    {
      titulo: "Base de conhecimento do porto",
      descricao: "Documentos de procedimentos indexados para o bot responder perguntas operacionais.",
      sprint: 1,
      tags: ["copilot-studio"],
      tasks: [
        t("Levantar documentos de procedimento do gate", 6, ["documentacao"], ["kaue"], "feito"),
        t("Indexar PDFs no SharePoint", 8, ["copilot-studio", "sharepoint"], ["kaue"], "andamento"),
        t("Curadoria das respostas geradas", 10, ["copilot-studio", "qa"], []),
        t("Política de atualização da base", null, ["documentacao"], []),
      ],
    },
    {
      titulo: "Integração do bot com a API de agendamento",
      descricao: "Conector do Power Platform para o bot criar e remarcar janelas de carga.",
      sprint: 2,
      tags: ["integracao"],
      tasks: [
        t("Conector customizado da API de agendamento", 12, ["power-platform", "back-end"], ["kaue"]),
        t("Fluxo de remarcação no Power Automate", 10, ["power-platform"], ["kaue"]),
        t("Autenticação do conector com Entra ID", 8, ["seguranca", "back-end"], []),
        t("Testes de ponta a ponta do agendamento pelo bot", 8, ["testes"], []),
        t("Tratamento de erros e mensagens amigáveis", 6, ["copilot-studio"], ["kaue"]),
      ],
    },
    {
      titulo: "Painel de métricas do atendimento",
      descricao: "Indicadores de uso do bot: volume, taxa de resolução e transferências.",
      sprint: 3,
      tags: ["analytics"],
      tasks: [
        t("Exportar transcrições para o Dataverse", 6, ["power-platform", "dados"], ["kaue"]),
        t("Modelo de dados das conversas", 8, ["dados"], []),
        t("Dashboard de resolução no Power BI", 12, ["power-bi"], []),
        t("Validação dos indicadores com o SAC", 4, ["analise"], []),
      ],
    },
    {
      titulo: "Atendimento em inglês e espanhol",
      descricao: "Suporte multilíngue para armadores estrangeiros.",
      sprint: 3,
      tags: ["copilot-studio"],
      tasks: [
        t("Tradução dos tópicos principais", 10, ["copilot-studio", "i18n"], ["kaue"]),
        t("Detecção automática de idioma", 6, ["copilot-studio"], []),
        t("Testes com usuários estrangeiros", null, ["testes"], []),
        t("Glossário de termos portuários", 4, ["documentacao"], []),
      ],
    },
  ],

  // Agile — app do motorista (time com Abner, Sebastião, Kauê, Aaron; Abner sobrecarregado na Sprint 1)
  "Eu amo a Laryssa": [
    {
      titulo: "Check-in do motorista pelo app",
      descricao: "Motorista confirma chegada ao porto pelo celular e recebe a doca.",
      sprint: 1,
      tags: ["mobile"],
      tasks: [
        t("Tela de check-in com QR code", 16, ["front-end", "mobile"], ["abner"], "andamento"),
        t("Endpoint de confirmação de chegada", 12, ["back-end", "api"], ["sebastiao", "kaue"], "feito"),
        t("Geolocalização do motorista no pátio", 14, ["mobile", "front-end"], ["abner"]),
        t("Notificação push da doca liberada", 10, ["mobile", "back-end"], ["abner"]),
        t("Testes de check-in em rede instável", 8, ["testes"], ["aaron"]),
        t("Layout acessível para tela pequena", 12, ["front-end", "ux"], ["abner"]),
      ],
    },
    {
      titulo: "Documentos da carga no celular",
      descricao: "Motorista envia foto da NF-e e do CT-e direto pelo app.",
      sprint: 1,
      tags: ["integracao-fiscal"],
      tasks: [
        t("Captura de foto com recorte automático", 10, ["mobile", "front-end"], ["abner"]),
        t("Upload resiliente com retentativa", 8, ["back-end"], ["sebastiao"], "andamento"),
        t("Leitura da chave de acesso da NF-e", 12, ["integracao-fiscal", "back-end"], ["kaue", "sebastiao"]),
        t("Validação do CT-e na SEFAZ", 10, ["integracao-fiscal"], ["kaue"]),
        t("Testes com notas reais anonimizadas", 6, ["testes", "integracao-fiscal"], ["aaron"]),
      ],
    },
    {
      titulo: "Fila virtual do gate",
      descricao: "Motorista acompanha a posição na fila e o tempo estimado de entrada.",
      sprint: 2,
      tags: ["tempo-real"],
      tasks: [
        t("Serviço de posição na fila", 14, ["back-end", "tempo-real"], ["sebastiao"]),
        t("Tela da fila com tempo estimado", 10, ["front-end", "mobile"], ["abner"]),
        t("Websocket de atualização da fila", 12, ["back-end", "tempo-real"], ["sebastiao", "kaue"]),
        t("Regra de prioridade para cargas perigosas", 6, ["back-end", "regras"], ["kaue"]),
        t("Teste de carga com 500 motoristas", null, ["testes", "performance"], ["aaron"]),
      ],
    },
    {
      titulo: "Histórico de viagens",
      descricao: "Lista das entregas do motorista com comprovantes.",
      sprint: 2,
      tags: ["mobile"],
      tasks: [
        t("API de histórico paginada", 8, ["back-end", "api"], ["sebastiao"]),
        t("Tela de histórico com filtros", 10, ["front-end", "mobile"], ["abner"]),
        t("Download do comprovante em PDF", 6, ["back-end"], ["kaue"]),
        t("Testes de regressão do histórico", 6, ["testes"], ["aaron"]),
      ],
    },
    {
      titulo: "Avaliação do atendimento no porto",
      descricao: "Motorista avalia a experiência ao sair; dados vão para a operação.",
      sprint: 3,
      tags: ["ux"],
      tasks: [
        t("Pesquisa de satisfação pós-saída", 6, ["front-end", "ux"], ["abner"]),
        t("Armazenar avaliações e comentários", 6, ["back-end"], ["sebastiao"]),
        t("Painel de avaliações para a operação", 10, ["front-end", "dados"], ["kaue"]),
        t("Testes de usabilidade com motoristas", 8, ["testes", "ux"], ["aaron"]),
      ],
    },
  ],

  // Basic (Epic → Task) — integração fiscal e faturamento
  IportJLNK: [
    {
      titulo: "Emissão de NFS-e dos serviços portuários",
      descricao: "Gerar a nota de serviço automaticamente ao fim de cada operação.",
      sprint: 1,
      tags: ["integracao-fiscal"],
      tasks: [
        t("Mapear serviços tributáveis por município", 8, ["integracao-fiscal", "analise"], ["kaue"], "feito"),
        t("Integração com o emissor municipal", 16, ["integracao-fiscal", "back-end"], ["kaue"], "andamento"),
        t("Cálculo de ISS por serviço", 10, ["integracao-fiscal", "regras"], ["kaue"]),
        t("Fila de reprocessamento de rejeições", 8, ["back-end"], []),
        t("Testes com o ambiente de homologação", 6, ["testes"], []),
      ],
    },
    {
      titulo: "Faturamento de armazenagem",
      descricao: "Cobrança por período de permanência do contêiner no pátio.",
      sprint: 1,
      tags: ["faturamento"],
      tasks: [
        t("Regra de períodos e franquia", 8, ["regras", "back-end"], ["kaue"]),
        t("Job diário de apuração", 10, ["back-end"], ["kaue"]),
        t("Tela de conferência do faturamento", 12, ["front-end"], []),
        t("Conciliação com o sistema contábil", null, ["integracao-fiscal"], []),
      ],
    },
    {
      titulo: "Integração com o ERP financeiro",
      descricao: "Enviar títulos a receber e baixar pagamentos automaticamente.",
      sprint: 2,
      tags: ["integracao"],
      tasks: [
        t("Contrato da API de títulos", 6, ["api", "back-end"], ["kaue"]),
        t("Envio de títulos a receber", 12, ["back-end", "integracao"], ["kaue"]),
        t("Baixa automática por retorno bancário", 14, ["back-end", "integracao"], []),
        t("Monitor de falhas de integração", 8, ["infra", "back-end"], []),
        t("Testes de conciliação", 8, ["testes"], []),
      ],
    },
    {
      titulo: "Portal de segunda via para clientes",
      descricao: "Cliente baixa notas e boletos sem pedir ao financeiro.",
      sprint: 3,
      tags: ["front-end"],
      tasks: [
        t("Login do cliente por CNPJ", 8, ["front-end", "seguranca"], []),
        t("Lista de notas e boletos", 10, ["front-end"], []),
        t("Download em lote em ZIP", 6, ["back-end"], ["kaue"]),
        t("Testes de acessibilidade do portal", 4, ["testes"], []),
      ],
    },
    {
      titulo: "Obrigações acessórias (SPED)",
      descricao: "Gerar os arquivos fiscais mensais a partir das operações.",
      sprint: 3,
      tags: ["integracao-fiscal"],
      tasks: [
        t("Layout do EFD-Reinf", 12, ["integracao-fiscal"], ["kaue"]),
        t("Geração do arquivo mensal", 10, ["integracao-fiscal", "back-end"], []),
        t("Validação no PVA da Receita", null, ["integracao-fiscal", "testes"], []),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// DevOps
// ---------------------------------------------------------------------------

type Op = { op: string; path: string; value?: unknown };
const patch = (ops: Op[]) => ({ body: ops, contentType: "application/json-patch+json" });
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface IterationNode {
  identifier: string;
  name: string;
  attributes?: { startDate?: string; finishDate?: string };
}

async function garantirSprint(projetoId: string, s: (typeof SPRINTS)[number]): Promise<IterationNode> {
  const base = `${enc(projetoId)}/_apis/wit/classificationnodes/Iterations`;
  const attributes = { startDate: `${s.inicio}T00:00:00Z`, finishDate: `${s.fim}T00:00:00Z` };
  let node: IterationNode | undefined;
  try {
    node = await azdo.request<IterationNode>("GET", `${base}/${enc(s.nome)}`);
  } catch {
    node = undefined;
  }
  if (!node) {
    node = await azdo.request<IterationNode>("POST", base, { body: { name: s.nome, attributes } });
    console.log(`  + sprint ${s.nome} (${s.inicio} → ${s.fim})`);
  } else if (node.attributes?.startDate?.slice(0, 10) !== s.inicio || node.attributes?.finishDate?.slice(0, 10) !== s.fim) {
    node = await azdo.request<IterationNode>("PATCH", `${base}/${enc(s.nome)}`, { body: { attributes } });
    console.log(`  ~ sprint ${s.nome} com datas ${s.inicio} → ${s.fim}`);
  }
  return node;
}

async function tiposDoProcesso(projetoId: string): Promise<Set<string>> {
  const r = await azdo.request<{ value: { name: string }[] }>("GET", `${enc(projetoId)}/_apis/wit/workitemtypes`);
  return new Set(r.value.map((x) => x.name));
}

async function camposDoTipo(projetoId: string, tipo: string): Promise<Set<string>> {
  const r = await azdo.request<{ value: { referenceName: string }[] }>(
    "GET",
    `${enc(projetoId)}/_apis/wit/workitemtypes/${enc(tipo)}/fields`,
  );
  return new Set(r.value.map((x) => x.referenceName));
}

async function estadosDoTipo(projetoId: string, tipo: string): Promise<{ name: string; category: string }[]> {
  return (await azdo.getWorkItemTypeStates(projetoId, tipo)) as { name: string; category: string }[];
}

async function itensDoProjeto(projetoId: string): Promise<AzdoWorkItem[]> {
  const ids = await azdo.wiqlIds(
    projetoId,
    "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project",
  );
  const out: AzdoWorkItem[] = [];
  for (const lote of chunk(ids, 200)) {
    out.push(...(await azdo.getWorkItemsBatch(lote, ["System.Id", "System.Title", "System.Tags", "System.WorkItemType"])));
  }
  return out;
}

async function popularProjeto(projeto: { id: string; name: string }, tema: RequisitoDef[]) {
  console.log(`\n▶ ${projeto.name}${RESET ? " (RESET)" : ""}`);
  const itens = await itensDoProjeto(projeto.id);
  const porTitulo = new Map(itens.map((i) => [String(i.fields["System.Title"]), i]));

  if (RESET) {
    for (const i of itens.filter((i) => String(i.fields["System.Tags"] ?? "").includes(SEED_TAG))) {
      await azdo.request("DELETE", `_apis/wit/workitems/${i.id}`);
      console.log(`  × #${i.id} ${i.fields["System.Title"]}`);
    }
    return;
  }

  const time = (await azdo.listTeams(projeto.id))[0];
  if (!time) throw new Error(`Projeto ${projeto.name} sem time`);
  const membros: AzdoTeamMember[] = await azdo.listTeamMembers(projeto.id, time.id);
  const pessoa = (p: Pessoa) => membros.find((m) => norm(m.identity.displayName ?? "").startsWith(p))?.identity;
  console.log(`  time ${time.name}: ${membros.map((m) => m.identity.displayName).join(", ")}`);

  // 1. Sprints com datas, associadas ao time
  const nodes = [];
  for (const s of SPRINTS) nodes.push(await garantirSprint(projeto.id, s));
  const doTime = await azdo.listTeamIterations(projeto.id, time.id);
  for (const n of nodes) {
    if (doTime.some((i) => i.id === n.identifier)) continue;
    await azdo.request("POST", `${enc(projeto.id)}/${enc(time.id)}/_apis/work/teamsettings/iterations`, {
      body: { id: n.identifier },
    });
    console.log(`  + ${n.name} associada ao time`);
  }

  // 2. Capacidade 6h/dia para cada membro em cada sprint
  for (const n of nodes) {
    const base = `${enc(projeto.id)}/${enc(time.id)}/_apis/work/teamsettings/iterations/${n.identifier}`;
    for (const m of membros) {
      await azdo.request("PATCH", `${base}/capacities/${m.identity.id}`, {
        body: { activities: [{ name: "Development", capacityPerDay: HORAS_DIA }], daysOff: [] },
      });
    }
  }
  console.log(`  ✓ capacidade ${HORAS_DIA}h/dia × ${membros.length} membro(s) × ${nodes.length} sprints`);

  // 3. Requisitos e tasks
  const tipos = await tiposDoProcesso(projeto.id);
  const tipoRequisito = tipos.has("Feature") ? "Feature" : "Epic";
  const camposTask = await camposDoTipo(projeto.id, "Task");
  const estadosTask = await estadosDoTipo(projeto.id, "Task");
  const estadoPor = (cat: string) => estadosTask.find((e) => e.category === cat)?.name;
  const ESTADO: Record<Estado, string | undefined> = { andamento: estadoPor("InProgress"), feito: estadoPor("Completed") };

  let criados = 0;
  for (const r of tema) {
    const iteracao = `${projeto.name}\\Sprint ${r.sprint}`;
    let reqId = porTitulo.get(r.titulo)?.id;
    if (!reqId) {
      reqId = await criar(projeto.id, tipoRequisito, [
        { op: "add", path: "/fields/System.Title", value: r.titulo },
        { op: "add", path: "/fields/System.Description", value: r.descricao },
        { op: "add", path: "/fields/System.IterationPath", value: iteracao },
        { op: "add", path: "/fields/System.Tags", value: [...r.tags, SEED_TAG].join("; ") },
      ]);
      criados++;
      console.log(`  + ${tipoRequisito} #${reqId} ${r.titulo}`);
    }

    for (const tk of r.tasks) {
      if (porTitulo.has(tk.titulo)) continue;
      const dono = tk.quem.map(pessoa).find(Boolean);
      const ops: Op[] = [
        { op: "add", path: "/fields/System.Title", value: tk.titulo },
        { op: "add", path: "/fields/System.IterationPath", value: iteracao },
        { op: "add", path: "/fields/System.Tags", value: [...tk.tags, SEED_TAG].join("; ") },
        { op: "add", path: "/fields/System.Description", value: `${tk.titulo} — parte de "${r.titulo}".` },
        {
          op: "add",
          path: "/relations/-",
          value: { rel: "System.LinkTypes.Hierarchy-Reverse", url: `${azdo.orgUrl}/_apis/wit/workItems/${reqId}` },
        },
      ];
      if (dono?.uniqueName) ops.push({ op: "add", path: "/fields/System.AssignedTo", value: dono.uniqueName });
      if (tk.horas !== null) {
        const concluidas = tk.estado === "feito" ? tk.horas : tk.estado === "andamento" ? Math.round(tk.horas / 2) : 0;
        const campo = (ref: string, value: number) => {
          if (camposTask.has(ref)) ops.push({ op: "add", path: `/fields/${ref}`, value });
        };
        campo("Microsoft.VSTS.Scheduling.OriginalEstimate", tk.horas);
        campo("Microsoft.VSTS.Scheduling.RemainingWork", tk.horas - concluidas);
        if (concluidas) campo("Microsoft.VSTS.Scheduling.CompletedWork", concluidas);
      }
      if (camposTask.has("Microsoft.VSTS.Common.Activity")) {
        ops.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Activity", value: "Development" });
      }
      const id = await criar(projeto.id, "Task", ops);
      criados++;
      // Estado em um segundo passo: o item nasce no estado inicial do processo
      const alvo = tk.estado ? ESTADO[tk.estado] : undefined;
      if (alvo) await azdo.updateWorkItem(id, [{ op: "add", path: "/fields/System.State", value: alvo }]);
      console.log(
        `    + Task #${id} ${tk.titulo}${dono ? ` → ${dono.displayName}` : " (sem dono)"}${tk.horas === null ? " · sem estimativa" : ` · ${tk.horas}h`}${alvo ? ` · ${alvo}` : ""}`,
      );
    }
  }
  console.log(`  ✓ ${criados} item(ns) criado(s)`);
}

async function criar(projetoId: string, tipo: string, ops: Op[]): Promise<number> {
  const r = await azdo.request<AzdoWorkItem>("POST", `${enc(projetoId)}/_apis/wit/workitems/$${enc(tipo)}`, patch(ops));
  return r.id;
}

async function main() {
  const projetos = (await azdo.listProjects()).filter(
    (p) => !IGNORAR.has(p.name) && (!SO_PROJETO || p.name === SO_PROJETO),
  );
  for (const p of projetos) {
    const tema = TEMAS[p.name];
    if (!tema) {
      console.warn(`\n! ${p.name}: sem tema definido em TEMAS, pulando`);
      continue;
    }
    await popularProjeto(p, tema);
  }
  console.log("\nPronto. O app recebe as mudanças pelo webhook ou pela reconciliação (até 5 min).");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
