import { createAzdoClient } from "../supabase/functions/_shared/azdo/client.ts";
import { AzdoHttpError } from "../supabase/functions/_shared/azdo/client.ts";

const need = (k: string) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Defina ${k} no .env.local`);
  return v;
};
const azdo = createAzdoClient({ orgUrl: need("AZDO_ORG_URL"), pat: need("AZDO_PAT") });
const DRY = process.argv.includes("--dry");
const EXCLUIR_AGORA = process.argv.includes("--excluir");

interface Definicao {
  nome: string;
  descricao: string;
  tags: string[];
}

const PROJETOS: Record<string, Definicao> = {
  "badd3c28-2533-4e04-9239-e79fa7f520f0": {
    nome: "Atlântico Docas",
    descricao:
      "Plataforma do terminal portuário para agendamento de janelas de carga e descarga, painel do pátio em tempo real " +
      "e integração fiscal (NF-e e CT-e com a SEFAZ). Usuários: transportadoras e equipe de operação do pátio. " +
      "Front em React, APIs com websockets, SQL e indicadores em Power BI. Prioridades: confiabilidade no gate e " +
      "tempo de resposta do agendamento.",
    tags: ["agendamento", "patio", "tempo-real", "integracao-fiscal", "front-end", "back-end", "dados"],
  },
  "dbb885fc-cab5-4bc8-85d8-70da870e7b74": {
    nome: "Rota Certa",
    descricao:
      "Aplicativo mobile para motoristas de caminhão: check-in no porto por QR code, envio dos documentos da carga pelo " +
      "celular, fila virtual do gate e histórico de viagens. Uso em campo com rede instável — acessibilidade, modo " +
      "offline e testes em dispositivos reais são críticos.",
    tags: ["mobile", "front-end", "back-end", "tempo-real", "integracao-fiscal", "ux", "testes"],
  },
  "a8f446dd-64fb-44a7-a32c-10fe9584e646": {
    nome: "Maré Assistente",
    descricao:
      "Assistente virtual no Microsoft Teams para transportadoras e armadores consultarem e remarcarem agendamentos. " +
      "Construído em Copilot Studio, com conectores da Power Platform, base de conhecimento no SharePoint e painel de " +
      "atendimento em Power BI. Atende em português, inglês e espanhol.",
    tags: ["copilot-studio", "power-platform", "ia", "dados", "power-bi", "documentacao", "testes"],
  },
};

const EXCLUIR = ["569342a3-1d76-4c48-8f9e-e8c635bb13d3"];

const textoDescricao = (d: Definicao) => `${d.descricao}\n\nTags: ${d.tags.join(", ")}`;

async function aguardar(op: { id: string; url?: string }) {
  for (let i = 0; i < 60; i++) {
    const s = await azdo.request<{ status: string; resultMessage?: string }>("GET", `_apis/operations/${op.id}`);
    if (s.status === "succeeded") return;
    if (s.status === "failed" || s.status === "cancelled") throw new Error(s.resultMessage ?? `operação ${s.status}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("operação demorou demais");
}

function explicar(err: unknown): never {
  if (err instanceof AzdoHttpError && (err.status === 401 || err.status === 403)) {
    throw new Error(
      "O PAT não pode alterar projetos. Gere um token com o escopo \"Project and Team: Read, write & manage\" " +
        "(dev.azure.com → User settings → Personal access tokens), atualize AZDO_PAT no .env.local e em " +
        "supabase/.env.functions e rode `npx supabase secrets set --env-file supabase/.env.functions`.",
    );
  }
  throw err;
}

async function main() {
  const todos = await azdo.listProjects();
  for (const [id, def] of Object.entries(PROJETOS)) {
    const atual = todos.find((p) => p.id === id);
    if (!atual) {
      console.warn(`! projeto ${id} não existe na org`);
      continue;
    }
    const detalhe = await azdo.getProject(id);
    const patch: { name?: string; description?: string } = {};
    if (detalhe.name !== def.nome) patch.name = def.nome;
    if ((detalhe.description ?? "").trim() !== textoDescricao(def)) patch.description = textoDescricao(def);
    if (!patch.name && !patch.description) {
      console.log(`= ${def.nome}: já está certo`);
      continue;
    }
    console.log(`${DRY ? "(dry) " : ""}~ ${detalhe.name}${patch.name ? ` → ${patch.name}` : ""}${patch.description ? " · descrição e tags" : ""}`);
    if (DRY) continue;
    try {
      await aguardar(await azdo.request<{ id: string }>("PATCH", `_apis/projects/${id}`, { body: patch }));
    } catch (err) {
      explicar(err);
    }
  }

  for (const id of EXCLUIR) {
    const atual = todos.find((p) => p.id === id);
    if (!atual) {
      console.log(`= ${id}: já não existe`);
      continue;
    }
    if (!EXCLUIR_AGORA) {
      console.log(`  ${atual.name} está marcado para exclusão — rode com --excluir para excluir`);
      continue;
    }
    console.log(`${DRY ? "(dry) " : ""}× excluindo ${atual.name} (vai para a lixeira do DevOps)`);
    if (DRY) continue;
    try {
      await aguardar(await azdo.request<{ id: string }>("DELETE", `_apis/projects/${id}`));
    } catch (err) {
      explicar(err);
    }
  }
  console.log("\nPronto. A reconciliação (cron de 5 min) ou `devops-sync` aplica no app.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
