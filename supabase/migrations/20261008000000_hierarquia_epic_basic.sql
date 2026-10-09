create or replace function public.feature_ancestral(p_devops_id integer)
returns integer language sql stable as $$
  with recursive sobe as (
    select w.devops_id, w.tipo, w.parent_devops_id, 1 as nivel
      from public.work_item w
     where w.devops_id = (select parent_devops_id from public.work_item where devops_id = p_devops_id)
    union all
    select w.devops_id, w.tipo, w.parent_devops_id, s.nivel + 1
      from public.work_item w
      join sobe s on w.devops_id = s.parent_devops_id
     where s.tipo <> 'Feature' and s.nivel < 10
  )
  select devops_id from sobe
   where tipo in ('Feature', 'Epic')
   order by (tipo = 'Feature') desc, nivel
   limit 1;
$$;

create or replace view public.v_backlog with (security_invoker = true) as
select t.projeto_id,
       coalesce(t.sprint_id, f.sprint_id)      as sprint_id,
       s.nome as sprint_nome, s.inicio as sprint_inicio, s.fim as sprint_fim,
       f.devops_id as feature_id, f.titulo as feature_titulo, f.estado as feature_estado,
       t.devops_id as item_id, t.tipo as item_tipo, t.titulo as item_titulo,
       t.estado as item_estado, t.parent_devops_id as item_parent_id,
       t.responsavel_id, p.nome as responsavel_nome,
       t.horas_estimadas, t.horas_restantes, t.horas_concluidas, t.horas_origem, t.tags,
       (t.horas_estimadas is null and t.horas_restantes is null and t.horas_concluidas is null)
         as sem_estimativa,
       t.atualizado_em
  from public.work_item t
  left join public.work_item f on f.devops_id = t.feature_devops_id and f.deleted_at is null
  left join public.sprint s on s.id = coalesce(t.sprint_id, f.sprint_id)
  left join public.pessoa p on p.id = t.responsavel_id
 where t.deleted_at is null and t.tipo not in ('Feature','Epic')
union all
select f.projeto_id, f.sprint_id, s.nome, s.inicio, s.fim,
       f.devops_id, f.titulo, f.estado,
       null, null, null, null, null, null, null, null, null, null, null, null, null,
       f.atualizado_em
  from public.work_item f
  left join public.sprint s on s.id = f.sprint_id
 where f.deleted_at is null
   and (
     (f.tipo = 'Feature'
       and not exists (select 1 from public.work_item c
                        where c.feature_devops_id = f.devops_id and c.deleted_at is null))
     or
     (f.tipo = 'Epic'
       and not exists (select 1 from public.work_item c
                        where c.parent_devops_id = f.devops_id and c.deleted_at is null))
   );

select public.recompute_hierarquia(array(select devops_id from public.work_item));
