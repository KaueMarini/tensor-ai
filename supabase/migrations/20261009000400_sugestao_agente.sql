alter table public.sugestao drop constraint if exists sugestao_status_check;
alter table public.sugestao add constraint sugestao_status_check
  check (status in ('pendente', 'aplicada', 'ignorada', 'expirada'));
