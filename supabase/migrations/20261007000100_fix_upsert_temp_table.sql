-- upsert_work_items: permite várias chamadas na mesma transação (tabela temporária já existente)
create or replace function public.upsert_work_items(p_items jsonb, p_origem text)
returns table (devops_id integer, aplicado boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_aplicados integer[];
begin
  drop table if exists _wi;
  create temp table _wi on commit drop as
  select distinct on (x.devops_id) x.*
    from jsonb_to_recordset(p_items) as x(
      devops_id integer, rev integer, projeto_id uuid, tipo text, estado text, titulo text,
      descritivo text, parent_devops_id integer, responsavel_devops_id uuid,
      responsavel_nome text, responsavel_unique_name text, area_path text, iteration_path text,
      horas_estimadas numeric, horas_restantes numeric, horas_concluidas numeric,
      start_date timestamptz, finish_date timestamptz, target_date timestamptz,
      tags text[], changed_date timestamptz, fields jsonb)
   order by x.devops_id, x.rev desc;

  insert into pessoa (devops_user_id, nome, unique_name)
  select distinct on (responsavel_devops_id) responsavel_devops_id,
         coalesce(responsavel_nome, responsavel_unique_name, 'Sem nome'), responsavel_unique_name
    from _wi where responsavel_devops_id is not null
  on conflict (devops_user_id) do update
     set nome = excluded.nome, unique_name = excluded.unique_name
   where pessoa.nome is distinct from excluded.nome
      or pessoa.unique_name is distinct from excluded.unique_name;

  with up as (
    insert into work_item as w (
      devops_id, rev, projeto_id, tipo, estado, titulo, descritivo, parent_devops_id,
      responsavel_id, area_path, iteration_path, horas_estimadas, horas_restantes,
      horas_concluidas, start_date, finish_date, target_date, tags, changed_date,
      fields, sync_origem, deleted_at)
    select i.devops_id, i.rev, i.projeto_id, i.tipo, i.estado, coalesce(i.titulo, ''), i.descritivo,
           i.parent_devops_id, p.id, i.area_path, i.iteration_path, i.horas_estimadas,
           i.horas_restantes, i.horas_concluidas, i.start_date, i.finish_date, i.target_date,
           coalesce(i.tags, '{}'), i.changed_date, coalesce(i.fields, '{}'), p_origem, null
      from _wi i
      left join pessoa p on p.devops_user_id = i.responsavel_devops_id
    on conflict on constraint work_item_pkey do update set
      rev = excluded.rev, projeto_id = excluded.projeto_id, tipo = excluded.tipo,
      estado = excluded.estado, titulo = excluded.titulo, descritivo = excluded.descritivo,
      parent_devops_id = excluded.parent_devops_id, responsavel_id = excluded.responsavel_id,
      area_path = excluded.area_path, iteration_path = excluded.iteration_path,
      horas_estimadas = excluded.horas_estimadas, horas_restantes = excluded.horas_restantes,
      horas_concluidas = excluded.horas_concluidas, start_date = excluded.start_date,
      finish_date = excluded.finish_date, target_date = excluded.target_date,
      tags = excluded.tags, changed_date = excluded.changed_date, fields = excluded.fields,
      sync_origem = excluded.sync_origem, deleted_at = null
    where w.rev < excluded.rev
       or (w.rev = excluded.rev and w.deleted_at is not null)
    returning w.devops_id
  )
  select array_agg(up.devops_id) into v_aplicados from up;

  if v_aplicados is not null then
    perform recompute_hierarquia(v_aplicados);
  end if;

  return query
  select i.devops_id, i.devops_id = any(coalesce(v_aplicados, '{}')) from _wi i;
end $$;

