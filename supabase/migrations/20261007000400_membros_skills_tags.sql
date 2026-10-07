-- Seção Membros: skills (reaproveita skill_tag, já existente) + catálogo de tags
-- de função (novo, editável pelo gestor) + view agregada pro front.

-- =====================================================================
-- Catálogo de tags de função (Desenvolvedor, Tech Lead, QA...)
-- Gestor cria/renomeia/remove livremente; não é lista fixa no código.
-- =====================================================================
create table public.funcao_tag (
  id         bigint generated always as identity primary key,
  nome       text not null unique,
  criado_em  timestamptz not null default now()
);

create table public.pessoa_funcao_tag (
  pessoa_id      uuid not null references public.pessoa(id) on delete cascade,
  funcao_tag_id  bigint not null references public.funcao_tag(id) on delete cascade,
  criado_em      timestamptz not null default now(),
  primary key (pessoa_id, funcao_tag_id)
);
create index on public.pessoa_funcao_tag (funcao_tag_id);

alter table public.funcao_tag enable row level security;
alter table public.pessoa_funcao_tag enable row level security;

create policy "leitura_autenticados" on public.funcao_tag
  for select to authenticated using (true);
create policy "leitura_autenticados" on public.pessoa_funcao_tag
  for select to authenticated using (true);

-- Dados locais (não tocam no DevOps). Ainda não existe um segundo nível de
-- permissão no app (todo usuário autenticado é o gestor hoje), então a escrita
-- segue o mesmo padrão de confiança já usado na leitura das demais tabelas.
create policy "gestor_escreve_funcao_tag" on public.funcao_tag
  for all to authenticated using (true) with check (true);
create policy "gestor_escreve_pessoa_funcao_tag" on public.pessoa_funcao_tag
  for all to authenticated using (true) with check (true);

-- skill_tag já existia (schema inicial) com o propósito de guardar skills por
-- pessoa (origem 'ia'|'gestor'); só faltava permissão de escrita para o gestor
-- gerenciar direto pelo front (hoje só service_role conseguia gravar via RPC).
create policy "gestor_escreve_skill_tag" on public.skill_tag
  for all to authenticated using (true) with check (true);

-- =====================================================================
-- View agregada pro front: uma linha por pessoa x time, com projeto_id direto
-- e skills/tags já como jsonb array (mesmo padrão de v_backlog).
-- =====================================================================
create view public.v_membros with (security_invoker = true) as
select p.id as pessoa_id,
       p.nome,
       p.unique_name,
       p.papel,
       p.horas_semana_base,
       t.id as time_id,
       t.nome as time_nome,
       t.projeto_id,
       tm.ativo,
       coalesce(sk.skills, '[]'::jsonb) as skills,
       coalesce(ft.tags, '[]'::jsonb) as tags
  from public.pessoa p
  join public.time_membro tm on tm.pessoa_id = p.id
  join public.time t on t.id = tm.time_id
  left join lateral (
    select jsonb_agg(jsonb_build_object('tag', s.tag) order by s.tag) as skills
      from public.skill_tag s
     where s.pessoa_id = p.id
  ) sk on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome) order by f.nome) as tags
      from public.pessoa_funcao_tag pft
      join public.funcao_tag f on f.id = pft.funcao_tag_id
     where pft.pessoa_id = p.id
  ) ft on true;

-- =====================================================================
-- Realtime
-- =====================================================================
alter publication supabase_realtime add table
  public.funcao_tag, public.pessoa_funcao_tag, public.skill_tag;
