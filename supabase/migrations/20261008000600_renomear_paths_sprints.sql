-- Renomear projeto: as sprints precisam trocar de caminho ANTES dos work items. Senão o
-- trigger que resolve a sprint pelo iteration_path não acha a sprint (ainda com o nome
-- antigo) e as tasks ficam "sem sprint" até a próxima sync de metadados.

create or replace function public.renomear_paths_projeto(p_projeto_id uuid, p_antigo text, p_novo text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update sprint s
     set iteration_path = case
           when s.iteration_path = p_antigo then p_novo
           else p_novo || substr(s.iteration_path, length(p_antigo) + 1) end
   where s.projeto_id = p_projeto_id
     and (s.iteration_path = p_antigo or left(s.iteration_path, length(p_antigo) + 1) = p_antigo || '\');

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
