begin;
select no_plan();

-- Organizadores e eventos de apoio.
insert into auth.users (id, email) values
 ('41000000-0000-4000-8000-000000000001','alice-convites@example.test'),
 ('41000000-0000-4000-8000-000000000002','bob-convites@example.test');
insert into public.events (id,owner_id,title,starts_at,status) values
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','Chá da Alice', now() + interval '10 days','published'),
 ('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','Chá do Bob', now() + interval '10 days','published'),
 ('42000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000001','Rascunho da Alice', null,'draft'),
 ('42000000-0000-4000-8000-000000000004','41000000-0000-4000-8000-000000000001','Chá já iniciado', now() - interval '1 hour','published');

-- Autorização e validação na emissão do convite.
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select throws_ok($$ select public.create_family_invitation('42000000-0000-4000-8000-000000000002','Família',array['Ana'],null) $$,'42501','EVENT_NOT_FOUND','não emite convite para evento alheio');
select throws_ok($$ select public.create_family_invitation('42000000-0000-4000-8000-000000000003','Família',array['Ana'],null) $$,'P0001','EVENT_NOT_PUBLISHED','não emite convite para evento em rascunho');
select throws_ok($$ select public.create_family_invitation('42000000-0000-4000-8000-000000000004','Família',array['Ana'],null) $$,'P0001','EVENT_NOT_PUBLISHED','não emite convite para evento já iniciado');
select throws_ok($$ select public.create_family_invitation('42000000-0000-4000-8000-000000000001','',array['Ana'],null) $$,'P0001','INVALID_FAMILY','rótulo vazio é rejeitado');
select throws_ok($$ select public.create_family_invitation('42000000-0000-4000-8000-000000000001','Família',array[]::text[],null) $$,'P0001','INVALID_FAMILY','convite sem nomes é rejeitado');
select throws_ok($$ select public.create_family_invitation('42000000-0000-4000-8000-000000000001','Família',array_fill('Nome'::text,array[21]),null) $$,'P0001','INVALID_FAMILY','mais de vinte pessoas é rejeitado');
select throws_ok($$ select public.create_family_invitation('42000000-0000-4000-8000-000000000001','Família',array[''],null) $$,'P0001','INVALID_FAMILY','nome vazio é rejeitado');
select throws_ok($$ select public.create_family_invitation('42000000-0000-4000-8000-000000000001','Família',array['Ana'], now() - interval '1 minute') $$,'P0001','INVALID_INVITATION_EXPIRY','expiração no passado é rejeitada');
select lives_ok($$ select public.create_family_invitation('42000000-0000-4000-8000-000000000001','Família Ana',array['Ana'], now() + interval '1 day') $$,'expiração futura é aceita');
select lives_ok($$ select public.create_family_invitation('42000000-0000-4000-8000-000000000001','Família Sem Prazo',array['Zeca'],null) $$,'expiração nula (link reabrível) é aceita');

-- Convite principal de Alice, usado no restante do arquivo.
do $$
declare r jsonb;
begin
  r := public.create_family_invitation('42000000-0000-4000-8000-000000000001','Família Alice',array['Alice Filha','Alice Filho'],null);
  perform set_config('t.alice_inv_id', r->>'id', false);
  perform set_config('t.alice_token', r->>'token', false);
end $$;
select is((select label from public.invitations where id=current_setting('t.alice_inv_id')::uuid),'Família Alice','convite gravado com o rótulo informado');
select is((select count(*)::integer from public.invitation_people where invitation_id=current_setting('t.alice_inv_id')::uuid),2,'duas pessoas registradas para o convite');
select is((select count(*)::integer from public.rsvps r join public.invitation_people p on p.id=r.person_id where p.invitation_id=current_setting('t.alice_inv_id')::uuid and r.response='pending'),2,'RSVPs iniciam pendentes para cada pessoa');
select set_config('t.alice_person1',(select id::text from public.invitation_people where invitation_id=current_setting('t.alice_inv_id')::uuid order by position limit 1),false);
select ok(current_setting('t.alice_token') ~ '^[0-9a-f]{64}$','token emitido é hexadecimal de 64 caracteres');

-- Isolamento por RLS: organizador B não enxerga o convite de A.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.invitations where id=current_setting('t.alice_inv_id')::uuid),0,'organizador B não lê o convite de A pela RLS');
select is((select count(*)::integer from public.invitation_people where invitation_id=current_setting('t.alice_inv_id')::uuid),0,'organizador B não lê as pessoas do convite de A');
select is((select count(*)::integer from public.rsvps r join public.invitation_people p on p.id=r.person_id where p.invitation_id=current_setting('t.alice_inv_id')::uuid),0,'organizador B não lê os RSVPs do convite de A');
select throws_ok($$ select public.revoke_family_invitation('42000000-0000-4000-8000-000000000001', current_setting('t.alice_inv_id')::uuid) $$,'42501','EVENT_NOT_FOUND','organizador B não revoga convite de evento alheio');

