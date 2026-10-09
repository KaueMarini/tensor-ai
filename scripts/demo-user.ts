import { randomBytes } from "node:crypto";

const need = (k: string) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Defina ${k} no .env.local`);
  return v;
};

const URL_BASE = need("SUPABASE_URL").replace(/\/$/, "");
const KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const email = process.env.DEMO_EMAIL?.trim() || "demo@radar-capacidade.dev";
const senhaInformada = process.env.DEMO_PASSWORD?.trim();
const senha = senhaInformada || randomBytes(9).toString("base64url");

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function admin<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${URL_BASE}/auth/v1/admin${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

interface User {
  id: string;
  email?: string;
}

const { users } = await admin<{ users: User[] }>("GET", "/users?per_page=1000");
const existente = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (!existente) {
  await admin("POST", "/users", {
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome: "Gestor (demo)" },
  });
  console.log(`Usuário de demo criado: ${email}`);
} else if (senhaInformada) {
  await admin("PUT", `/users/${existente.id}`, { password: senha });
  console.log(`Usuário de demo já existia; senha atualizada: ${email}`);
} else {
  console.log(`Usuário de demo já existe: ${email} (defina DEMO_PASSWORD para trocar a senha)`);
  process.exit(0);
}

if (!senhaInformada) {
  console.log(`Senha gerada: ${senha}`);
  console.log("Guarde no .env.local:\n  DEMO_EMAIL=" + email + "\n  DEMO_PASSWORD=" + senha);
}
