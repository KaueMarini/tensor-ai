# Metodologia — motor de análise de fluxo e capacidade

> Fórmulas do serviço `services/analytics` (pasta `domain/`). Tudo aqui é **determinístico**:
> o LLM não calcula nenhum número, só escolhe uma ação candidata e redige o texto.
> Cada métrica sai com uma `Evidencia` (fórmula, entradas, resultado), que vai em
> `sugestao.payload` e é usada pelo validador para conferir o texto.

## 0. Convenções

| Item | Regra |
|---|---|
| Fuso | America/Sao_Paulo (instantes convertidos antes do cálculo) |
| Dia útil | segunda a sexta, sem feriado (`feriado`) e sem ausência da pessoa (`ausencia` + days off pessoais do DevOps) |
| Hora útil (filas/SLA) | dentro do expediente **09:00–18:00** de um dia útil (configurável) |
| Arredondamento | só em `numeros.py`, meio para cima: horas 1 casa, % sem casa, índices 2 casas |
| Tolerância do validador | ±0,1 h e ±1 p.p. |
| Semana | segunda a domingo; a janela padrão é a semana atual + 3 |

## 1. Capacidade e utilização semanal (`capacidade.py`)

Mesma cascata das telas (`_shared/capacidade/regras.ts` e `global.ts`), para que serviço e app
mostrem o mesmo número:

```
teto/dia           = jornada × foco                (regra da pessoa → regra geral → 8h × 75%)
capacidade do dia  = min( Σ_projetos h_projeto , teto )
    h_projeto      = alocação do gestor no projeto (se o projeto tem sprint no dia)
                     senão Σ Capacity do DevOps da pessoa nos times do projeto
                     (folga do time zera só a parcela daquele time)
    sem nada configurado → teto
    fim de semana, feriado, ausência da pessoa → 0
capacidade semana  = Σ capacidade do dia (dias da semana)
```

**Horas da task** (campo configurável em `analise_config.campo_horas_carga`):

| Modo | Horas |
|---|---|
| `restante` (padrão) | Remaining Work; sem ele, Original Estimate − Completed Work |
| `estimada_menos_concluida` | Original Estimate − Completed Work |
| `estimada` | Original Estimate |
| sem valor | **estimativa do sistema**: `horas_fallback_por_tag` (maior valor entre as tags) ou `horas_fallback_padrao` (4h), marcada `origem = sistema` |

Só pesam tasks **abertas, com responsável e sem filhos** (o pai já tem as horas nos filhos).

**Distribuição**: período = datas da task (start/finish) ou, sem elas, as da sprint.
`horas ÷ nº de dias disponíveis da pessoa no período` (dias úteis sem feriado e sem ausência).
Se a pessoa está ausente o período todo, cai nos dias úteis do período (vira "sem capacidade",
que é o alerta certo); se o período só tem fim de semana, vai para o último dia. A soma das
partes é sempre igual às horas da task (teste de propriedade).

```
utilização = carga_semana / capacidade_semana       (horas arredondadas antes da divisão)
status     = sem-capacidade  se capacidade = 0 e carga > 0
             sobrecarga      se utilização > limite_sobrecarga  (padrão 100%)
             limite          se utilização > limite_atencao     (padrão 80%)
             ok              caso contrário
```

**Conflito com ausência**: task aberta cujo período tem dia útil em que o responsável está
ausente. Evidência: nº de dias ausentes no período e horas da task.

## 2. Fluxo (`fluxo.py`)

**Coluna**: histórico de `System.BoardColumn` quando o item tem; senão `System.State`
(tabela `work_item_transicao`, alimentada pelos webhooks e pelo backfill de `/updates`).
Passagens anteriores ao primeiro registro são desconhecidas e não contam.

**Waiting time** (só colunas `tipo = espera` em `fluxo_config`):

```
espera(item, coluna) = Σ horas úteis de cada passagem pela coluna   (reentrada soma)
excesso              = max(0, espera − SLA da coluna)
```
A passagem em curso conta até agora. Defaults: Code Review 24 h úteis, Homologação 48 h úteis.

