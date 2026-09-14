# Execução do MVP familiar

Início: 2026-09-11. Autorização: planejar e executar o caminho do MVP.
Escopo vigente: fraldas P 6 / M 19 / G 19 / XG 6 pacotes; mimos sem limite;
convites individuais e familiares; presença e painel atualizados.

## Ordem de execução

1. Consolidar alterações existentes e concluir catálogo/lista em duas categorias.
2. Implementar convites, sessão de convidados e presença individual/familiar.
3. Implementar reservas e cancelamentos transacionais, com quantidades independentes.
4. Integrar páginas do convidado e painel, com acessibilidade e atualização periódica.
5. Validar banco, API, navegador e registrar resultados e bloqueios de implantação.

A aplicação será validada localmente com dados fictícios. A entrega externa ainda
exige configuração do ambiente do evento, e-mail e ensaio
com a família. Não considerar a liberação concluída apenas com testes locais.

## Continuação — 2026-09-14

Chá de bebê da Liz em **01/11/2026 às 12h**, horário de Brasília; confirmação
solicitada no convite até **18/10/2026**. Endereço, telefone e instruções foram
extraídos da imagem recebida e preparados em arquivo privado fora da árvore do
projeto, sem publicar a imagem original como capa. Ela contém dados privados e
uma indicação fixa de tamanho que não corresponde à seleção dinâmica do site.
O nome do responsável pelo suporte ainda não foi informado.

Regra esclarecida: os limites P 6 / M 19 / G 19 / XG 6 são globais por tamanho,
para equilibrar os pacotes. Não há cota comercial adicional por convite. Mimos
continuam opcionais conforme as decisões expressas na conversa. A confirmação
até 18/10 está registrada no conteúdo; não existe bloqueio automático por essa
data no schema atual (o encerramento continua sendo ação do organizador).

Avanço M4: testes adicionais comprovam todos os tamanhos no mesmo convite,
esgotamento compartilhado, cancelamento idempotente concorrente, reserva contra
redução de cota e reserva contra encerramento. PostgreSQL portátil: 46 testes.

Avanço M5: abertura de outro convite na mesma aba agora troca a sessão e ignora
resposta anterior atrasada; o fragmento inválido limpa a apresentação anterior.
A promessa fica na montagem da página, sem cache global de credenciais. O link
de pular para o conteúdo continua funcionando. Ensaio de resposta HTTP perdida
após commit confirma recuperação usando a mesma chave, sem duplicação.

Paleta rosa inspirada no convite; ajuste de quebra de texto, espaçamento de
cartões e largura mínima para 320 px com fonte a 200%. Testes automatizados de
teclado e axe nas áreas Presença, Fraldas e Mimos. Essas verificações não substituem
leitor de tela manual, navegador interno do WhatsApp ou aceite do irmão.

Validação local deste avanço: `npm run check` (40 testes unitários), 46 testes
PostgreSQL portátil, seis cenários de navegador real e 16 E2E aprovados.

Próxima etapa M6: seguir o [roteiro de entrega](ENTREGA-E-SUPORTE.md), com ambiente
separado, login real por e-mail, restauração e ensaio com a família. Nenhum dado
real foi cadastrado/publicado e nenhum banco remoto foi alterado neste avanço.

Projeto remoto criado em 2026-09-14: **chadbb-cha**, ref `fcykqrlnofmdtmewlejr`,
organização `chadbb` (`zfzzahtvvtmuogmatolo`), região **São Paulo (`sa-east-1`)**,
exclusivo do chá e separado de desenvolvimento e preview. A senha do banco fica
apenas na máquina do titular, fora do repositório. Nenhuma migration, função ou
configuração de Auth foi aplicada ainda. O responsável pelo suporte continua
pendente: `[nome]` era um exemplo, não uma resposta.
