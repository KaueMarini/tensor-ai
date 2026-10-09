import { errorMessage, log } from "../_shared/log.ts";
import { mapearStrings, mascararPII, type PessoaPII, restaurarPII } from "../_shared/privacidade.ts";
import { env } from "./context.ts";

export interface PedidoLLM {
  sistema: string;
  mensagem: string;
  ferramenta: { nome: string; descricao: string };
  esquema: Record<string, unknown>;
  timeoutMs?: number;
}

let erro: string | null = null;
export const ultimoErroLLM = () => erro;

let pessoasPII: PessoaPII[] = [];
export function definirPessoasPII(pessoas: PessoaPII[]) {
  pessoasPII = pessoas;
}

export function provedorLLM(): "gemini" | "claude" | null {
  if (env("GEMINI_API_KEY", false)) return "gemini";
  if (env("ANTHROPIC_API_KEY", false)) return "claude";
  return null;
}

function paraGemini(esquema: unknown): unknown {
  if (Array.isArray(esquema)) return esquema.map(paraGemini);
  if (!esquema || typeof esquema !== "object") return esquema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(esquema)) {
    if (k === "enum" && Array.isArray(v) && v.some((x) => typeof x !== "string")) continue;
    if (k === "description") continue;
    out[k] = paraGemini(v);
  }
  return out;
}

async function claude<T>(p: PedidoLLM, signal: AbortSignal): Promise<T | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env("LLM_MODEL", false).startsWith("claude") ? env("LLM_MODEL") : "claude-sonnet-5-5",
      max_tokens: 4000,
      system: p.sistema,
      tools: [{ name: p.ferramenta.nome, description: p.ferramenta.descricao, input_schema: p.esquema }],
      tool_choice: { type: "tool", name: p.ferramenta.nome },
      messages: [{ role: "user", content: p.mensagem }],
    }),
  });
  if (!res.ok) {
    erro = `Claude ${res.status}: ${(await res.text()).slice(0, 200)}`;
    return null;
  }
  const json = (await res.json()) as { content?: { type: string; input?: T }[] };
  return json.content?.find((c) => c.type === "tool_use")?.input ?? null;
}

async function geminiModelo<T>(modelo: string, p: PedidoLLM, signal: AbortSignal): Promise<T | null | "ocupado"> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    signal,
    headers: { "x-goog-api-key": env("GEMINI_API_KEY"), "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: p.sistema }] },
      contents: [{ role: "user", parts: [{ text: p.mensagem }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: paraGemini(p.esquema) },
    }),
  });
  if (!res.ok) {
    erro = `Gemini ${modelo} ${res.status}: ${(await res.text()).slice(0, 200)}`;
    return res.status === 429 || res.status >= 500 ? "ocupado" : null;
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const texto = json.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";
  return JSON.parse(texto) as T;
}

async function gemini<T>(p: PedidoLLM, signal: AbortSignal): Promise<T | null> {
  const preferido = env("LLM_MODEL", false).startsWith("gemini") ? env("LLM_MODEL") : "gemini-3.5-flash";
  const reservas = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash"];
  const tentativas = [preferido, ...reservas.filter((m) => m !== preferido)];
  for (const [i, modelo] of tentativas.entries()) {
    const r = await geminiModelo<T>(modelo, p, signal);
    if (r !== "ocupado") return r;
    if (i < tentativas.length - 1) await new Promise((ok) => setTimeout(ok, 1500));
  }
  return null;
}

export async function pedirJSON<T>(p: PedidoLLM): Promise<T | null> {
  const sistema = mascararPII(p.sistema, pessoasPII);
  const mensagem = mascararPII(p.mensagem, pessoasPII);
  const tokens = new Map([...sistema.tokens, ...mensagem.tokens]);
  if (tokens.size) log("info", "LGPD: PII mascarada antes do LLM", { tokens: tokens.size });
  const r = await pedirJSONBruto<T>({ ...p, sistema: sistema.texto, mensagem: mensagem.texto });
  return r === null ? null : mapearStrings(r, (s) => restaurarPII(s, tokens));
}

async function pedirJSONBruto<T>(p: PedidoLLM): Promise<T | null> {
  const provedor = provedorLLM();
  if (!provedor) return null;
  erro = null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), p.timeoutMs ?? 60_000);
  try {
    const r = provedor === "gemini" ? await gemini<T>(p, ctrl.signal) : await claude<T>(p, ctrl.signal);
    if (r !== null) erro = null;
    else if (erro) log("warn", "LLM sem resposta", { erro });
    return r;
  } catch (err) {
    erro = errorMessage(err);
    log("warn", "LLM falhou", { erro });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
