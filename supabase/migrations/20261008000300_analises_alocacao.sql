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
       t.atualizado_em,
       coalesce(f.tags, '{}') as feature_tags
  from public.work_item t
  left join public.work_item f on f.devops_id = t.feature_devops_id and f.deleted_at is null
  left join public.sprint s on s.id = coalesce(t.sprint_id, f.sprint_id)
  left join public.pessoa p on p.id = t.responsavel_id
 where t.deleted_at is null and t.tipo not in ('Feature','Epic')
union all
select f.projeto_id, f.sprint_id, s.nome, s.inicio, s.fim,
       f.devops_id, f.titulo, f.estado,
       null, null, null, null, null, null, null, null, null, null, null, null, null,
       f.atualizado_em,
       coalesce(f.tags, '{}')
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

create or replace view public.v_sem_dono_resumo with (security_invoker = true) as
select pr.id as projeto_id,
       pr.nome as projeto_nome,
       count(*)::integer as tasks,
       coalesce(sum(coalesce(w.horas_restantes, w.horas_estimadas, 0)), 0) as horas
  from public.work_item w
  join public.projeto pr on pr.id = w.projeto_id
 where w.deleted_at is null
   and w.responsavel_id is null
   and w.tipo not in ('Feature', 'Epic')
   and w.estado not in ('Closed', 'Done', 'Removed', 'Resolved', 'Completed')
   and not exists (select 1 from public.work_item c where c.parent_devops_id = w.devops_id and c.deleted_at is null)
 group by pr.id, pr.nome;
