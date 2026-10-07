// Dark mode via classe `.dark` no <html>. Preferência salva em localStorage; sem
// preferência salva, cai no prefers-color-scheme do sistema. Script inline em
// index.html já aplica a classe antes do React montar (evita flash).

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
  } catch {
    // Storage indisponível (modo privado etc.): a preferência só não persiste.
  }
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
