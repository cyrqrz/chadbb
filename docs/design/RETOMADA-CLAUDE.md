# Retomada do Claude (front) — 2026-09-17, fim da sessão

Sessão encerrada às pressas para trocar de máquina (PC de casa). Tudo o que
importa está **no GitHub**, em três branches. Nada foi perdido.

## Como retomar

1. `cd ~/projetos/chadbb-claude && git fetch origin`
2. `git checkout claude/front && git pull` (traz `746a282`).
3. `npm ci` (Node 22). Docker só é necessário para `test:browser:local` e
   `test:email:local`, que usam a stack do clone do Codex, com
   `npm run functions:serve` aberto lá.
4. Ler `AGENTS.md`, `docs/TAREFAS-AGENTES.md`, `docs/design/PLANO-VISUAL.md`,
   `docs/design/CARDS.md`, `docs/design/G4-PAINEL.md` e este arquivo.

## Onde cada coisa está

| Branch | Commit | O que é | Situação |
|---|---|---|---|
| `claude/front` | `746a282` | Entrar com o código do e-mail, fim da tremida na atualização, datas no iPhone | **PR #14 aberto**, CI verde (só o “Workers Builds”, que já falhava antes, está vermelho). **Falta o merge do usuário** |
| `claude/wip-g4` | `efca345` | **G4**: painel como tela inicial do evento, abas, prévia do convite | Pronto e testado (check ok, e2e 244/244, browser 8/8), **aguardando aprovação**. Base `17d5096`, antes do PR #14 |
| `claude/wip-ausencia` | `56be8f8` | Aviso de ausência com presente reservado + selo no painel, **mais ajustes visuais não revisados** | **WIP.** Ver “Como limpar” abaixo |

Páginas de revisão (privadas):
- G4: https://claude.ai/artifact/J26doK6fi4dgZdhAE3hVqu
- Login com código e tremida: https://claude.ai/artifact/RBG4SZoQQ2QkEtMMhQst3u

## Próximos passos, em ordem

1. **Mergear o PR #14** (login com código). É o mais urgente: sem ele, quem abre
   o link do e-mail em outro navegador (Safari do iPhone) não entra. Depois do
   merge, testar na produção: pedir o código num navegador e digitá-lo em outro,
   ou usar “Já tenho um código”.
2. **G4** (`claude/wip-g4`): trazer a `main` nova, rodar `npm run check`, e2e e
   `test:browser:local`, pedir aprovação e abrir o PR. O QA já revisou e
   aprovou com ressalvas.
3. **Ausência com presente** (`claude/wip-ausencia`): ver abaixo.
4. Depois: **G4b** (lista de presentes com menos caixas, A11–A13) e **G5**
   (estados globais, offline, QA) em 01/10. Congelamento em 05/10; ensaio
   em 02–04/10.

## Como limpar a `claude/wip-ausencia`

O commit mistura duas coisas.

**Revisado e testado** antes dos ajustes visuais (e2e 264/264, browser 8/8):

- `GuestPage.tsx` (`Presence`): quem responde “Não poderá ir” com reserva ativa
  vê um aviso com a lista do que está reservado e escolhe entre “Cancelar
  reserva(s)” e “Manter: vou enviar o presente”. Decisão do usuário: **não
  cancelar sozinho**, porque muita gente não vai e mesmo assim envia o presente.
- `InvitationsPage.tsx`: selo “Vai enviar presente” no card de quem não vai. O
  vínculo é **pelo nome**; o pedido de `invitation_id` nas reservas já está no
  quadro, em “Pedidos do front para o back”.
- Testes: grupo “ausência com presente reservado” em `tests/e2e/guest.spec.ts` e
  um teste em `tests/e2e/panel.spec.ts`.

**Não revisado** (o agente de QA foi interrompido no meio): cartões dos passos
na página inicial (`HomePage.tsx`, `.step-card`, `.step-number`), destaque do
“É convidado?” (`.login-guest`), `.stagger` com `animation … backwards`, e
testes novos em `guest.spec.ts`, `login.spec.ts` e `panel.spec.ts`.
`npm run check` passa, mas **o e2e completo não rodou depois desses ajustes**.

Sugestão: rodar o e2e completo; separar o que passar e fizer sentido num commit
próprio (“visual da página inicial”) e descartar o resto. Depois chamar o agente
`qa-ux` de novo, porque a revisão desta parte não terminou.

## Pendências e avisos

- **Prévia do WhatsApp:** o site entrega as tags certas (conferido com o robô do
  WhatsApp e do Facebook: 200 com `og:title`, `og:description` e `og:image`).
  Quando o cartão não aparece, é porque a mensagem foi encaminhada ou o app não
  buscou o site a tempo. Colar o link e esperar 2–3 s resolve.
- **O evento “cha da liz” está encerrado** na produção, e encerrado não reabre.
  Se era o evento real, é preciso criar e publicar outro.
- **Exclusão de evento** já está publicada (Edge `delete-event`, PR #10 e #11).
  O botão só aparece em evento em rascunho ou encerrado.
- A `codex/back` segue com o back; a comunicação continua pelo quadro
  (`docs/TAREFAS-AGENTES.md`).
