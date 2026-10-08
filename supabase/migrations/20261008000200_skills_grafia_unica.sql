-- Grafia única das skills entre pessoas: "back-end" e "backend" eram unificados por pessoa,
-- mas cada pessoa podia ficar com uma grafia. Agora a sugestão nova adota a grafia mais usada
-- no time para a mesma skill, e as sugestões atuais são normalizadas.

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
    -- uma linha por pessoa × skill × task (variações da mesma tag contam uma vez)
    select distinct on (i.pessoa_id, skill_chave(t), i.devops_id)
           i.pessoa_id, skill_chave(t) as chave, btrim(t) as tag, i.devops_id, i.h
      from itens i, unnest(i.tags) t
     where btrim(t) <> '' and btrim(t) !~* '^seed-' and skill_chave(t) <> ''
  )
  select pessoa_id, chave,
         mode() within group (order by tag) as tag,   -- grafia mais comum
         count(*)::integer as n,
         sum(h) as horas
    from por_task
   group by pessoa_id, chave;

  -- 1. Atualiza a evidência de quem já tem a skill (qualquer origem)
  update skill_tag s
     set evidencias = e.n,
         horas = e.horas,
         confianca = case when s.origem = 'tasks' then least(1, round(e.n / 5.0, 2)) else s.confianca end,
         atualizado_em = now()
    from _skill_ev e
   where s.pessoa_id = e.pessoa_id and skill_chave(s.tag) = e.chave
     and (s.evidencias, s.horas) is distinct from (e.n, e.horas);
  get diagnostics k = row_count; n := n + k;

  -- 2. Sugere skills novas (com a grafia que o time já usa)
  insert into skill_tag (pessoa_id, tag, origem, confianca, confirmada, evidencias, horas)
  select e.pessoa_id, coalesce(g.tag, e.tag), 'tasks', least(1, round(e.n / 5.0, 2)), false, e.n, e.horas
    from _skill_ev e
    left join lateral (
      -- grafia já usada no time para a mesma skill (ex.: todos com "back-end")
      select s2.tag from skill_tag s2 where skill_chave(s2.tag) = e.chave
       group by s2.tag order by count(*) desc, s2.tag limit 1
    ) g on true
   where e.n >= v_min_tasks
     and not exists (select 1 from skill_tag s where s.pessoa_id = e.pessoa_id and skill_chave(s.tag) = e.chave);
  get diagnostics k = row_count; n := n + k;

  -- 3. Sugestões que perderam a evidência somem (as confirmadas e as descartadas ficam)
  delete from skill_tag s
   where s.pessoa_id = any(p_pessoas)
     and s.origem = 'tasks' and not s.confirmada and not s.rejeitada
     and not exists (select 1 from _skill_ev e
                      where e.pessoa_id = s.pessoa_id and e.chave = skill_chave(s.tag) and e.n >= v_min_tasks);
  get diagnostics k = row_count; n := n + k;

  -- 4. Quem ficou sem nenhuma evidência zera a contagem
  update skill_tag s
     set evidencias = 0, horas = null, atualizado_em = now()
   where s.pessoa_id = any(p_pessoas) and s.evidencias > 0
     and not exists (select 1 from _skill_ev e where e.pessoa_id = s.pessoa_id and e.chave = skill_chave(s.tag));
  get diagnostics k = row_count; n := n + k;

  return n;
end $$;


-- Normaliza as sugestões existentes (só origem tasks; as do gestor ficam como ele escreveu)
with canonica as (
  select distinct on (skill_chave(tag)) skill_chave(tag) as chave, tag
    from (select tag, count(*) n from public.skill_tag group by tag) t
   order by skill_chave(tag), n desc, tag
)
update public.skill_tag s
   set tag = c.tag, atualizado_em = now()
  from canonica c
 where s.origem = 'tasks' and skill_chave(s.tag) = c.chave and s.tag <> c.tag;
