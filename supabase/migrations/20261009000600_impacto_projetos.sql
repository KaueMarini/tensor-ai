-- Importância (impacto) dos projetos, para o agente comparar ESFORÇO × IMPACTO.
-- Escala 1 = baixo, 2 = médio, 3 = alto. Fontes, nesta ordem de precedência:
--   gestor  (projeto_avaliacao.impacto_gestor, definido no app)
--   devops  (projeto.impacto_devops, linha "Impacto: alto|médio|baixo" na descrição do projeto)
--   ia      (projeto_avaliacao.impacto_ia, estimado pelo agente a partir da descrição;
--            aparece como "sugerido pela IA" até o gestor confirmar)

alter table public.projeto add column impacto_devops smallint check (impacto_devops between 1 and 3);

create table public.projeto_avaliacao (
  projeto_id          uuid primary key references public.projeto on delete cascade,
  impacto_gestor      smallint check (impacto_gestor between 1 and 3),
  impacto_ia          smallint check (impacto_ia between 1 and 3),
  justificativa_ia    text,
  ia_avaliado_em      timestamptz,
  atualizado_por      uuid references auth.users on delete set null,
  atualizado_em       timestamptz not null default now()
);

create trigger trg_atualizado before insert or update on public.projeto_avaliacao
  for each row execute function public.set_atualizado_por();

alter table public.projeto_avaliacao enable row level security;
create policy "leitura_autenticados" on public.projeto_avaliacao for select to authenticated using (true);
create policy "gestor_escreve" on public.projeto_avaliacao for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.projeto_avaliacao;
