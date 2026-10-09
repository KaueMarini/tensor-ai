grant execute on function public.registrar_auditoria(text, text, jsonb, uuid, text, text) to service_role;
grant execute on function public.expurgo_lgpd() to service_role;
grant execute on function public.esquecer_pessoa(uuid), public.esquecer_usuario(uuid) to service_role;
