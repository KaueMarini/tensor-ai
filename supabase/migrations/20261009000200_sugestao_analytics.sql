-- Sugestões geradas pelo serviço de análise (services/analytics). Sempre nascem 'pendente':
-- a IA sugere, o gestor decide. O texto exibido (markdown) usa pseudônimos; os IDs reais
-- ficam só em `acao`, que é o que o executor vai aplicar no DevOps depois da aprovação.
--
-- acao = { tipo: 'reatribuir' | 'mover_sprint' | 'pausar', work_item_id,
--          de_pessoa_id, para_pessoa_id?, para_sprint_id? }

alter table public.sugestao
  add column projeto_id      uuid references public.projeto(id) on delete cascade,
  add column origem          text check (origem in ('evento', 'sweep')),
  add column markdown        text,
  add column acao            jsonb,
  add column impacto_antes   jsonb,
  add column impacto_depois  jsonb,
  add column versao_prompt   text,
  add column hash_payload    text,
  add column usou_fallback   boolean not null default false,
  add constraint sugestao_acao_valida check (
    acao is null or (
      acao ->> 'tipo' in ('reatribuir', 'mover_sprint', 'pausar')
      and (acao ->> 'work_item_id') is not null
    )
  );

-- Idempotência: o mesmo estado analisado não gera duas sugestões pendentes
create unique index sugestao_hash_pendente
  on public.sugestao (hash_payload) where status = 'pendente' and hash_payload is not null;
create index on public.sugestao (projeto_id, criada_em desc);
create index on public.sugestao (status, criada_em desc);

-- O front recebe as sugestões novas sozinho
alter publication supabase_realtime add table public.sugestao;
