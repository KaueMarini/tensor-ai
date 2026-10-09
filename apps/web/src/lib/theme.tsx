import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

export type Tema = "claro" | "escuro";

const CHAVE = "tema";

function temaAtual(): Tema {
  if (typeof document === "undefined") return "claro";
  return document.documentElement.classList.contains("dark") ? "escuro" : "claro";
}

function aplicar(tema: Tema) {
  document.documentElement.classList.toggle("dark", tema === "escuro");
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {}
}

interface ThemeCtx {
  tema: Tema;
  alternar: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaAtual);

  useEffect(() => {
    aplicar(tema);
  }, [tema]);

  const alternar = useCallback(() => {
    setTema((t) => (t === "escuro" ? "claro" : "escuro"));
  }, []);

  return <Ctx.Provider value={{ tema, alternar }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme precisa de ThemeProvider");
  return ctx;
}