-- Convite de B, usado nos testes de acesso entre convites e eventos.
do $$
declare r jsonb;
begin
  r := public.create_family_invitation('42000000-0000-4000-8000-000000000002','Família Bob',array['Caio'],null);
  perform set_config('t.bob_inv_id', r->>'id', false);
  perform set_config('t.bob_token', r->>'token', false);
end $$;
select set_config('t.bob_person_id',(select id::text from public.invitation_people where invitation_id=current_setting('t.bob_inv_id')::uuid limit 1),false);

-- Funções de sessão de convidado são exclusivas do servidor (service_role).
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select throws_ok($$ select public.exchange_guest_invitation(repeat('0',64),repeat('1',64)) $$,'42501','permission denied for function exchange_guest_invitation','authenticated não chama exchange_guest_invitation diretamente');
select throws_ok($$ select public.get_guest_invitation(repeat('1',64)) $$,'42501','permission denied for function get_guest_invitation','authenticated não chama get_guest_invitation diretamente');
select throws_ok($$ select public.set_guest_rsvp(repeat('1',64),gen_random_uuid(),'yes',1) $$,'42501','permission denied for function set_guest_rsvp','authenticated não chama set_guest_rsvp diretamente');
select throws_ok($$ select public.allow_guest_request(repeat('1',64),repeat('1',64)) $$,'42501','permission denied for function allow_guest_request','authenticated não chama allow_guest_request diretamente');
reset role;
set local role anon;
select throws_ok($$ select public.get_guest_invitation(repeat('1',64)) $$,'42501','permission denied for function get_guest_invitation','anon não chama get_guest_invitation diretamente');
select throws_ok($$ select * from private.guest_sessions $$,'42501','permission denied for schema private','anon não lê sessões de convidado diretamente');
reset role;

-- Nem o próprio service_role lê o schema privado fora das funções: tudo passa pelas rotinas SECURITY DEFINER.
set local role service_role;
select throws_ok($$ select * from private.guest_sessions $$,'42501','permission denied for schema private','service_role não lê guest_sessions fora das funções');
select throws_ok($$ select * from private.invitation_tokens $$,'42501','permission denied for schema private','service_role não lê invitation_tokens fora das funções');

-- Token inválido, expirado e revogado.
select throws_ok($$ select public.exchange_guest_invitation(repeat('0',64),repeat('2',64)) $$,'42501','GUEST_SESSION_INVALID','token desconhecido não abre sessão');
select is((select public.exchange_guest_invitation(
    encode(sha256(convert_to(current_setting('t.alice_token'),'UTF8')),'hex'),
    encode(sha256(convert_to('sessao-alice-1','UTF8')),'hex')
  ) is not null),true,'token válido abre sessão de convidado');
select set_config('t.alice_session', encode(sha256(convert_to('sessao-alice-1','UTF8')),'hex'), false);
select is((select (public.get_guest_invitation(current_setting('t.alice_session'))->>'label')),'Família Alice','sessão válida lê o convite correspondente');

-- Acesso entre convites: sessão de A não altera pessoa do convite de B.
select throws_ok($$ select public.set_guest_rsvp(current_setting('t.alice_session'), current_setting('t.bob_person_id')::uuid, 'yes', 1) $$,'42501','PERSON_NOT_FOUND','sessão de A não altera RSVP de pessoa do convite de B');

-- Conflito de versão e atualização válida.
select throws_ok($$ select public.set_guest_rsvp(current_setting('t.alice_session'), current_setting('t.alice_person1')::uuid, 'yes', 2) $$,'P0001','RSVP_VERSION_CONFLICT','versão desatualizada é rejeitada');
select is((select (public.set_guest_rsvp(current_setting('t.alice_session'), current_setting('t.alice_person1')::uuid, 'yes', 1)->>'response')),'yes','RSVP é atualizado com a versão correta');
select throws_ok($$ select public.set_guest_rsvp(current_setting('t.alice_session'), current_setting('t.alice_person1')::uuid, 'talvez', 2) $$,'P0001','INVALID_RSVP','resposta fora do domínio permitido é rejeitada');

-- Acesso entre eventos: sessão própria do convite de B funciona no seu evento,
-- mas nada nela permite alcançar dados do convite/evento de A (nenhum parâmetro seleciona outro evento).
select set_config('t.bob_session', encode(sha256(convert_to('sessao-bob-1','UTF8')),'hex'), false);
select lives_ok($$ select public.exchange_guest_invitation(
    encode(sha256(convert_to(current_setting('t.bob_token'),'UTF8')),'hex'), current_setting('t.bob_session')) $$,
  'token de B abre sessão no evento de B');
