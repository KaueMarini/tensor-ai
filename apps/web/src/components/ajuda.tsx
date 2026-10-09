import { BookOpen, CircleHelp } from "lucide-react";
import { GLOSSARIO, type TermoGlossario } from "@/lib/glossario";
import { cn } from "@/lib/utils";
import { Popover } from "@/components/ui/popover";

export function Ajuda({ termo, texto, className }: { termo?: TermoGlossario; texto?: string; className?: string }) {
  const item = termo ? GLOSSARIO[termo] : null;
  return (
    <Popover
      className={cn("inline-flex align-middle", className)}
      rotulo={item ? `O que é ${item.termo}?` : "Ajuda"}
      alinhar="esquerda"
      painelClassName="w-[min(18rem,calc(100vw-2rem))] p-3"
      gatilho={() => (
        <span className="grid size-4 place-items-center rounded-full text-slate-400 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200">
          <CircleHelp className="size-3.5" />
        </span>
      )}
    >
      {item && <div className="mb-1 text-xs font-semibold text-slate-900 dark:text-slate-100">{item.termo}</div>}
      <p className="text-xs leading-relaxed font-normal text-slate-600 normal-case dark:text-slate-300">{item?.texto ?? texto}</p>
    </Popover>
  );
}

export function Glossario() {
  return (
    <Popover
      rotulo="Ajuda: o que significa cada termo"
      painelClassName="w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden"
      gatilho={(aberto) => (
        <span
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
            aberto && "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
          )}
        >
          <CircleHelp className="size-5" /> <span className="hidden sm:inline">Ajuda</span>
        </span>
      )}
    >
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <BookOpen className="size-4 text-slate-400" /> O que significa cada termo
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">As palavras que aparecem no sistema, explicadas.</p>
      </div>
      <dl className="max-h-[min(30rem,calc(100vh-8rem))] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
        {Object.values(GLOSSARIO).map((g) => (
          <div key={g.termo} className="px-4 py-2.5">
            <dt className="text-sm font-medium text-slate-800 dark:text-slate-100">{g.termo}</dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{g.texto}</dd>
          </div>
        ))}
      </dl>
    </Popover>
  );
}
