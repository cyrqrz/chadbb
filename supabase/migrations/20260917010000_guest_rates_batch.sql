-- T-B5: a Edge guest fazia uma ida ao PostgREST por cota (ip, credencial, global)
-- antes da ação. Esta função confere as três na mesma ordem e com a mesma regra
-- de check_guest_rate, numa única chamada. A ação continua em outra transação:
-- juntá-la aqui manteria a linha da cota global bloqueada durante toda a ação
-- (fila entre todos os convidados) e desfaria a contagem quando a ação falhasse.
create function public.check_guest_rates(p_keys text[]) returns boolean
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if p_keys is null or cardinality(p_keys) not between 1 and 3 or array_position(p_keys, null) is not null then
    raise exception 'INVALID_RATE_KEYS' using errcode = '22023';
  end if;
  foreach k in array p_keys loop
    -- Recusa retorna false (não lança) para a contagem persistir; as cotas seguintes não são consumidas.
    if not public.check_guest_rate(k) then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.check_guest_rates(text[]) from public, anon, authenticated, service_role;
grant execute on function public.check_guest_rates(text[]) to service_role;
