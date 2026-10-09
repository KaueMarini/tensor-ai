// Privacidade (LGPD, privacy by design): mascaramento de dados pessoais (PII) para tudo o que
// SAI do sistema (LLM) ou vai para LOGS. Puro e testado; usado como middleware em volta de
// _lib/llm.ts (pedirJSON) e de _shared/log.ts, sem mudar quem chama.
//
//   Pessoas conhecidas (nome completo, primeiro nome, e-mail/usuário do DevOps) → [USER_01]...
//   E-mails soltos → [EMAIL_HIDDEN]   CPF → [CPF_HIDDEN]   telefone → [PHONE_HIDDEN]
//   IP em log → 189.12.xxx.xxx       e-mail em log/auditoria → k***@g***.com
// Os tokens [USER_nn] podem ser restaurados localmente na resposta (a IA nunca vê o nome).

export interface PessoaPII {
  nome: string;
  email?: string | null;
}

export interface Mascara {
  texto: string;
  /** token → valor original (só existe na memória do sistema). */
  tokens: Map<string, string>;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const TELEFONE = /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g;
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Termos que identificam a pessoa: nome completo, primeiro nome (≥ 3 letras), e-mail. */
function termosDe(p: PessoaPII): string[] {
  const nome = p.nome.trim();
  const partes = nome.split(/\s+/).filter((x) => !PARTICULAS.has(x.toLowerCase()));
  const out = [nome];
  if (partes.length > 1 && partes[0]!.length >= 3) out.push(partes[0]!);
  if (partes.length > 2) out.push(`${partes[0]} ${partes.at(-1)}`);
  if (p.email) out.push(p.email);
  return [...new Set(out.filter((t) => t.length >= 3))];
}

/**
 * Troca PII por tokens. Os nomes mais longos primeiro ("Kauê Nebot Marini" antes de "Kauê"),
 * sem diferenciar maiúsculas nem acentos.
 */
export function mascararPII(texto: string, pessoas: PessoaPII[] = []): Mascara {
  const tokens = new Map<string, string>();
  let out = texto;
  const ordem = pessoas
    .map((p, i) => ({ i, termos: termosDe(p) }))
    .flatMap(({ i, termos }) => termos.map((t) => ({ i, t })))
    .sort((a, b) => b.t.length - a.t.length);
  for (const { i, t } of ordem) {
    const token = `[USER_${String(i + 1).padStart(2, "0")}]`;
    const re = new RegExp(`(?<![\\p{L}\\d])${escapar(t)}(?![\\p{L}\\d])`, "giu");
    const reSemAcento = new RegExp(`(?<![\\p{L}\\d])${escapar(semAcento(t))}(?![\\p{L}\\d])`, "giu");
    const antes = out;
    out = out.replace(re, token);
    if (semAcento(t) !== t) out = out.replace(reSemAcento, token);
    if (out !== antes && !tokens.has(token)) tokens.set(token, pessoas[i]!.nome);
  }
  out = out.replace(EMAIL, "[EMAIL_HIDDEN]").replace(CPF, "[CPF_HIDDEN]").replace(TELEFONE, "[PHONE_HIDDEN]");
  return { texto: out, tokens };
}

/** Volta os tokens [USER_nn] para os nomes (só dentro do sistema, depois da resposta da IA). */
export function restaurarPII(texto: string, tokens: Map<string, string>): string {
  let out = texto;
  for (const [token, valor] of tokens) out = out.split(token).join(valor);
  return out;
}

/** Aplica a máscara a todas as strings de um objeto (resposta JSON do LLM, extras de log...). */
export function mapearStrings<T>(valor: T, fn: (s: string) => string): T {
  if (typeof valor === "string") return fn(valor) as T;
  if (Array.isArray(valor)) return valor.map((v) => mapearStrings(v, fn)) as T;
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, mapearStrings(v, fn)])) as T;
  }
  return valor;
}

/** "kauemarini@gmail.com" → "k***@g***.com" (auditoria e logs). */
export function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!usuario || !dominio) return "[EMAIL_HIDDEN]";
  const partes = dominio.split(".");
  const tld = partes.length > 1 ? partes.slice(1).join(".") : "";
  return `${usuario[0]}***@${partes[0]![0]}***${tld ? `.${tld}` : ""}`;
}

/** IPv4 → dois últimos octetos ocultos; IPv6 → só o prefixo /48. */
export function mascararIP(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v = ip.split(",")[0]!.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return v.split(".").slice(0, 2).join(".") + ".xxx.xxx";
  if (v.includes(":")) return v.split(":").slice(0, 3).join(":") + "::/48";
  return null;
}

/** Chaves de log que carregam dado pessoal: o valor vira um rótulo, nunca o texto. */
const CHAVES_PII = /^(usuario|usuario_email|email|pessoa|nome|responsavel|de_pessoa|para_pessoa)$/i;

/** Remove PII de extras de log (chaves conhecidas + e-mails em qualquer texto). */
export function sanitizarLog(extra: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(extra).map(([k, v]) => {
      if (CHAVES_PII.test(k) && v !== null && v !== undefined) {
        return [k, typeof v === "string" && v.includes("@") ? mascararEmail(v) : "[PII]"];
      }
      return [k, mapearStrings(v, (s) => s.replace(EMAIL, (m) => mascararEmail(m)))];
    }),
  );
}
