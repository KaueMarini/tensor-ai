import { cn, corAvatar, iniciais } from "@/lib/utils";

const TAMANHOS = { xs: "size-6 text-[9px]", sm: "size-7 text-[10px]", md: "size-10 text-xs", lg: "size-14 text-base" };

export function Avatar({ nome, tamanho = "md", className }: { nome: string; tamanho?: keyof typeof TAMANHOS; className?: string }) {
  return (
    <span
      title={nome}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-white dark:ring-slate-900",
        TAMANHOS[tamanho],
        corAvatar(nome),
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  );
}

/** Quadrado com a inicial do projeto (cor estável pelo nome). */
export function MarcaProjeto({ nome, className }: { nome: string; className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg font-semibold text-white shadow-sm",
        corAvatar(nome),
        className ?? "size-9 text-sm",
      )}
    >
      {nome.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
