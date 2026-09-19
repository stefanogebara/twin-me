# Estado do repositório — TwinMe

> Reescrito por `/intel` em 2026-09-14. Janela: 21 dias (2026-08-24 → 2026-09-14,
> 50 commits). HEAD `23d3260`, branch `main`.
> Reescrito a cada `/intel`. Fonte: o git, não o config.

## O parágrafo

Os últimos 21 dias não foram sobre o gêmeo que já existia — foram sobre um
**segundo produto dentro do mesmo repositório**: um money twin que lê o banco
de verdade. `api/services/money/` nasceu do zero e já tem 30 arquivos —
ledger, calibração PID, projeção, prioris entre usuários, detecção de
recorrência, chat próprio, endereço de e-mail para recibos — com harness de
teste andando junto (`calibration.test.js`, `enableBankingT.test.js`,
`predictions.test.js`, `ledger.test.js`). Ele lê o Santander em produção via
Enable Banking desde ~08-09, parseia os e-mails de alerta do próprio banco
como se fossem alerta de celular, reconcilia Bizum, aceita Revolut como
segundo banco, e virou aba própria no app (`app: one bar on a phone, and
Money is on it`, #322) e no mobile (`mobile: the month screen catches up
with the web`, #342). Em paralelo, dois outros movimentos: **o register
virou a casca de todo o produto** (`design: every page on the live site
takes the register`, #308 — o mesmo sistema medido do Instinct que o
`CLAUDE.md` já documentava para páginas soltas, agora universal, mobile
incluso) e uma **poda de código morto do gêmeo antigo** (pipeline de
formação, `twin_evolution_log`, rota `/api/twin/evolution`) que tira peso sem
tocar o que está vivo. O `/intel` de hoje cedo (PR #343, já mergeado) já
correu atrás disso com seis itens sobre o money twin; esta passada fecha o
que ficou pra trás: o `STATE.md` em si, que não tinha sido reescrito desde
08-24 apesar do produto ter dobrado de escopo.

## O que shipou

- **Money twin, do zero a produção** — `api/services/money/{ledger,
  calibration,projection,predictions,priors,recurring,bizum,nudges,chat,
  inbox}.js` + `feeds/enableBanking.js` + `statements/importer.js`.
  Enable Banking lê o Santander desde ~08-09 (#297 janela); Revolut somado
  como segundo banco (#349). Endereço próprio por usuário para recibos
  (`r-<hex>@in.twinme.me`, #315), que agora também recebe os alertas do
  banco (#324) e lê o Santander pelo texto real de dois tipos de e-mail —
  cartão e conta — corrigindo um caso em que o parser inventava loja a
  partir do rodapé (#340).
- **Calibração e projeção com disciplina de erro medido** — banda que
  aprende com os próprios erros (#326, o PID que a passada de hoje já
  transformou em spike `banda-conformal-pid`), mediana de três leituras
  para o resto do mês (#329), prioris emprestados entre ledgers (#331),
  cada comerciante como sua própria série em vez de uma agregada (#328),
  o twin registrando o que errou sobre si mesmo (#336, #320).
- **O register virou universal** — `design: every page on the live site
  takes the register` (#308) e o mesmo para mobile (#301). As páginas de
  dinheiro e o sign-in foram as primeiras a receber o sistema (#306, #300),
  depois as páginas que esperam (#319), depois tudo.
- **Poda do gêmeo antigo** — pipeline de formação do twin
  (`twinPipelineOrchestrator`, `twinFormationService`,
  `twinEvolutionService`) e seu router `/api/twin/*` retirados por órfãos
  de cliente (#314); `twin_evolution_log` dropada em seguida (#318);
  `GET /api/twin/evolution` já não tinha chamador (#312).
- **Privacidade escrita para bater com o código** — a política agora diz
  que o endereço de recibos é fonte de dado, não só recebedor passivo
  (#341); um "quiet is a feature" (#337) documenta a filosofia de quando o
  twin não fala.

## O que está em voo

- **PRs abertas, por idade:** #302 `design: Cosmos, Presence and the
  Portrait` (draft, 10/09) · #299 `presence: the tables the Presence
  backend needs, rescued from the working tree` (09/09, não-draft) · #278
  `intel: 0 itens novos, 1 divergência nova (2026-09-07)` (draft) · #273
  `intel: 0 itens novos, 2 resolvidos por código (2026-08-31)` (draft) ·
  #272 `Inngest: split the enrichment step, and correct the plan-cap story`
  (26/08) · #267 `fix(prod): stop the three recurring warmup errors`
  (25/08) · #254, retitulada para `fix(ingestion): calendar observations
  cover the user's full local day` (aberta desde 12/08, mais de um mês).
- **Duas passadas de `/intel` anteriores (#273, #278) nunca foram
  mergeadas** — ficaram como draft e a passada de hoje cedo (#343) rodou
  por cima delas, direto de `main`. `seen.jsonl` e `INTEL.md` em `main`
  já estão corretos porque #343 mergeou; #273/#278 são branches órfãs que
  valem um fechamento manual, não conteúdo perdido.
- **Presence** (`.claude/plans/2026-08-27-twinme-presence/`) é um segundo
  produto em gestação, não citado em nenhum lugar do `intel.config.json` —
  camada de comunicação assíncrona entre um idoso e a família via voz
  clonada. Hetero-referente por natureza (a pessoa fala com o gêmeo de
  *outra* pessoa), o que tensiona com a aposta nº1 do config antes mesmo
  de ir ao ar. Ainda é plano + protótipo + uma PR de migração de tabelas;
  não tocou `main`.
- `f22ba2f` registra que `personality_scores` continua vivo (lido por
  outras rotas) mesmo depois da poda do pipeline de formação — nenhuma
  função ficou órfã por engano.

## O que morreu

- Pipeline de formação do twin (`twinPipelineOrchestrator`,
  `twinFormationService`, **`twinEvolutionService`**) e seu router,
  `api/routes/twin-pipeline.js` — órfãos desde que
  `src/hooks/useTwinPipeline.ts` foi deletado (`76d1ec10`), retirados em
  `f22ba2f` (#314, 13/09).
- `twin_evolution_log` — dropada em `b256088` (#318), 0 linhas em produção,
  sem view/function/trigger dependente.
- `GET /api/twin/evolution` — sem chamador desde que
  `EvolutionSection.tsx` morreu em #309; retirada em `7b6cffd` (#312).
- Três arquivos remanescentes da reconstrução de Identity (`de9b306`, #309).

> **Trava de estado, herdada de 08-24:** item de intel que proponha
> ressuscitar reranker, temporal spine, roteador por neurotransmistro ou
> agregador bancário genérico (fora do Enable Banking já em produção) perde
> o eixo Alavanca — medidos e reprovados, ou já superados pelo código.
> **Nova, 2026-09-14:** item que proponha reviver o pipeline de formação do
> twin (`twinFormationService`/`twinEvolutionService`) perde o eixo
> Alavanca — órfão de cliente, retirado em `f22ba2f`/#314/#318/#312.

## Áreas quentes (21 dias)

`api/services/money/store.js` (19) · `src/pages/money/MoneyV2Page.tsx` (16) ·
`src/styles/money-v2.css` (9) · `src/services/api/moneyAPI.ts` (9) ·
`mobile/src/services/moneyApi.ts` (7) · `mobile/src/screens/MonthScreen.tsx`
(7) · `api/routes/money.js` (7) · `tests/api/services/money/*` (múltiplos
arquivos, 4–5 cada). Zero arquivo do gêmeo de memória/reflexão original está
no top-15 — o período inteiro foi money twin + register + limpeza.

## Divergências com o config

Nenhuma foi aplicada sozinha em `bets`/`settled`. `stack` e `platform_deps`
receberam correção mecânica (fato, não juízo) nesta passada — ver
`intel.config.json`.

1. **`settled` — "agregadores bancários estão fora; captura financeira é
   por WhatsApp (4a74a4d6, 2026-06-12)" está contradito pelo código, sem
   ambiguidade.** `api/services/money/feeds/enableBanking.js` lê o
   Santander em produção via agregador desde ~08-09, e #349 soma o
   Revolut como segundo banco. Isso não é mais captura por WhatsApp — é
   Open Banking de verdade, com OAuth de instituição financeira. **Já
   registrado por um analista da passada de hoje cedo em `INTEL.md`**
   ("Um dos analistas raciocinou a partir da linha velha... Cabe ao
   Stefano reabrir e reescrever essa entrada"); este `STATE.md` confirma
   o mesmo fato pelo lado do git, de forma independente. WhatsApp
   continua sendo um canal (recibos, Bizum), só deixou de ser o único.
   **Decisão pendente do Stefano:** reescrever a linha de `settled` para
   refletir os dois canais, ou tratar Enable Banking como exceção
   pontual (só leitura, nunca movimentação) que não invalida o espírito
   original da regra.

2. **`bets` não menciona dinheiro.** Nenhuma das três apostas do config
   fala de finanças pessoais — o money twin é hoje a área mais quente do
   repositório e não tem aposta correspondente. Não é uma violação (nada
   em `bets` proíbe expandir), mas é uma lacuna: se o money twin é a
   aposta de verdade dos últimos 21 dias, vale nomeá-la, mesmo que
   provisória.

3. **`focus_areas` também não cobre dinheiro** — nenhum dos 11 itens toca
   "orçamento", "previsão de gasto" ou "agregação bancária". Enquanto
   isso não for corrigido, o G4 da rubrica (escopo) descarta por
   default qualquer candidato sobre esse tema, mesmo quando ele é
   exatamente o que a passada de hoje mostrou que importa (o item do PID
   conformal só passou porque o `known_gaps` indiretamente sustentava —
   nomeadamente não sustentava; foi aceito porque havia código âncora
   real, não porque `focus_areas` cobria). **Decisão pendente do
   Stefano:** somar "previsão e calibração de gasto pessoal",
   "agregação bancária (Open Banking)" a `focus_areas`.

4. **`known_gaps` não fala de `twinEvolutionService` nem do pipeline de
   formação** — não havia gap registrado sobre eles, e agora não há mais
   código para o gap existir. Nada a fazer aqui além de confirmar que os
   dois spikes abertos que citavam `twinEvolutionService.js` como âncora
   (`pgmem-proveniencia`, `mcb-portao-escrita`) tiveram a âncora marcada
   órfã nesta passada — ver `BACKLOG.md`.

5. **Herdadas de 08-24, ainda não resolvidas pelo Stefano:** `bets[1]`
   (largura de conectores vs. fidelidade medida + profundidade de
   captura), `bets[2]` (processamento local no Tauri, ainda não cobrado
   como copy nem cumprido — `transcribe_wav` continua com
   `#[allow(dead_code)]`), e a zona cinzenta das três rotas públicas sem
   auth (`soul-signature-public.js`, `portfolio-public.js`,
   `og-image.js`). Nenhuma mudou nos últimos 21 dias.
