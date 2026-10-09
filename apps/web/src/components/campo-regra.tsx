import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "").replace(".", ","));

export function CampoRegra({
  valor,
  herdado,
  unidade,
  min,
  max,
  onSalvar,
  rotulo,
  obrigatorio,
  className,
}: {
  valor: number | null;
  herdado?: number;
  unidade: "h" | "%";
  min: number;
  max: number;
  onSalvar: (v: number | null) => void;
  rotulo: string;
  obrigatorio?: boolean;
  className?: string;
}) {
  const escala = unidade === "%" ? 100 : 1;
  const exibir = (v: number | null) => (v === null ? "" : fmt(v * escala));
  const [texto, setTexto] = useState(exibir(valor));
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => setTexto(exibir(valor)), [valor]);

  function salvar() {
    const limpo = texto.trim().replace(",", ".");
    if (limpo === "") {
      if (obrigatorio) return setTexto(exibir(valor));
      setErro(null);
      if (valor !== null) onSalvar(null);
      return;
    }
    const n = Number(limpo);
    if (!Number.isFinite(n) || n < min || n > max) {
      setErro(`Entre ${fmt(min)} e ${fmt(max)}${unidade}`);
      return;
    }
    setErro(null);
    const novo = Math.round((n / escala) * 1000) / 1000;
    if (valor === null || Math.abs(novo - valor) > 1e-9) onSalvar(novo);
  }

  const proprio = valor !== null;
  return (
    <div className={cn("relative min-w-[84px] shrink-0", className)}>
      <div
        className={cn(
          "flex h-8 items-center rounded-md border bg-white text-sm shadow-xs focus-within:ring-3 dark:bg-slate-900",
          erro
            ? "border-red-400 focus-within:ring-red-500/15"
            : proprio
              ? "border-brand-400 focus-within:border-brand-600 focus-within:ring-brand-600/15 dark:border-brand-600"
              : "border-slate-200 focus-within:border-brand-600 focus-within:ring-brand-600/15 dark:border-slate-700",
        )}
      >
        <input
          aria-label={rotulo}
          inputMode="decimal"
          value={texto}
          placeholder={herdado !== undefined ? fmt(herdado * escala) : "—"}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setTexto(exibir(valor));
              setErro(null);
            }
          }}
          className={cn(
            "h-full w-full min-w-0 bg-transparent pl-2 text-right tabular-nums outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500",
            proprio ? "font-semibold text-brand-800 dark:text-brand-200" : "text-slate-800",
          )}
        />
        <span className="pr-2 pl-0.5 text-xs text-slate-400">{unidade}</span>
        {proprio && !obrigatorio && (
          <button
            type="button"
            title="Voltar a herdar"
            aria-label={`Limpar ${rotulo}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setTexto("");
              setErro(null);
              onSalvar(null);
            }}
            className="mr-1 grid size-5 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      {erro && <p className="absolute top-full right-0 z-10 mt-0.5 text-[10px] whitespace-nowrap text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
