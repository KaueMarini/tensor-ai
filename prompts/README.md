# Prompts versionados

O serviço `services/analytics` carrega `analista-fluxo.<versao>.md` (variável `VERSAO_PROMPT`,
padrão `v1`). A versão vai para `sugestao.versao_prompt` e entra no hash de idempotência.

- Mudou o texto? Crie uma versão nova (`v2`), não edite a anterior.
- Sem o arquivo da versão configurada, o serviço sobe e usa o template determinístico
  (`sugestao.usou_fallback = true`).
- A saída do LLM é JSON validado (`agent/llm.py`, `SCHEMA_RESPOSTA`):
  `{acao_id, alerta, recomendacao, justificativa: {pareto, tempo_ciclo, esforco_impacto}}`.