select isnt((select public.get_guest_invitation(current_setting('t.bob_session'))->>'label'),'Família Alice','sessão de B nunca resolve o convite de A');
select throws_ok($$ select public.set_guest_rsvp(current_setting('t.bob_session'), current_setting('t.alice_person1')::uuid, 'yes', 1) $$,'42501','PERSON_NOT_FOUND','sessão de B não altera RSVP de pessoa do convite de A');

-- Revogação invalida sessões já emitidas e o token deixa de abrir novas sessões.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select lives_ok($$ select public.revoke_family_invitation('42000000-0000-4000-8000-000000000001', current_setting('t.alice_inv_id')::uuid) $$,'organizador revoga o próprio convite');
select is((select revoked_at is not null from public.invitations where id=current_setting('t.alice_inv_id')::uuid),true,'revoked_at é gravado');
reset role;
set local role service_role;
select throws_ok($$ select public.get_guest_invitation(current_setting('t.alice_session')) $$,'42501','GUEST_SESSION_INVALID','sessão já emitida deixa de funcionar após revogação');
select throws_ok($$ select public.exchange_guest_invitation(encode(sha256(convert_to(current_setting('t.alice_token'),'UTF8')),'hex'), encode(sha256(convert_to('sessao-alice-2','UTF8')),'hex')) $$,'42501','GUEST_SESSION_INVALID','token revogado não abre nova sessão');

-- Sessão expirada (convite continua válido, mas a sessão emitida já venceu).
do $$
declare v_hash text := encode(sha256(convert_to('sessao-expirada','UTF8')),'hex');
begin
  perform set_config('t.bob_expired_session', v_hash, false);
end $$;
reset role;
insert into private.guest_sessions(session_hash,invitation_id,expires_at)
  values (current_setting('t.bob_expired_session'), current_setting('t.bob_inv_id')::uuid, now() - interval '1 minute');
set local role service_role;
select throws_ok($$ select public.get_guest_invitation(current_setting('t.bob_expired_session')) $$,'42501','GUEST_SESSION_INVALID','sessão expirada é rejeitada mesmo com convite válido');

-- Convite expirado (link com prazo definido que já passou).
reset role;
insert into public.invitations(id,event_id,label,expires_at) values
  ('43000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000002','Família Expirada', now() - interval '1 minute');
insert into private.invitation_tokens(invitation_id,token_hash) values
  ('43000000-0000-4000-8000-000000000001', encode(sha256(convert_to('token-expirado','UTF8')),'hex'));
set local role service_role;
select throws_ok($$ select public.exchange_guest_invitation(encode(sha256(convert_to('token-expirado','UTF8')),'hex'), repeat('9',64)) $$,'42501','GUEST_SESSION_INVALID','convite com prazo vencido não abre sessão');

-- Encerramento do evento: leitura permanece (somente leitura), mas novo RSVP é fechado.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);
select lives_ok($$ select public.transition_event('42000000-0000-4000-8000-000000000002',1,'closed') $$,'organizador encerra o próprio evento');
reset role;
set local role service_role;
select is((select (public.get_guest_invitation(current_setting('t.bob_session'))->>'read_only')::boolean),true,'convite de evento encerrado é somente leitura');
select throws_ok($$ select public.set_guest_rsvp(current_setting('t.bob_session'), current_setting('t.bob_person_id')::uuid, 'yes', 1) $$,'P0001','RSVP_CLOSED','RSVP é recusado após o encerramento do evento');

-- Limitação de tentativas: formato inválido nunca conta como permitido; o limite por IP é respeitado.
select is(public.allow_guest_request('formato-invalido', repeat('1',64)),false,'hash de IP fora do formato é sempre negado');
select is(public.allow_guest_request(repeat('1',64), 'formato-invalido'),false,'hash de credencial fora do formato é sempre negado');
do $$
declare allowed boolean; denied_seen boolean := false; ip text := encode(sha256(convert_to('rate-limit-ip','UTF8')),'hex');
begin
  for i in 1..65 loop
    allowed := public.allow_guest_request(ip, encode(sha256(convert_to('rate-limit-token-'||i,'UTF8')),'hex'));
    if not allowed then denied_seen := true; end if;
  end loop;
  perform set_config('t.rate_limited', denied_seen::text, false);
end $$;
select is(current_setting('t.rate_limited'),'true','limite de 60 requisições por minuto por IP é aplicado');

select * from finish();
rollback;
