# Estado do repositório — TwinMe

> Reescrito pela passada do `/intel` de 2026-09-21. Janela: 28 dias
> (2026-08-24 → 2026-09-21, 50 commits em `main`). HEAD `9460cc7`, branch `main`.
> Reescrito a cada `/intel`. Fonte: o git, não o config.

## O parágrafo

Os últimos 28 dias não foram sobre o gêmeo — foram sobre **decidir que o dinheiro é o
produto e provar isso em produção**. `CLAUDE.md` foi reescrito em 19/09 ("TwinMe Money is
the product... everything under 'the twin' is secondary"), e o código seguiu: `/`, `/home`,
`/dashboard` e o pós-OAuth agora levam a `/money` (D3/OW1), e em 20/09 Stefano decidiu D1 —
o gêmeo legado foi **estacionado em produção** (`LEGACY_TWIN_ENABLED=false`; dez crons
respondem 200 e não fazem nada). No lugar dele: onze rodadas de um harness de chat
adversarial (`chatScenarios.js`, 65+ cenários, um juiz) que consertaram janela de tempo,
figura da semana, reconciliação visível, aluguel por Bizum, janela de devolução em recibo —
cada rodada com o que quebrou e o que mudou, registrado em `PROGRESS.md`. Em paralelo,
infraestrutura: um *loop* agêntico (triagem → implementa → inspeciona, em GitHub Actions,
nunca escreve no ledger) foi construído e ensaiado ponta a ponta; cobertura de código virou
piso de CI; todo request ao Supabase ganhou prazo de 25s depois de um travamento de 16
minutos. E o Codex avançou uma frente nova, "Presence" (um orb com voz, WhatsApp, uma
landing própria), com dois PRs ainda abertos. `intel.config.json` não foi editado ainda —
seu `one_line` e seus três `bets` continuam falando do gêmeo digital como o produto.

## O que shipou

- **Money first, de fato** (`783bc68d`, D3/OW1) — `/`, `/home`, `/dashboard`, pós-sign-in e
  pós-OAuth caem em `/money`; pinado por `money-first.goal.test.js`.
- **O gêmeo legado estacionado** (D1, decidido por Stefano 20/09; `LEGACY_TWIN_ENABLED=false`
  em produção) — medido antes de parar: 34 memórias de chat por 2 usuários em 30 dias contra
  3.214 reflexões e 160 insights proativos gerados por crons no mesmo período; $3,18/30 dias
  em DeepSeek quase inteiro gasto refletindo sobre ninguém.
  > **Trava de estado:** item de intel que proponha reviver o gêmeo legado (reflexões,
  > insights proativos, os dez crons parados) sem uma medição nova de uso perde o eixo
  > Alavanca — foi medido e estacionado aqui, com números.
- **Onze rodadas de chat curado contra cenários reais** (`#450`–`#468`, `chatScenarios.js`
  65+ cenários) — janelas de tempo em três idiomas (`windows.js`), figura da semana desenhada
  em código, reconciliação visível por linha (`seen.js`, "visto pelo banco e o celular"),
  aluguel por Bizum recorrente (`bizum.js`), janela de devolução de recibo (`returns.js`),
  timeout de 50s com oferta de "not mine" sempre anexada, entradas tipadas contra injeção
  (`inject-eval.mjs`: instrução de comerciante obedecida 0/6 depois da correção), oferta de
  setup como ação do chat em vez de página.
- **Ciclos de dependência do money quebrados** (M2-1, `#432`) — `factsRepository.js` +
  `forecastService.js` isolam `store.js` de `calendar.js`/`predictions.js`; `madge --circular`
  em 0; `store.js` caiu de 1.237 para 1.108 linhas.
- **Uma leitura por página, cache por revisão de ingestão** (M2-3, `#434`) — `GET
  /api/money/page` lê as onze partes uma vez; produção medida: Today pinta em 0,9–3,2s morno
  (era 13–19s).
- **O loop agêntico ensaiado ponta a ponta** (M2-6, `#442`–`#448`) — triagem → implementa
  (Claude Code headless, `$5` de teto, `guard.mjs` recusa qualquer mudança em tabela do
  ledger, cron, schema ou `.env`) → inspeciona (modelo fresco aprova ou pede trabalho); nunca
  faz merge sozinho. Primeira PR real (`#444`) aprovada e mergeada.
- **Higiene de infraestrutura** — piso de cobertura em CI (65/58/52/61%, M0-1); `strict:
  true` em `src/pages/money/**` (M3-1); um cliente Redis só (M3-3, achou um rate limiter que
  nunca usava o Redis compartilhado); ensaio de restore de backup antes de migration que toca
  o ledger (M0-4); prazo de 25s em todo request Supabase depois de um travamento de 16 min em
  produção (21/09).
- **Cinco ideias dos scouts de 19/09, construídas** — reconciliação visível, cobrança que
  "ainda cabe" antes de acontecer, janela de devolução, aluguel por Bizum, "noventa segundos"
  de revisão sem veredito pronto (`#438`).

## O que está em voo

- **PRs abertos, dois ativos:** `#453` presence/people-wipe (20/09), `#435` presence/ux
  (19/09) — frente do Codex, ainda sem leitura cruzada com este estado.
- **PRs abertos, provavelmente abandonados** (nenhum commit em cima há mais de 3 semanas):
  `#418` eval de custo de leitura de página (17/09), `#302` design Cosmos/Presence/Portrait
  (10/09, draft), `#299` migrations do Presence (09/09), `#273` e **`#350` são passadas de
  `/intel` anteriores que nunca foram mergeadas** (31/08 e 14/09, ambas draft) — o STATE.md
  que este arquivo substitui nunca refletiu o trabalho dessas duas passadas; `seen.jsonl` em
  `main` pode estar sem os itens que elas viram. `#272` (26/08) e `#267` (25/08) também
  seguem abertos sem atividade recente. Vale uma triagem de limpeza de branches — não feita
  aqui, fora do escopo desta passada.
- **Presence** (Codex) é uma frente nova não documentada em `CLAUDE.md`: um orb com voz
  (ElevenLabs), uma landing própria de seis páginas, chamada web chegando por WhatsApp,
  camada de segurança e "as pessoas ao redor dela" (`#427`, `#429`, `#433` já mergeados).
  Relação com "money first" ainda não está escrita em lugar nenhum.
- **Aberto para Stefano em `PROGRESS.md`:** M1-4 (fail-closed no logout se Redis cair),
  rótulo do número do dia ("estimativa" vs "orçamento sustentável"), orçamento de palavras de
  Today (mede 285, o registro pede ~150), token de push dedicado para o loop.
- **`intel.config.json` não foi tocado pela mudança de estratégia** — ver Divergências.

## O que morreu

- **`test/`, `ml/` (incluindo `ml/gnn_model.py`), `context/`, `screenshots/`** — deletados
  (QW5, `ba89498a`); `mobile/node_modules` nunca esteve rastreado, regra de ignore
  acrescentada.
- **O pacote `redis` como segunda conexão** — M3-3 (`#434`); um rate limiter tinha seu próprio
  cliente Redis que nenhum limiter jamais usava.
- **`--legacy-peer-deps`** — M3-5 (`#434`); a única causa era `lovable-tagger`, plugin da era
  Lovable pedindo Vite 5 contra Vite 7; removido.
- **Retry de teste (`--retry=2`) na suíte noturna** — a caminho de sair (M0-2); dez noites
  verdes em `--retry=0` são o critério, ainda em contagem.
- **Dez crons do gêmeo legado, sem serem apagados** — não morreram, foram **estacionados**
  (D1): respondem 200 e não fazem nada. Ver trava de estado acima.

## Áreas quentes

`docs/roadmap/PROGRESS.md` (29, o tracker vive aqui) · `api/services/money/chat.js` (17) ·
`tests/api/services/money/chatScenarios.js` (12) ·
`tests/api/services/money/chat.test.js` (11) · `tests/goals/README.md` (10) ·
`tests/api/services/money/persistence.integration.test.js` (8) ·
`api/services/money/store.js` (8) · `src/lib/i18n/{pt-BR,es}.money.ts` (7 cada) ·
`api/services/money/windows.js` + seu teste (6) · `src/services/api/moneyAPI.ts` (6) ·
`src/App.tsx` (6). Zero arquivos do gêmeo legado no top-25 — só `App.tsx` (roteamento) o
toca, para tirar rota dele do caminho.

## Divergências com o config

1. **`one_line` e os três `bets` descrevem um produto que o próprio `CLAUDE.md` já
   não descreve.** `one_line` diz "Gêmeo digital auto-referente... revela sua soul
   signature"; `CLAUDE.md` diz, desde 19/09, "TwinMe Money is the product... everything
   under 'the twin' is secondary... a candidate for parking". Isso não é interpretação — é
   o texto canônico do projeto tendo mudado sob o config. Os três `bets` (auto-referente,
   profundidade de conectores, Tauri local) são todos sobre o gêmeo; nenhum menciona
   dinheiro, PSD2, reconciliação ou previsão, que é onde 100% dos commits desta janela
   foram. **Decisão pendente do Stefano:** reescrever `one_line` e acrescentar (não
   substituir, a regra deste arquivo proíbe) um quarto bet sobre o money twin, ou manter os
   bets do gêmeo como aposta de longo prazo enquanto o money twin é tratado como produto
   tático? A pergunta de 24/08 sobre o fosso (largura de conectores vs. fidelidade medida)
   segue sem resposta e agora tem uma terceira opção: nem uma nem outra, o fosso virou
   dinheiro.

2. **`settled` pode ganhar uma linha que o git prova sem ambiguidade: money first é fato
   em produção, não intenção.** `/`, `/home`, `/dashboard`, pós-sign-in e pós-OAuth levam a
   `/money` (pinado por teste); `LEGACY_TWIN_ENABLED=false` está em produção desde 20/09 com
   a decisão escrita em `PROGRESS.md` ("D1: decided yes... Stefano, 2026-09-20"). Isto foi
   **acrescentado** ao `settled` nesta passada (permitido pela regra: fato inequívoco do
   git); nenhuma linha existente foi editada ou removida.

3. **`settled` ainda diz "captura financeira é por WhatsApp" (`4a74a4d6`, 2026-06-12) — e
   segue falso.** Já sinalizado nas passadas de 14/09 e 21/09 (Em aberto, INTEL.md): a
   captura é Enable Banking (PSD2) em produção desde 08/09, upload de extrato e um endereço
   de e-mail de recibos. Nenhuma linha nova de código mudou isso nesta janela; repetido aqui
   porque o `settled` do config continua sem correção e a regra deste arquivo é nunca deixar
   isso viver só numa passada anterior.

4. **`known_gaps` sobre o dia (ruído de ~22 EUR, 53% dos dias em zero; banda em 67% onde
   deveria 80%) seguem intocados por código nesta janela.** O spike `dia-hurdle` e
   `banda-conformal-pid` (`BACKLOG.md`) continuam "aberto" — nenhum commit em `calibration.js`
   fora dos já contados em passadas anteriores. Não é divergência nova, é confirmação de que
   o gap descrito ainda é o gap real.
