# Execução da base — 2026-09-09

Registro histórico da primeira entrega. Avanços posteriores de implementação e
validação estão em [execução do organizador](EXECUCAO-ORGANIZADOR.md).

Escopo desta entrega: primeira execução sugerida pelo plano, com contrato inicial,
frontend executável e preparação de ambiente e CI. Não equivale ao MVP completo.

## Entregas

- P0.1–P0.3: stack adotada, jornadas e classificação de dados no contrato do piloto.
- P0.5: decisões abertas com proposta, papel responsável e marco de resolução.
- P1.1–P1.2: React/Vite/TypeScript, Tailwind, Router, Query e estrutura inicial.
- P1.4: exemplo de ambiente público, ignores e validação de configuração.
- P1.3 parcial: CLI/config local e migration inicial; seed reservado até etapa 2.
  Região remota e execução local de banco pendentes.
- P1.5 parcial: workflow CI e comandos locais; testes de configuração e SQL de
  permissões. Execução remota de CI e migration em banco limpo ainda pendentes.
- P1.6 parcial: instruções Pages, fallback SPA e cabeçalhos estáticos; deploy
  de preview ainda pendente.

## Verificação

Node 22 instalado temporariamente em `/tmp/chadbb-node` para verificar nesta
sessão (o ambiente tinha npm do Windows, sem Node Linux no PATH). Para outras
sessões, instalar Node Linux conforme README; a pasta temporária não é requisito
do projeto e não está versionada.

- Instalação de dependências e lockfile: concluída; auditoria npm sem vulnerabilidades.
- ESLint, checagem TypeScript e build: aprovados.
- Vitest: 10 testes de configuração pública aprovados, incluindo rejeição de
  URLs inadequadas e de tipos de credencial não publicáveis.
- Supabase CLI: inicialização e reconhecimento dos comandos locais verificados.
- `npm run db:start`: falhou com `LegacyDockerLifecycleInspectError`;
  Docker indisponível nesta distribuição WSL. Migrations e pgTAP **não executados**.
- CI remota, deploy, inspeção visual em navegador e teste móvel **não executados**.

Não há dados pessoais nem credenciais reais configurados. A validação de
configuração do frontend não substitui a proteção de segredos no ambiente de build.

## Próxima entrega e marcos pendentes

Habilitar Docker no WSL e executar `npm run db:start`, `npm run db:reset` e
`npm run db:test`; confirmar workflow CI no remoto e preparar preview com acesso
às contas. Esses passos fecham as evidências restantes do marco M1.
A próxima implementação de domínio é a etapa 2: Auth do organizador, eventos,
RLS, imagens e testes com dois proprietários. Decisões de RSVP/sessões seguem
abertas até o marco previsto; não há parceiro habilitado nem liberação do piloto.
