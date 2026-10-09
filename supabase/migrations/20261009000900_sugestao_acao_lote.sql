alter table public.sugestao drop constraint sugestao_acao_valida;

alter table public.sugestao
  add constraint sugestao_acao_valida check (
    acao is null
    or (
      acao ->> 'tipo' in ('reatribuir', 'mover_sprint', 'pausar')
      and (acao ->> 'work_item_id') is not null
    )
    or (
      acao ->> 'tipo' = 'reatribuir_lote'
      and jsonb_typeof(acao -> 'itens') = 'array'
      and jsonb_array_length(acao -> 'itens') > 0
    )
  );
