-- G4: executar apenas após revisão do diff, segredos configurados e Edge publicada.
-- Não contém nem imprime segredo; o Vault deve ter sido configurado separadamente.
begin;
do $$ begin
  if not exists(select 1 from vault.decrypted_secrets where name='rsvp_cron_secret' and length(decrypted_secret)>=32)
    or not exists(select 1 from vault.decrypted_secrets where name='project_url') then
    raise exception 'RSVP_VAULT_NOT_CONFIGURED';
  end if;
end $$;
select cron.schedule('rsvp-reminders','*/15 * * * *','select private.invoke_rsvp_reminders()');
commit;
