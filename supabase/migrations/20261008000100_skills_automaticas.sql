create extension if not exists unaccent with schema extensions;

alter table public.skill_tag drop constraint if exists skill_tag_origem_check;
alter table public.skill_tag add constraint skill_tag_origem_check check (origem in ('ia', 'gestor', 'tasks'));
alter table public.skill_tag
  add column if not exists evidencias    integer not null default 0,
  add column if not exists horas         numeric,
  add column if not exists rejeitada     boolean not null default false,
  add column if not exists atualizado_em timestamptz not null default now();

create or replace function public.skill_chave(p_tag text)
returns text language sql stable set search_path = public, extensions as $$
  select regexp_replace(lower(extensions.unaccent(btrim(p_tag))), '[^a-z0-9]+', '', 'g');
$$;

create or replace function public.recalcular_skills(p_pessoas uuid[])
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare
  v_min_tasks constant integer := 2;
  n integer := 0;
  k integer;
begin
  if p_pessoas is null or cardinality(p_pessoas) = 0 then return 0; end if;

  drop table if exists _skill_ev;
  create temp table _skill_ev on commit drop as
  with itens as (
    select w.devops_id, w.responsavel_id as pessoa_id,
           coalesce(w.horas_estimadas, w.horas_concluidas, w.horas_restantes, 0) as h,
           coalesce(w.tags, '{}') || coalesce(f.tags, '{}') as tags
      from work_item w
      left join work_item f on f.devops_id = w.feature_devops_id and f.deleted_at is null
     where w.deleted_at is null
       and w.tipo not in ('Feature', 'Epic')
       and w.responsavel_id = any(p_pessoas)
  ), por_task as (
    select distinct on (i.pessoa_id, skill_chave(t), i.devops_id)
           i.pessoa_id, skill_chave(t) as chave, btrim(t) as tag, i.devops_id, i.h
      from itens i, unnest(i.tags) t
     where btrim(t) <> '' and btrim(t) !~* '^seed-' and skill_chave(t) <> ''
  )
  select pessoa_id, chave,
         mode() within group (order by tag) as tag,
         count(*)::integer as n,
         sum(h) as horas
    from por_task
   group by pessoa_id, chave;

  update skill_tag s
     set evidencias = e.n,
         horas = e.horas,
         confianca = case when s.origem = 'tasks' then least(1, round(e.n / 5.0, 2)) else s.confianca end,
         atualizado_em = now()
    from _skill_ev e
   where s.pessoa_id = e.pessoa_id and skill_chave(s.tag) = e.chave
     and (s.evidencias, s.horas) is distinct from (e.n, e.horas);
  get diagnostics k = row_count; n := n + k;

  insert into skill_tag (pessoa_id, tag, origem, confianca, confirmada, evidencias, horas)
  select e.pessoa_id, e.tag, 'tasks', least(1, round(e.n / 5.0, 2)), false, e.n, e.horas
    from _skill_ev e
   where e.n >= v_min_tasks
     and not exists (select 1 from skill_tag s where s.pessoa_id = e.pessoa_id and skill_chave(s.tag) = e.chave);
  get diagnostics k = row_count; n := n + k;

  delete from skill_tag s
   where s.pessoa_id = any(p_pessoas)
     and s.origem = 'tasks' and not s.confirmada and not s.rejeitada
     and not exists (select 1 from _skill_ev e
                      where e.pessoa_id = s.pessoa_id and e.chave = skill_chave(s.tag) and e.n >= v_min_tasks);
  get diagnostics k = row_count; n := n + k;

  update skill_tag s
     set evidencias = 0, horas = null, atualizado_em = now()
   where s.pessoa_id = any(p_pessoas) and s.evidencias > 0
     and not exists (select 1 from _skill_ev e where e.pessoa_id = s.pessoa_id and e.chave = skill_chave(s.tag));
  get diagnostics k = row_count; n := n + k;

  return n;
end $$;

revoke execute on function public.recalcular_skills(uuid[]) from public, anon, authenticated;
grant execute on function public.recalcular_skills(uuid[]) to service_role;

create or replace function public.tg_work_item_skills()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pessoas uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct responsavel_id) into v_pessoas
      from novos where responsavel_id is not null and tipo not in ('Feature', 'Epic');
  else
    with mudou as (
      select n.devops_id, n.tipo, n.responsavel_id as novo, v.responsavel_id as velho
        from novos n join velhos v using (devops_id)
       where (n.tags, n.responsavel_id, n.deleted_at, n.tipo, n.feature_devops_id, n.horas_estimadas)
             is distinct from
             (v.tags, v.responsavel_id, v.deleted_at, v.tipo, v.feature_devops_id, v.horas_estimadas)
    )
    select array_agg(distinct p) into v_pessoas from (
      select novo as p from mudou where tipo not in ('Feature', 'Epic')
      union select velho from mudou where tipo not in ('Feature', 'Epic')
      union select w.responsavel_id from work_item w
             join mudou m on m.tipo in ('Feature', 'Epic') and w.feature_devops_id = m.devops_id
    ) x where p is not null;
  end if;
  if v_pessoas is not null then perform recalcular_skills(v_pessoas); end if;
  return null;
end $$;

drop trigger if exists work_item_skills_ins on public.work_item;
drop trigger if exists work_item_skills_upd on public.work_item;
create trigger work_item_skills_ins after insert on public.work_item
  referencing new table as novos
  for each statement execute function public.tg_work_item_skills();
create trigger work_item_skills_upd after update on public.work_item
  referencing new table as novos old table as velhos
  for each statement execute function public.tg_work_item_skills();

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
    select jsonb_agg(
             jsonb_build_object(
               'tag', s.tag, 'origem', s.origem, 'confirmada', s.confirmada,
               'rejeitada', s.rejeitada, 'evidencias', s.evidencias)
             order by s.confirmada desc, s.evidencias desc, s.tag) as skills
      from public.skill_tag s
     where s.pessoa_id = p.id
  ) sk on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome) order by f.nome) as tags
      from public.pessoa_funcao_tag pft
      join public.funcao_tag f on f.id = pft.funcao_tag_id
     where pft.pessoa_id = p.id
  ) ft on true;

select public.recalcular_skills(array(select id from public.pessoa));
