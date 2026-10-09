import { errorMessage, log } from "../_shared/log.ts";
import { createDb, type Db, jsonResponse } from "./context.ts";

export type Papel = "admin" | "gestor" | "membro";

export async function papelDe(db: Db, userId: string): Promise<Papel> {
  const { data } = await db.from("usuario_papel").select("papel").eq("user_id", userId).maybeSingle();
  return (data?.papel as Papel | undefined) ?? "membro";
}

async function usuarioDoToken(db: Db, req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
}

export async function auditar(db: Db, a: { acao: string; recurso?: string | null; detalhe?: unknown; userId?: string | null; papel?: string | null; req?: Request }) {
  const { error } = await db.rpc("registrar_auditoria", {
    p_acao: a.acao,
    p_recurso: a.recurso ?? undefined,
    p_detalhe: (a.detalhe ?? undefined) as never,
    p_ator: a.userId ?? undefined,
    p_ip: a.req?.headers.get("x-forwarded-for") ?? a.req?.headers.get("x-real-ip") ?? undefined,
    p_papel: a.papel ?? undefined,
  });
  if (error) log("warn", "auditoria falhou", { erro: error.message });
}

export function protegido(
  nome: string,
  papeis: Papel[],
  handler: (req: Request) => Promise<Response>,
  acoesLivres: string[] = [],
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return handler(req);
    const db = createDb();
    const user = await usuarioDoToken(db, req);
    if (!user) return handler(req);

    const papel = await papelDe(db, user.id);
    const corpo = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof corpo.acao === "string" && acoesLivres.includes(corpo.acao)) return handler(req);
    const acao = `${nome}:${typeof corpo.acao === "string" ? corpo.acao : typeof corpo.mode === "string" ? corpo.mode : "chamada"}`;
    const recurso = [corpo.devops_id, corpo.sugestao_id, corpo.projeto_id].find((x) => x !== undefined && x !== null);

    if (!papeis.includes(papel)) {
      await auditar(db, { acao: `${acao}:negado`, recurso: recurso ? String(recurso) : null, userId: user.id, papel, req });
      return jsonResponse({ error: "Acesso restrito a gestores." }, 403);
    }
    let res: Response;
    try {
      res = await handler(req);
    } catch (err) {
      await auditar(db, { acao: `${acao}:erro`, recurso: recurso ? String(recurso) : null, detalhe: { erro: errorMessage(err).slice(0, 200) }, userId: user.id, papel, req });
      throw err;
    }
    await auditar(db, { acao, recurso: recurso ? String(recurso) : null, detalhe: { status: res.status }, userId: user.id, papel, req });
    return res;
  };
}
