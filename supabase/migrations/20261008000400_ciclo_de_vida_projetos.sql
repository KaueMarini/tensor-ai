-- Ciclo de vida de projetos, times e membros vindos do Azure DevOps.
--  - Projeto excluído no DevOps → arquivado aqui (deleted_at), com work items e sprints
--    em soft delete e membros inativos: some do app e da carga global. Se o projeto for
--    restaurado no DevOps, a sync reativa e refaz a carga completa.
--  - Projeto renomeado → os caminhos (iteration/area path) dos work items acompanham.
--  - Membro removido do time → já ficava ativo=false; agora as views respeitam isso.
--  - Tags do projeto (linha "Tags: a, b" na descrição do DevOps) → tags_requeridas.

alter table public.projeto add column if not exists deleted_at timestamptz;

create or replace function public.arquivar_projeto(p_projeto_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update projeto set deleted_at = now(), atualizado_em = now()
   where id = p_projeto_id and deleted_at is null;
  update work_item set deleted_at = now()
   where projeto_id = p_projeto_id and deleted_at is null;
  update sprint set deleted_at = now()
   where projeto_id = p_projeto_id and deleted_at is null;
  update time_membro tm set ativo = false
    from time t
   where t.id = tm.time_id and t.projeto_id = p_projeto_id and tm.ativo;
end $$;

-- "Velho\Sprint 1" → "Novo\Sprint 1" (o DevOps renomeia os caminhos sem gerar revisão)
create or replace function public.renomear_paths_projeto(p_projeto_id uuid, p_antigo text, p_novo text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update work_item w
     set iteration_path = case
           when w.iteration_path = p_antigo then p_novo
           when left(w.iteration_path, length(p_antigo) + 1) = p_antigo || '\'
             then p_novo || substr(w.iteration_path, length(p_antigo) + 1)
           else w.iteration_path end,
         area_path = case
           when w.area_path = p_antigo then p_novo
           when left(w.area_path, length(p_antigo) + 1) = p_antigo || '\'
             then p_novo || substr(w.area_path, length(p_antigo) + 1)
           else w.area_path end
   where w.projeto_id = p_projeto_id
     and (w.iteration_path = p_antigo or left(w.iteration_path, length(p_antigo) + 1) = p_antigo || '\'
          or w.area_path = p_antigo or left(w.area_path, length(p_antigo) + 1) = p_antigo || '\');
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.arquivar_projeto(uuid), public.renomear_paths_projeto(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.arquivar_projeto(uuid), public.renomear_paths_projeto(uuid, text, text)
  to service_role;

-- Views: sem projetos arquivados e sem membros removidos dos times
create or replace view public.v_projeto_resumo with (security_invoker = true) as
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
       ss.fase as sync_fase,
       p.tags_requeridas as tags
  from public.projeto p
  left join public.sync_state ss on ss.projeto_id = p.id
 where p.deleted_at is null;

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
  join public.time_membro tm on tm.pessoa_id = p.id and tm.ativo
  join public.time t on t.id = tm.time_id
  join public.projeto pr on pr.id = t.projeto_id and pr.deleted_at is null
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

create or replace view public.v_sem_dono_resumo with (security_invoker = true) as
select pr.id as projeto_id,
       pr.nome as projeto_nome,
       count(*)::integer as tasks,
       coalesce(sum(coalesce(w.horas_restantes, w.horas_estimadas, 0)), 0) as horas
  from public.work_item w
  join public.projeto pr on pr.id = w.projeto_id and pr.deleted_at is null
 where w.deleted_at is null
   and w.responsavel_id is null
   and w.tipo not in ('Feature', 'Epic')
   and w.estado not in ('Closed', 'Done', 'Removed', 'Resolved', 'Completed')
   and not exists (select 1 from public.work_item c where c.parent_devops_id = w.devops_id and c.deleted_at is null)
 group by pr.id, pr.nome;
