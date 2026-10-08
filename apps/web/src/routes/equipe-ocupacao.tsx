// Equipe › Ocupação: mapa pessoa × semana de todo mundo (todos os projetos somados), com
// quem está pior primeiro. Clique abre a ficha da pessoa.

import { useMemo, useState } from "react";
import { Grid3x3 } from "lucide-react";
import type { Membro } from "@/lib/membros";
import { proximasSemanas, semanas, useOcupacaoEquipe } from "@/lib/ocupacao";
import { LegendaMapa, MapaOcupacao, ordenarPorRisco } from "@/components/mapa-ocupacao";
import { STATUS_CARGA } from "@/components/carga";
import { Card, CardTitulo } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const OPCOES = [4, 8, 12] as const;
const DUAS = proximasSemanas(2);

export function OcupacaoEquipe({ membros, onAbrir }: { membros: Membro[]; onAbrir: (id: string) => void }) {
  const eq = useOcupacaoEquipe();
  const [n, setN] = useState<(typeof OPCOES)[number]>(8);
  const periodos = useMemo(() => semanas(n), [n]);

  const dados = useMemo(() => {
    if (!eq.celula) return null;
    const linhas = ordenarPorRisco(
      membros.map((m) => ({ id: m.pessoaId, nome: m.nome, subtitulo: m.projetos.map((p) => p.nome).join(", ") })),
      eq.celula,
      periodos,
    );
    const contagem = { sobrecarga: 0, limite: 0, ok: 0 };
    for (const m of membros) {
      const s = eq.celula(DUAS, m.pessoaId)?.status;
      if (s === "sobrecarga" || s === "sem-capacidade") contagem.sobrecarga++;
      else if (s === "limite") contagem.limite++;
      else if (s === "ok") contagem.ok++;
    }
    return { linhas, contagem };
  }, [eq.celula, membros, periodos]);

  return (
    <Card className="min-w-0">
      <CardTitulo
        icone={Grid3x3}
        titulo="Ocupação semana a semana"
        descricao={
          dados ? (
            <>
              Próximas 2 semanas:{" "}
              <strong style={{ color: dados.contagem.sobrecarga ? STATUS_CARGA.sobrecarga.cor : undefined }}>{dados.contagem.sobrecarga} acima</strong> ·{" "}
              {dados.contagem.limite} no limite · {dados.contagem.ok} com folga. Somando todos os projetos; clique numa pessoa para os detalhes.
            </>
          ) : (
            "Somando todos os projetos."
          )
        }
        acao={
          <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {OPCOES.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setN(x)}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium",
                  n === x ? "bg-brand-700 text-white dark:bg-brand-600" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                {x} sem.
              </button>
            ))}
          </div>
        }
      />
      <div className="border-b border-slate-100 px-5 py-2 dark:border-slate-800">
        <LegendaMapa />
      </div>
      {!dados ? (
        <div className="m-5 h-80 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      ) : dados.linhas.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Ninguém com esse filtro.</p>
      ) : (
        <div className="py-3 pr-3">
          <MapaOcupacao linhas={dados.linhas} periodos={periodos} celula={eq.celula!} nomeProjeto={eq.nomeProjeto} onAbrir={onAbrir} />
        </div>
      )}
    </Card>
  );
}
