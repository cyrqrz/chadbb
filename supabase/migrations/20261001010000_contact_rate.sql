-- Formulário de contato (01/10): a Edge `contact` usa as mesmas cotas por minuto do
-- convidado, com limites próprios. Por rede: 3 mensagens por minuto; no total: 30.
-- As demais chaves seguem como em 20260911060000.
create or replace function public.check_guest_rate(p_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare amount integer; start_at timestamptz := date_trunc('minute',clock_timestamp());
begin
  delete from private.guest_rate where window_start < start_at-interval '5 minutes';
  insert into private.guest_rate(key_hash,window_start,requests) values(encode(sha256(convert_to(p_key,'UTF8')),'hex'),start_at,1)
  on conflict(key_hash) do update set window_start=start_at,
    requests=case when guest_rate.window_start=start_at then guest_rate.requests+1 else 1 end
  returning requests into amount;
  return amount <= case when p_key='global' then 2400 when p_key like 'ip:%' then 1200
    when p_key='contact-global' then 30 when p_key like 'contact:%' then 3 else 120 end;
end;
$$;
