import { useMemo, useState } from "react";
import { Grid3x3 } from "lucide-react";
import type { Membro } from "@/lib/membros";
import { meses, proximasSemanas, semanas, useOcupacaoEquipe } from "@/lib/ocupacao";
import { LegendaMapa, MapaOcupacao, ordenarPorRisco } from "@/components/mapa-ocupacao";
import { STATUS_CARGA } from "@/components/carga";
import { Card, CardTitulo } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const OPCOES = [
  { id: "4s", rotulo: "4 semanas", periodos: () => semanas(4), mensal: false },
  { id: "8s", rotulo: "8 semanas", periodos: () => semanas(8), mensal: false },
  { id: "12s", rotulo: "12 semanas", periodos: () => semanas(12), mensal: false },
  { id: "3m", rotulo: "3 meses", periodos: () => semanas(13), mensal: false },
  { id: "1a", rotulo: "1 ano", periodos: () => meses(12), mensal: true },
  { id: "2a", rotulo: "2 anos", periodos: () => meses(24), mensal: true },
] as const;
type OpcaoId = (typeof OPCOES)[number]["id"];
const DUAS = proximasSemanas(2);

export function OcupacaoEquipe({ membros, onAbrir }: { membros: Membro[]; onAbrir: (id: string) => void }) {
  const eq = useOcupacaoEquipe();
  const [opcaoId, setOpcaoId] = useState<OpcaoId>("8s");
  const opcao = OPCOES.find((o) => o.id === opcaoId)!;
  const periodos = useMemo(() => opcao.periodos(), [opcao]);

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
        titulo={opcao.mensal ? "Ocupação mês a mês" : "Ocupação semana a semana"}
        ajuda="ocupacao"
        descricao={
          dados ? (
            <>
              Próximas 2 semanas:{" "}
              <strong style={{ color: dados.contagem.sobrecarga ? STATUS_CARGA.sobrecarga.cor : undefined }}>{dados.contagem.sobrecarga} acima</strong> ·{" "}
              {dados.contagem.limite} no limite · {dados.contagem.ok} com folga. Cada célula mostra quanto do tempo da pessoa
              já está ocupado, somando todos os projetos. Clique numa pessoa para ver os detalhes.
            </>
          ) : (
            "Somando todos os projetos."
          )
        }
        acao={
          <div className="flex flex-wrap justify-end rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800/60" role="group" aria-label="Período mostrado">
            {OPCOES.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={opcaoId === o.id}
                onClick={() => setOpcaoId(o.id)}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                  opcaoId === o.id
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
                )}
              >
                {o.rotulo}
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
        <MapaOcupacao
          linhas={dados.linhas}
          periodos={periodos}
          celula={eq.celula!}
          nomeProjeto={eq.nomeProjeto}
          onAbrir={onAbrir}
          rotuloPrimeiro={opcao.mensal ? "Este mês" : "Esta semana"}
        />
      )}
    </Card>
  );
}