**Tempos** (dias corridos):

```
cycle time = última entrada em Concluído − 1ª entrada em Em andamento
lead time  = última entrada em Concluído − criação
aging      = agora − 1ª entrada em Em andamento   (item aberto em andamento)
referência = percentil 85 (interpolação linear) do cycle/lead dos concluídos;
             exige ≥ 5 amostras, senão "sem histórico"
alerta     = aging > p85 do cycle time
```

**WIP** (medida de **carga**, nunca de desempenho):

```
WIP pessoa = nº de tasks em andamento (InProgress/Resolved) atribuídas à pessoa   vs limite (3)
WIP coluna = nº de itens abertos na coluna                                         vs limite da coluna
```

## 3. Pareto das causas de atraso (`pareto.py`)

Categorias fixas, sem IA: `sla:<coluna>` (espera acima do SLA), `bloqueado` (tag de
`analise_config.tags_bloqueio` ou campo de bloqueio), `ausente` (conflito com ausência),
`sobrecarga` (task pesa numa semana em que o responsável está acima do limite),
`sem_estimativa`, `dependencia` (depende de item aberto).

```
peso(causa)     = nº de tasks abertas afetadas
ordem           = peso desc, empate por nome
% acumulado     = 100 × Σ pesos até a causa / Σ pesos         (o último é exatamente 100)
poucos vitais   = menor conjunto do topo cujo acumulado ≥ 80% (inclui a causa que cruza os 80%)
```

## 4. Esforço × Impacto (`priorizacao.py`)

Componentes normalizados por referência fixa, `n(x) = min(1, x / ref)`, para que uma ação
isolada também tenha quadrante:

```
impacto = 0,5·n(redução do pico, ref 20 p.p.) + 0,3·n(horas de atraso destravadas, ref 16 h)
        + 0,2·n(itens desbloqueados, ref 2)
esforço = 0,5·n(horas movidas, ref 24 h) + 0,3·n(reatribuições, ref 2)
        + 0,2·(1 − encaixe de skill)
alto    = ≥ 0,5
Quick Win = impacto alto e esforço baixo; Grande aposta = alto/alto;
Preenchimento = baixo/baixo; Evitar = impacto baixo e esforço alto
```

- **Redução do pico** = maior utilização semanal entre origem e destino, antes − depois (p.p.).
- **Horas de atraso destravadas** = redução de Σ max(0, carga − capacidade × limite) das
  pessoas envolvidas, + horas da task se o conflito com ausência é resolvido.
- **Encaixe** = fração das tags da task + tags da Feature pai cobertas pelas skills/função do
  destino (chave normalizada: sem acento, minúsculas, sem hífen/espaço; tags `seed-*` ignoradas).

## 5. Ações candidatas (`candidatos.py`)

Gatilhos: task de quem está em sobrecarga/sem capacidade numa semana da janela, e task em
conflito com ausência. Para cada uma:

| Ação | Regra |
|---|---|
| `reatribuir` | para pessoa do time do projeto (ordem: encaixe, depois horas livres), **descartada** se o destino passa a sobrecarga/sem capacidade em alguma semana |
| `mover_sprint` | para a próxima sprint datada do projeto; descartada se não resolve o conflito com ausência |
| `pausar` | só Priority ≥ 3 (baixa); a task sai da sprint |

Cada ação é **simulada no motor** (antes × depois) e descartada se não melhora nada. Só
Tasks (Feature/Epic nunca). `acao_id = "A-" + sha1(tipo|task|alvo)[:8]` (estável). Ordem:
Quick Wins, impacto desc, esforço asc; no máximo 8 por análise.

## 6. Pseudonimização (`anonimizacao.py`)

Pessoa → `Dev <função> <skill principal> #A` (letra pela ordem do id interno); task →
`T1, T2...`; títulos têm nomes e e-mails trocados. Nome, e-mail e ID do DevOps nunca vão ao
LLM; o mapa reverso fica só no backend, e os IDs reais só em `sugestao.acao`.
