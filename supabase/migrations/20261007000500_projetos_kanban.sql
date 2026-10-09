create extension if not exists pg_trgm with schema extensions;
create index if not exists projeto_nome_trgm on public.projeto using gin (nome extensions.gin_trgm_ops);

create view public.v_projeto_resumo with (security_invoker = true) as
select p.id,
       p.nome,
       p.descricao,
       p.processo,
       (select count(*) from public.work_item w
         where w.projeto_id = p.id and w.deleted_at is null and w.tipo not in ('Feature','Epic'))::int as n_itens,
       (select count(*) from public.work_item w
         where w.projeto_id = p.id and w.deleted_at is null and w.tipo = 'Feature')::int as n_features,
       (select count(distinct tm.pessoa_id) from public.time_membro tm
          join public.time t on t.id = tm.time_id
         where t.projeto_id = p.id and tm.ativo)::int as n_membros,
       (select s.nome from public.sprint s
         where s.projeto_id = p.id and s.deleted_at is null and current_date between s.inicio and s.fim
         order by s.inicio limit 1) as sprint_atual,
       ss.ultima_reconciliacao_em,
       ss.fase as sync_fase
  from public.projeto p
  left join public.sync_state ss on ss.projeto_id = p.id;

create or replace view public.v_membros with (security_invoker = true) as
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
       coalesce(ft.tags, '[]'::jsonb) as tags,
       pr.nome as projeto_nome
  from public.pessoa p
  join public.time_membro tm on tm.pessoa_id = p.id
  join public.time t on t.id = tm.time_id
  join public.projeto pr on pr.id = t.projeto_id
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

create table public.acao (
  id             bigint generated always as identity primary key,
  tipo           text not null,
  projeto_id     uuid references public.projeto(id) on delete set null,
  devops_id      integer,
  antes          jsonb,
  depois         jsonb,
  status         text not null check (status in ('aplicada','erro')),
  erro           text,
  usuario_id     uuid references auth.users(id) on delete set null,
  usuario_email  text,
  criado_em      timestamptz not null default now()
);
create index on public.acao (projeto_id, criado_em desc);
create index on public.acao (devops_id);

alter table public.acao enable row level security;
create policy "leitura_autenticados" on public.acao for select to authenticated using (true);

alter table public.work_item drop constraint if exists work_item_sync_origem_check;
alter table public.work_item add constraint work_item_sync_origem_check
  check (sync_origem in ('webhook','reconcile','full','app'));
