import { type FormEvent, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      setErro(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
      return;
    }
    await navigate({ to: "/" });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <PainelMarca />

      <div className="grid place-items-center bg-white px-4 py-12 dark:bg-slate-950">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Logo className="size-11" />
            <h1 className="mt-4 text-xl font-semibold tracking-tight dark:text-slate-100">Radar de Capacidade</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Disponibilidade real do time, direto do Azure DevOps.
            </p>
          </div>
          <div className="mb-6 hidden lg:block">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Entrar</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Use suas credenciais de gestor.</p>
          </div>
          <form
            onSubmit={entrar}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">E-mail</span>
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Senha</span>
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </label>
            {erro && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{erro}</p>
            )}
            <Button type="submit" className="w-full" disabled={carregando}>
              {carregando && <Loader2 className="size-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function PainelMarca() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 20% 15%, var(--color-brand-500), transparent 55%), radial-gradient(circle at 85% 85%, var(--color-brand-600), transparent 50%)",
        }}
      />
      <div className="relative flex items-center gap-2.5">
        <Logo className="size-8" />
        <span className="text-sm font-semibold tracking-tight">Radar de Capacidade</span>
      </div>

      <div className="relative max-w-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Veja a disponibilidade real do seu time antes que vire um problema.
        </h1>
        <p className="mt-4 text-sm text-brand-100/80">
          Sincronizado direto do Azure DevOps: carga por pessoa, habilidades, ausências e
          sobrecarga — tudo em um só lugar, com um clique até a ação.
        </p>
      </div>

      <p className="relative text-xs text-brand-100/60">iPORT Solutions · Hackathon</p>
    </div>
  );
}
